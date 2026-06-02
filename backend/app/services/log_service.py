"""日志服务 - 记录 API 调用日志和统计"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import RequestLog, UsageStats
from app.utils import now_beijing

logger = logging.getLogger("sesame.log")

# 日志 body 最大存储长度（字符）
MAX_BODY_LOG_LENGTH = 4096


async def log_request_start(
    db: AsyncSession,
    user_id: str,
    key_id: int | None = None,
    channel_id: int | None = None,
    model: str | None = None,
    internal_model: str | None = None,
    is_stream: bool = False,
    api_format: str | None = None,
) -> int | None:
    """流式请求开始时写入占位日志，返回 log_id 供后续更新。失败返回 None。"""
    try:
        log = RequestLog(
            user_id=user_id,
            key_id=key_id,
            channel_id=channel_id,
            model=model,
            internal_model=internal_model,
            tokens_prompt=0,
            tokens_completion=0,
            latency_ms=None,
            status_code=None,
            is_stream=is_stream,
            api_format=api_format,
        )
        db.add(log)
        await db.flush()
        log_id = log.id
        await db.commit()
        return log_id
    except Exception as e:
        logger.warning(f"Failed to log request start: {e}")
        return None


async def log_request_complete(
    db: AsyncSession,
    log_id: int,
    user_id: str,
    key_id: int | None = None,
    model: str | None = None,
    tokens_prompt: int = 0,
    tokens_completion: int = 0,
    latency_ms: int | None = None,
    status_code: int | None = None,
    error_message: str | None = None,
) -> None:
    """流式请求结束后更新日志并写入用量统计"""
    try:
        log = await db.get(RequestLog, log_id)
        if log is None:
            logger.warning(f"Request log {log_id} not found, skipping update")
            return
        log.tokens_prompt = tokens_prompt
        log.tokens_completion = tokens_completion
        log.latency_ms = latency_ms
        log.status_code = status_code
        log.error_message = error_message
        await db.flush()

        await _upsert_usage_atomic(
            db, user_id, key_id or 0, model,
            tokens_prompt + tokens_completion,
            tokens_prompt, tokens_completion,
            latency_ms, status_code
        )
        await db.commit()
    except Exception as e:
        logger.warning(f"Failed to complete request log {log_id}: {e}")


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
    request_body: str | None = None,
    response_body: str | None = None,
) -> None:
    """记录请求日志并使用原子 SQL 更新用量统计。日志写入失败不影响主请求。"""
    try:
        # 截断过长的 body
        if request_body and len(request_body) > MAX_BODY_LOG_LENGTH:
            request_body = request_body[:MAX_BODY_LOG_LENGTH] + "...(truncated)"
        if response_body and len(response_body) > MAX_BODY_LOG_LENGTH:
            response_body = response_body[:MAX_BODY_LOG_LENGTH] + "...(truncated)"

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
            request_body=request_body,
            response_body=response_body,
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
    except Exception as e:
        logger.warning(f"Failed to log request: {e}")


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
    errors_only: bool = False,
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
    if errors_only:
        query = query.where(RequestLog.status_code >= 400)

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()


async def get_logs_count(
    db: AsyncSession,
    user_id: str | None = None,
    model: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    errors_only: bool = False,
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
    if errors_only:
        query = query.where(RequestLog.status_code >= 400)

    result = await db.execute(query)
    return result.scalar() or 0


async def get_hourly_stats(db: AsyncSession, days: int = 1) -> list[dict]:
    """按小时统计 token 用量（最近 N 天）"""
    start = now_beijing() - timedelta(days=days)
    result = await db.execute(
        select(
            func.date_format(RequestLog.created_at, "%Y-%m-%d %H:00").label("hour"),
            func.sum(RequestLog.tokens_prompt + RequestLog.tokens_completion).label("total_tokens"),
            func.sum(RequestLog.tokens_prompt).label("prompt_tokens"),
            func.sum(RequestLog.tokens_completion).label("completion_tokens"),
            func.count().label("requests"),
        )
        .where(RequestLog.created_at >= start)
        .group_by(text("hour"))
        .order_by(text("hour"))
    )
    rows = result.all()
    return [
        {
            "hour": row.hour,
            "total_tokens": row.total_tokens or 0,
            "prompt_tokens": row.prompt_tokens or 0,
            "completion_tokens": row.completion_tokens or 0,
            "requests": row.requests or 0,
        }
        for row in rows
    ]


def _daily_stats_row(row) -> dict:
    """统一的日统计行映射"""
    return {
        "date": row.date,
        "total_requests": row.total_requests or 0,
        "total_tokens": row.total_tokens or 0,
        "total_prompt_tokens": row.total_prompt_tokens or 0,
        "total_completion_tokens": row.total_completion_tokens or 0,
        "avg_latency_ms": round(row.avg_latency_ms or 0, 2),
        "error_count": row.error_count or 0,
    }


async def _query_daily_stats(db: AsyncSession, days: int, user_id: str | None = None) -> list[dict]:
    """通用的每日统计查询，可选按 user_id 过滤。"""
    start_date = (now_beijing() - timedelta(days=days)).strftime("%Y-%m-%d")
    query = (
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
    if user_id:
        query = query.where(UsageStats.user_id == user_id)
    result = await db.execute(query)
    return [_daily_stats_row(row) for row in result.all()]


async def get_daily_stats(db: AsyncSession, days: int = 30) -> list[dict]:
    return await _query_daily_stats(db, days)


async def get_daily_stats_for_user(db: AsyncSession, user_id: str, days: int = 30) -> list[dict]:
    """指定用户的每日统计"""
    return await _query_daily_stats(db, days, user_id=user_id)


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

    return [
        {
            "model": row.model or "unknown",
            "total_requests": row.total_requests or 0,
            "total_tokens": row.total_tokens or 0,
            "avg_latency_ms": round(row.avg_latency_ms or 0, 2),
        }
        for row in result.all()
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

    return [
        {
            "user_id": row.user_id,
            "total_requests": row.total_requests or 0,
            "total_tokens": row.total_tokens or 0,
            "avg_latency_ms": round(row.avg_latency_ms or 0, 2),
        }
        for row in result.all()
    ]


async def get_user_summary(db: AsyncSession, user_id: str) -> dict:
    """用户最近 7 天 / 30 天的汇总统计（并行查询）"""
    import asyncio

    now = now_beijing()
    d7 = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    d30 = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")

    async def _query(start_date: str) -> dict:
        result = await db.execute(
            select(
                func.sum(UsageStats.total_requests).label("requests"),
                func.sum(UsageStats.total_tokens).label("tokens"),
                func.sum(UsageStats.total_prompt_tokens).label("prompt"),
                func.sum(UsageStats.total_completion_tokens).label("completion"),
                func.sum(UsageStats.error_count).label("errors"),
            )
            .where(UsageStats.user_id == user_id)
            .where(UsageStats.date >= start_date)
        )
        row = result.one()
        return {
            "requests": row.requests or 0,
            "tokens": row.tokens or 0,
            "prompt": row.prompt or 0,
            "completion": row.completion or 0,
            "errors": row.errors or 0,
        }

    s7, s30, today_stats = await asyncio.gather(
        _query(d7), _query(d30), _query(today)
    )

    return {
        "today": today_stats,
        "last_7_days": s7,
        "last_30_days": s30,
    }
