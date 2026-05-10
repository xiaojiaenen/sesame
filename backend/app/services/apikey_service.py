import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import get_cache
from app.models.db_models import ApiKey

PREFIX = "sk-sesame-"
KEY_HASH_PREFIX = "apikey:"


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

    await _cache_key(api_key)
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
    await _invalidate_cache(key_id)
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
    await _invalidate_cache(key_id)
    return True


async def validate_key(token: str) -> dict | None:
    """Validate API key token from Redis cache."""
    key_hash = hashlib.sha256(token.encode()).hexdigest()
    cache = get_cache()

    data = await cache.get(f"{KEY_HASH_PREFIX}{key_hash}")
    if not data:
        return None

    if data.get("expire_ts") and datetime.now(timezone.utc).timestamp() > data["expire_ts"]:
        await cache.delete(f"{KEY_HASH_PREFIX}{key_hash}")
        return None

    return data


async def reveal_key(db: AsyncSession, key_id: int, user_id: str) -> str | None:
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
    await db.execute(
        update(ApiKey).where(ApiKey.id == key_id).values(last_used_at=datetime.now(timezone.utc))
    )
    await db.commit()


async def disable_user_keys(db: AsyncSession, user_id: str):
    await db.execute(
        update(ApiKey).where(ApiKey.user_id == user_id, ApiKey.is_active == True).values(is_active=False)
    )
    await db.commit()
    # Invalidate cached keys for this user
    cache = get_cache()
    keys = await cache.get_all_hash_keys()
    for k in keys:
        if k.startswith(KEY_HASH_PREFIX):
            data = await cache.get(k)
            if data and data.get("user_id") == user_id:
                await cache.delete(k)


async def load_keys_to_cache(db: AsyncSession):
    result = await db.execute(select(ApiKey).where(ApiKey.is_active == True))
    for key in result.scalars().all():
        await _cache_key(key)


async def _cache_key(key: ApiKey):
    cache = get_cache()
    expire_ts = key.expire_at.timestamp() if key.expire_at else None
    models = key.allowed_models.split(",") if key.allowed_models else []
    data = {
        "key_id": key.id,
        "user_id": key.user_id,
        "allowed_models": models,
        "max_qpm": key.max_qpm,
        "expire_ts": expire_ts,
    }
    await cache.set(f"{KEY_HASH_PREFIX}{key.key_hash}", data)


async def _invalidate_cache(key_id: int):
    cache = get_cache()
    # Find and delete by key_id inside cached data
    keys = await cache.get_all_hash_keys()
    for k in keys:
        if k.startswith(KEY_HASH_PREFIX):
            data = await cache.get(k)
            if data and data.get("key_id") == key_id:
                await cache.delete(k)
                break
