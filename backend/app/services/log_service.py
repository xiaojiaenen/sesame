"""日志服务 - 记录 API 调用日志和统计"""

import json
from datetime import datetime, timedelta

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
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
    error_message: str | None = None,
) -> RequestLog:
    """记录请求日志"""
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
        error_message=error_message,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    # 更新用量统计
    await _update_usage_stats(
        db, user_id, key_id, model,
        tokens_prompt + tokens_completion,
        tokens_prompt, tokens_completion,
        latency_ms, status_code
    )

    return log


async def _update_usage_stats(
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
    """更新用量统计"""
    today = now_beijing().strftime("%Y-%m-%d")

    # 查找或创建统计记录
    result = await db.execute(
        select(UsageStats).where(
            and_(
                UsageStats.user_id == user_id,
                UsageStats.key_id == key_id,
                UsageStats.model == model,
                UsageStats.date == today,
            )
        )
    )
    stats = result.scalar_one_or_none()

    if stats:
        # 更新现有记录
        stats.total_requests += 1
        stats.total_tokens += total_tokens
        stats.total_prompt_tokens += prompt_tokens
        stats.total_completion_tokens += completion_tokens
        if latency_ms:
            stats.avg_latency_ms = (stats.avg_latency_ms * (stats.total_requests - 1) + latency_ms) / stats.total_requests
        if status_code and status_code >= 400:
            stats.error_count += 1
    else:
        # 创建新记录
        stats = UsageStats(
            user_id=user_id,
            key_id=key_id,
            model=model,
            date=today,
            total_requests=1,
            total_tokens=total_tokens,
            total_prompt_tokens=prompt_tokens,
            total_completion_tokens=completion_tokens,
            avg_latency_ms=latency_ms or 0,
            error_count=1 if status_code and status_code >= 400 else 0,
        )
        db.add(stats)

    await db.commit()


async def get_logs(
    db: AsyncSession,
    user_id: str | None = None,
    model: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[RequestLog]:
    """获取请求日志"""
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
    """获取日志总数"""
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


async def get_usage_stats(
    db: AsyncSession,
    user_id: str | None = None,
    model: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[UsageStats]:
    """获取用量统计"""
    query = select(UsageStats).order_by(UsageStats.date.desc())

    if user_id:
        query = query.where(UsageStats.user_id == user_id)
    if model:
        query = query.where(UsageStats.model == model)
    if start_date:
        query = query.where(UsageStats.date >= start_date)
    if end_date:
        query = query.where(UsageStats.date <= end_date)

    result = await db.execute(query)
    return result.scalars().all()


async def get_daily_stats(db: AsyncSession, days: int = 30) -> list[dict]:
    """获取每日统计"""
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
    """获取按模型统计"""
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
    """获取按用户统计"""
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
