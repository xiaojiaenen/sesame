"""日志服务 - 记录 API 调用日志和统计"""

from datetime import datetime, timedelta

from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import RequestLog, UsageStats
from app.utils import now_beijing


async def log_request(
    db: AsyncSession,
    user_id: str,
    key_id: int | None = None,
    channel_id: int | None = None,
    model: str | None = None,
    internal_model: str | None = None,
    tokens_prompt: int = 0,
    tokens_completion: int = 0,
    latency_ms: int | None = None,
    status_code: int | None = None,
    is_stream: bool = False,
    api_format: str | None = None,
    error_message: str | None = None,
) -> None:
    """记录请求日志并使用原子 SQL 更新用量统计"""
    log = RequestLog(
        user_id=user_id,
        key_id=key_id,
        channel_id=channel_id,
        model=model,
        internal_model=internal_model,
        tokens_prompt=tokens_prompt,
        tokens_completion=tokens_completion,
        latency_ms=latency_ms,
        status_code=status_code,
        is_stream=is_stream,
        api_format=api_format,
        error_message=error_message,
    )
    db.add(log)
    await db.flush()

    await _upsert_usage_atomic(
        db, user_id, key_id or 0, model,
        tokens_prompt + tokens_completion,
        tokens_prompt, tokens_completion,
        latency_ms, status_code
    )
    await db.commit()


async def _upsert_usage_atomic(
    db: AsyncSession,
    user_id: str,
    key_id: int | None,
    model: str | None,
    total_tokens: int,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: int | None,
    status_code: int | None,
):
    """使用 MySQL INSERT ... ON DUPLICATE KEY UPDATE 原子 upsert"""
    today = now_beijing().strftime("%Y-%m-%d")
    is_error = 1 if status_code and status_code >= 400 else 0

    sql = text("""
        INSERT INTO usage_stats
            (user_id, key_id, model, date, total_requests, total_tokens,
             total_prompt_tokens, total_completion_tokens, avg_latency_ms, error_count)
        VALUES
            (:user_id, :key_id, :model, :date, 1, :total_tokens,
             :prompt_tokens, :completion_tokens, :latency_ms, :error_count)
        ON DUPLICATE KEY UPDATE
            total_requests = total_requests + 1,
            total_tokens = total_tokens + :total_tokens,
            total_prompt_tokens = total_prompt_tokens + :prompt_tokens,
            total_completion_tokens = total_completion_tokens + :completion_tokens,
            avg_latency_ms = (avg_latency_ms * total_requests + :latency_ms) / (total_requests + 1),
            error_count = error_count + :error_count
    """)

    await db.execute(sql, {
        "user_id": user_id,
        "key_id": key_id,
        "model": model,
        "date": today,
        "total_tokens": total_tokens,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "latency_ms": latency_ms or 0,
        "error_count": is_error,
    })


async def get_logs(
    db: AsyncSession,
    user_id: str | None = None,
    model: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[RequestLog]:
    query = select(RequestLog).order_by(RequestLog.created_at.desc())

    if user_id:
        query = query.where(RequestLog.user_id == user_id)
    if model:
        query = query.where(RequestLog.model == model)
    if start_date:
        query = query.where(RequestLog.created_at >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(RequestLog.created_at <= datetime.fromisoformat(end_date) + timedelta(days=1))

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()


async def get_logs_count(
    db: AsyncSession,
    user_id: str | None = None,
    model: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> int:
    query = select(func.count(RequestLog.id))

    if user_id:
        query = query.where(RequestLog.user_id == user_id)
    if model:
        query = query.where(RequestLog.model == model)
    if start_date:
        query = query.where(RequestLog.created_at >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.where(RequestLog.created_at <= datetime.fromisoformat(end_date) + timedelta(days=1))

    result = await db.execute(query)
    return result.scalar() or 0


async def get_daily_stats(db: AsyncSession, days: int = 30) -> list[dict]:
    start_date = (now_beijing() - timedelta(days=days)).strftime("%Y-%m-%d")

    result = await db.execute(
        select(
            UsageStats.date,
            func.sum(UsageStats.total_requests).label("total_requests"),
            func.sum(UsageStats.total_tokens).label("total_tokens"),
            func.sum(UsageStats.total_prompt_tokens).label("total_prompt_tokens"),
            func.sum(UsageStats.total_completion_tokens).label("total_completion_tokens"),
            func.avg(UsageStats.avg_latency_ms).label("avg_latency_ms"),
            func.sum(UsageStats.error_count).label("error_count"),
        )
        .where(UsageStats.date >= start_date)
        .group_by(UsageStats.date)
        .order_by(UsageStats.date)
    )

    rows = result.all()
    return [
        {
            "date": row.date,
            "total_requests": row.total_requests or 0,
            "total_tokens": row.total_tokens or 0,
            "total_prompt_tokens": row.total_prompt_tokens or 0,
            "total_completion_tokens": row.total_completion_tokens or 0,
            "avg_latency_ms": round(row.avg_latency_ms or 0, 2),
            "error_count": row.error_count or 0,
        }
        for row in rows
    ]


async def get_model_stats(db: AsyncSession, days: int = 30) -> list[dict]:
    start_date = (now_beijing() - timedelta(days=days)).strftime("%Y-%m-%d")

    result = await db.execute(
        select(
            UsageStats.model,
            func.sum(UsageStats.total_requests).label("total_requests"),
            func.sum(UsageStats.total_tokens).label("total_tokens"),
            func.avg(UsageStats.avg_latency_ms).label("avg_latency_ms"),
        )
        .where(UsageStats.date >= start_date)
        .group_by(UsageStats.model)
        .order_by(func.sum(UsageStats.total_tokens).desc())
    )

    rows = result.all()
    return [
        {
            "model": row.model or "unknown",
            "total_requests": row.total_requests or 0,
            "total_tokens": row.total_tokens or 0,
            "avg_latency_ms": round(row.avg_latency_ms or 0, 2),
        }
        for row in rows
    ]


async def get_user_stats(db: AsyncSession, days: int = 30) -> list[dict]:
    start_date = (now_beijing() - timedelta(days=days)).strftime("%Y-%m-%d")

    result = await db.execute(
        select(
            UsageStats.user_id,
            func.sum(UsageStats.total_requests).label("total_requests"),
            func.sum(UsageStats.total_tokens).label("total_tokens"),
            func.avg(UsageStats.avg_latency_ms).label("avg_latency_ms"),
        )
        .where(UsageStats.date >= start_date)
        .group_by(UsageStats.user_id)
        .order_by(func.sum(UsageStats.total_tokens).desc())
    )

    rows = result.all()
    return [
        {
            "user_id": row.user_id,
            "total_requests": row.total_requests or 0,
            "total_tokens": row.total_tokens or 0,
            "avg_latency_ms": round(row.avg_latency_ms or 0, 2),
        }
        for row in rows
    ]
