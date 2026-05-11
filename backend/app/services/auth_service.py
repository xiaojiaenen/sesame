from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from app.config import settings
from app.models.db_models import ApiKey, User
from app.services.apikey_service import disable_user_keys

logger = logging.getLogger("sesame")

SECRET_KEY = settings.encryption_key
if not SECRET_KEY:
    logger.warning("ENCRYPTION_KEY not set, using fallback secret. THIS IS INSECURE for production!")
    SECRET_KEY = "dev-secret-change-me"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: str, role: str = "user") -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": user_id, "role": role, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if not sub:
            return None
        return {"user_id": sub, "role": payload.get("role", "user")}
    except JWTError:
        return None


async def create_user(db: AsyncSession, user_id: str, password: str, role: str = "user") -> User:
    user = User(user_id=user_id, password_hash=hash_password(password), role=role)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_user(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(select(User).where(User.user_id == user_id))
    return result.scalar_one_or_none()


async def list_users(db: AsyncSession, limit: int | None = None, offset: int = 0) -> list[User]:
    q = select(User).offset(offset)
    if limit is not None:
        q = q.limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())

async def count_users(db: AsyncSession) -> int:
    from sqlalchemy import func
    result = await db.execute(select(func.count()).select_from(User))
    return result.scalar_one()


async def disable_user(db: AsyncSession, user_id: str) -> bool:
    user = await get_user(db, user_id)
    if not user:
        return False
    user.is_active = False
    # Cascade: disable all API keys
    await db.execute(
        update(ApiKey)
        .where(ApiKey.user_id == user_id, ApiKey.is_active == True)
        .values(is_active=False)
    )
    await db.commit()
    # Invalidate key cache (no separate commit needed)
    _invalidate_user_key_cache(user_id)
    return True


def _invalidate_user_key_cache(user_id: str):
    """Invalidate cached keys for a user without DB access."""
    from app.services.apikey_service import KEY_CACHE
    to_remove = [k for k, v in KEY_CACHE.items() if v.get("user_id") == user_id]
    for k in to_remove:
        KEY_CACHE.pop(k, None)
