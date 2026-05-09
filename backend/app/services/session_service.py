from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import get_cache
from app.config import settings
from app.crypto import decrypt, encrypt
from app.models.db_models import UserSession

SESSION_KEY_PREFIX = "sesame:session:"


async def get_session(user_id: str) -> dict | None:
    cache = get_cache()
    data = await cache.hash_get_all(f"{SESSION_KEY_PREFIX}{user_id}")
    if not data:
        return None
    if data.get("status") != "active":
        return None
    expire_at = data.get("expire_at")
    if expire_at:
        exp = datetime.fromisoformat(expire_at)
        if exp < datetime.now(timezone.utc):
            await cache.hash_set(f"{SESSION_KEY_PREFIX}{user_id}", "status", "expired")
            return None
    return data


async def get_decrypted_cookie(user_id: str) -> str | None:
    session = await get_session(user_id)
    if not session:
        return None
    try:
        return decrypt(session["cookie"])
    except Exception:
        return None


async def submit_session(
    db: AsyncSession,
    user_id: str,
    cookie: str,
    expire_days: int | None = None,
) -> dict:
    days = expire_days or settings.default_cookie_expire_days
    expire_at = datetime.now(timezone.utc) + timedelta(days=days)
    encrypted = encrypt(cookie)

    # Write to cache
    cache = get_cache()
    key = f"{SESSION_KEY_PREFIX}{user_id}"
    await cache.hash_set(key, "cookie", encrypted)
    await cache.hash_set(key, "status", "active")
    await cache.hash_set(key, "expire_at", expire_at.isoformat())
    await cache.hash_set(key, "last_used_at", "")

    # Write to DB (upsert)
    result = await db.execute(select(UserSession).where(UserSession.user_id == user_id))
    existing = result.scalar_one_or_none()
    if existing:
        existing.cookie_encrypted = encrypted
        existing.status = "active"
        existing.expire_at = expire_at
    else:
        db.add(UserSession(
            user_id=user_id,
            cookie_encrypted=encrypted,
            status="active",
            expire_at=expire_at,
        ))
    await db.commit()

    return {"user_id": user_id, "status": "active", "expire_at": expire_at.isoformat()}


async def delete_session(db: AsyncSession, user_id: str) -> bool:
    cache = get_cache()
    key = f"{SESSION_KEY_PREFIX}{user_id}"
    has_cached = await cache.hash_get(key, "cookie")
    
    # Clear cache regardless
    if has_cached:
        await cache.hash_set(key, "status", "expired")

    # Always update DB (handles orphaned records after cache clear)
    result = await db.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.status == "active")
        .values(status="revoked")
    )
    await db.commit()
    
    return has_cached is not None or result.rowcount > 0


async def list_sessions() -> list[dict]:
    cache = get_cache()
    results = []
    keys = await cache.get_all_hash_keys()
    for key in keys:
        if not key.startswith(SESSION_KEY_PREFIX):
            continue
        user_id = key[len(SESSION_KEY_PREFIX):]
        data = await cache.hash_get_all(key)
        if "cookie" in data:
            data["cookie"] = data["cookie"][:8] + "..." if len(data["cookie"]) > 8 else "***"
        data["user_id"] = user_id
        results.append(data)
    return results


async def get_session_detail(user_id: str) -> dict | None:
    """Get session detail for a specific user (admin view, cookie masked)."""
    cache = get_cache()
    data = await cache.hash_get_all(f"{SESSION_KEY_PREFIX}{user_id}")
    if not data:
        return None
    if "cookie" in data:
        data["cookie"] = data["cookie"][:8] + "..." if len(data["cookie"]) > 8 else "***"
    data["user_id"] = user_id
    return data


async def update_last_used(user_id: str):
    cache = get_cache()
    key = f"{SESSION_KEY_PREFIX}{user_id}"
    await cache.hash_set(key, "last_used_at", datetime.now(timezone.utc).isoformat())
