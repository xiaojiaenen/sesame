import time

from fastapi import APIRouter
from sqlalchemy import text, func, select

from app.config import settings
from app.models.schemas import HealthResponse

router = APIRouter()


@router.get("/health")
async def health():
    db_ok = True
    cache_ok = True
    db_ping_ms = 0
    redis_ping_ms = 0
    active_channels = 0
    active_users = 0

    # DB ping
    try:
        from app.database import engine
        t0 = time.monotonic()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_ping_ms = round((time.monotonic() - t0) * 1000, 1)
    except Exception:
        db_ok = False

    # Redis ping
    try:
        from app.cache import get_redis
        r = await get_redis()
        t0 = time.monotonic()
        await r.ping()
        redis_ping_ms = round((time.monotonic() - t0) * 1000, 1)
    except Exception:
        cache_ok = False

    # Active channels count
    try:
        from app.database import async_session
        from app.models.db_models import Channel, User
        async with async_session() as db:
            result = await db.execute(
                select(func.count()).select_from(Channel).where(Channel.is_enabled == True)
            )
            active_channels = result.scalar() or 0
            result = await db.execute(
                select(func.count()).select_from(User).where(User.is_active == True)
            )
            active_users = result.scalar() or 0
    except Exception:
        pass

    status = "healthy" if (db_ok and cache_ok) else "degraded"
    return {
        "status": status,
        "version": settings.version,
        "database": "ok" if db_ok else "error",
        "cache": "ok" if cache_ok else "error",
        "db_ping_ms": db_ping_ms,
        "redis_ping_ms": redis_ping_ms,
        "active_channels": active_channels,
        "active_users": active_users,
    }
