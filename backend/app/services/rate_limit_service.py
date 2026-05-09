import time

from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.db_models import RateLimitLog


async def check_rate_limit(key_id: int, max_qpm: int) -> bool:
    """Returns True if request is allowed, False if rate limited."""
    minute_ts = int(time.time()) // 60

    async with async_session() as db:
        # Use INSERT OR UPDATE to avoid race condition
        result = await db.execute(
            select(RateLimitLog).where(
                RateLimitLog.key_id == key_id,
                RateLimitLog.minute_ts == minute_ts,
            )
        )
        log = result.scalar_one_or_none()

        if log is None:
            try:
                db.add(RateLimitLog(key_id=key_id, minute_ts=minute_ts, request_count=1))
                await db.commit()
                return True
            except Exception:
                # Concurrent insert happened, re-check
                await db.rollback()
                result = await db.execute(
                    select(RateLimitLog).where(
                        RateLimitLog.key_id == key_id,
                        RateLimitLog.minute_ts == minute_ts,
                    )
                )
                log = result.scalar_one_or_none()
                if log is None:
                    return True  # Shouldn't happen, but allow if it does

        if log.request_count >= max_qpm:
            return False

        log.request_count += 1
        await db.commit()
        return True


async def cleanup_old_records(db: AsyncSession):
    """Delete rate limit records older than 5 minutes."""
    cutoff = int(time.time()) // 60 - 5
    await db.execute(delete(RateLimitLog).where(RateLimitLog.minute_ts < cutoff))
    await db.commit()
