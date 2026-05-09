import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import ApiKey

PREFIX = "sk-sesame-"
KEY_CACHE: dict[str, dict] = {}  # key_hash -> {key_id, user_id, allowed_models, max_qpm, expire_ts}


def generate_key() -> tuple[str, str, str]:
    """Returns (full_key, key_hash, key_prefix)."""
    raw = secrets.token_hex(16)
    full_key = f"{PREFIX}{raw}"
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    key_prefix = full_key[:12] + "****"
    return full_key, key_hash, key_prefix


async def create_api_key(
    db: AsyncSession,
    user_id: str,
    name: str | None,
    allowed_models: list[str] | None,
    max_qpm: int,
    expire_days: int | None,
) -> tuple[str, ApiKey]:
    from app.crypto import encrypt

    full_key, key_hash, key_prefix = generate_key()
    expire_at = None
    if expire_days:
        expire_at = datetime.now(timezone.utc) + timedelta(days=expire_days)

    api_key = ApiKey(
        key_hash=key_hash,
        key_encrypted=encrypt(full_key),
        key_prefix=key_prefix,
        name=name,
        user_id=user_id,
        allowed_models=",".join(allowed_models) if allowed_models else None,
        max_qpm=max_qpm,
        is_active=True,
        expire_at=expire_at,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    _cache_key(api_key)
    return full_key, api_key


async def get_user_keys(db: AsyncSession, user_id: str) -> list[ApiKey]:
    result = await db.execute(
        select(ApiKey).where(ApiKey.user_id == user_id).order_by(ApiKey.created_at.desc())
    )
    return list(result.scalars().all())


async def get_all_keys(db: AsyncSession, limit: int | None = None, offset: int = 0) -> list[ApiKey]:
    q = select(ApiKey).order_by(ApiKey.created_at.desc()).offset(offset)
    if limit is not None:
        q = q.limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())

async def count_all_keys(db: AsyncSession) -> int:
    from sqlalchemy import func
    result = await db.execute(select(func.count()).select_from(ApiKey))
    return result.scalar_one()


async def update_api_key(db: AsyncSession, key_id: int, user_id: str | None, **kwargs) -> bool:
    q = update(ApiKey).where(ApiKey.id == key_id)
    if user_id:
        q = q.where(ApiKey.user_id == user_id)
    values = {k: v for k, v in kwargs.items() if v is not None}
    if not values:
        return True
    if "allowed_models" in values and isinstance(values["allowed_models"], list):
        values["allowed_models"] = ",".join(values["allowed_models"])
    await db.execute(q.values(**values))
    await db.commit()
    _invalidate_cache(key_id)
    return True


async def delete_api_key(db: AsyncSession, key_id: int, user_id: str | None) -> bool:
    q = select(ApiKey).where(ApiKey.id == key_id)
    if user_id:
        q = q.where(ApiKey.user_id == user_id)
    result = await db.execute(q)
    key = result.scalar_one_or_none()
    if not key:
        return False
    await db.delete(key)
    await db.commit()
    _invalidate_cache(key_id)
    return True


async def validate_key(token: str) -> dict | None:
    """Validate API key token, returns {key_id, user_id, allowed_models, max_qpm} or None."""
    key_hash = hashlib.sha256(token.encode()).hexdigest()

    # Check cache
    cached = KEY_CACHE.get(key_hash)
    if cached:
        if cached.get("expire_ts") and time.time() > cached["expire_ts"]:
            KEY_CACHE.pop(key_hash, None)
            return None
        return cached

    return None


async def reveal_key(db: AsyncSession, key_id: int, user_id: str) -> str | None:
    """解密并返回完整的 API Key（仅限 key 所有者）"""
    from app.crypto import decrypt

    result = await db.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user_id)
    )
    key = result.scalar_one_or_none()
    if not key or not key.key_encrypted:
        return None
    try:
        return decrypt(key.key_encrypted)
    except Exception:
        return None


async def update_last_used(db: AsyncSession, key_id: int):
    from datetime import datetime, timezone
    await db.execute(
        update(ApiKey).where(ApiKey.id == key_id).values(last_used_at=datetime.now(timezone.utc))
    )
    await db.commit()


async def disable_user_keys(db: AsyncSession, user_id: str):
    await db.execute(
        update(ApiKey).where(ApiKey.user_id == user_id, ApiKey.is_active == True).values(is_active=False)
    )
    await db.commit()
    # Invalidate all cached keys for this user
    to_remove = [k for k, v in KEY_CACHE.items() if v.get("user_id") == user_id]
    for k in to_remove:
        KEY_CACHE.pop(k, None)


async def load_keys_to_cache(db: AsyncSession):
    result = await db.execute(select(ApiKey).where(ApiKey.is_active == True))
    for key in result.scalars().all():
        _cache_key(key)


def _cache_key(key: ApiKey):
    expire_ts = None
    if key.expire_at:
        expire_ts = key.expire_at.timestamp()
    models = key.allowed_models.split(",") if key.allowed_models else []
    KEY_CACHE[key.key_hash] = {
        "key_id": key.id,
        "user_id": key.user_id,
        "allowed_models": models,
        "max_qpm": key.max_qpm,
        "expire_ts": expire_ts,
    }


def _invalidate_cache(key_id: int):
    to_remove = None
    for k, v in KEY_CACHE.items():
        if v.get("key_id") == key_id:
            to_remove = k
            break
    if to_remove:
        KEY_CACHE.pop(to_remove, None)
