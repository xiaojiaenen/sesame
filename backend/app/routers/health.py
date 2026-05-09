from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.models.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health():
    db_ok = True
    cache_ok = True

    try:
        from app.database import engine
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    try:
        from app.cache import get_cache
        await get_cache().set("_health_check", {"ok": True})
        await get_cache().delete("_health_check")
    except Exception:
        cache_ok = False

    status = "healthy" if (db_ok and cache_ok) else "degraded"
    return HealthResponse(
        status=status,
        version=settings.version,
        database="ok" if db_ok else "error",
        cache="ok" if cache_ok else "error",
    )
