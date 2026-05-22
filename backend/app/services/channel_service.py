"""渠道服务 - 管理多个后端 API 渠道，实现负载均衡和模型映射

Redis 缓存 + 本地内存镜像，保证 sync/async 均可访问。
"""

import json
import random

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import get_cache
from app.models.db_models import Channel
from app.utils import now_beijing

CHANNELS_CACHE_KEY = "channels:list"

# 本地内存镜像 — 供 sync 函数使用
_channels: list[dict] = []


def _normalize_models(raw) -> dict:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, list):
        return {m: m for m in raw}
    return {}


async def load_channels_to_cache(db: AsyncSession) -> None:
    global _channels
    result = await db.execute(
        select(Channel).where(Channel.is_enabled == True).order_by(Channel.priority.desc(), Channel.weight.desc())
    )
    rows = result.scalars().all()
    data = [
        {
            "id": r.id,
            "name": r.name,
            "base_url": r.base_url,
            "api_key": r.api_key,
            "auth_type": r.auth_type or "api_key",
            "models": _normalize_models(json.loads(r.models) if r.models else None),
            "weight": r.weight,
            "status": r.status,
            "priority": r.priority,
            "max_qps": r.max_qps,
        }
        for r in rows
    ]
    # 写入 Redis
    cache = get_cache()
    await cache.set(CHANNELS_CACHE_KEY, {"data": json.dumps(data, ensure_ascii=False)})
    # 同步镜像
    _channels = data


def get_channels() -> list[dict]:
    return _channels


def get_channel(channel_id: int) -> dict | None:
    for ch in _channels:
        if ch["id"] == channel_id:
            return ch
    return None


def select_channel(model: str | None = None) -> tuple[dict | None, str | None]:
    if not _channels:
        return None, None

    exact = []
    fallback = []
    for ch in _channels:
        if ch["status"] != "active":
            continue
        models = ch["models"]
        if not models:
            exact.append((ch, model))
        elif model and model in models:
            exact.append((ch, models[model]))
        elif model and len(models) == 1:
            exact.append((ch, list(models.values())[0]))
        else:
            unique_backends = set(models.values())
            if len(unique_backends) == 1:
                fallback.append((ch, unique_backends.pop()))
            else:
                fallback.append((ch, model))

    candidates = exact or fallback
    if not candidates:
        return None, None

    max_priority = max(c[0]["priority"] for c in candidates)
    top_priority = [c for c in candidates if c[0]["priority"] == max_priority]

    total_weight = sum(c[0]["weight"] for c in top_priority)
    if total_weight == 0:
        return random.choice(top_priority)

    r = random.randint(1, total_weight)
    cumulative = 0
    for ch, bm in top_priority:
        cumulative += ch["weight"]
        if r <= cumulative:
            return ch, bm

    return top_priority[0]


def select_channel_auto() -> tuple[dict | None, str | None]:
    """跳过模型匹配，从所有活跃渠道中按权重随机选择一个。"""
    if not _channels:
        return None, None

    active = [ch for ch in _channels if ch["status"] == "active"]
    if not active:
        return None, None

    max_priority = max(c["priority"] for c in active)
    top_priority = [c for c in active if c["priority"] == max_priority]

    total_weight = sum(c["weight"] for c in top_priority)
    if total_weight == 0:
        chosen = random.choice(top_priority)
        return chosen, None

    r = random.randint(1, total_weight)
    cumulative = 0
    for ch in top_priority:
        cumulative += ch["weight"]
        if r <= cumulative:
            backend_model = list(ch["models"].values())[0] if ch["models"] else None
            return ch, backend_model

    chosen = top_priority[0]
    backend_model = list(chosen["models"].values())[0] if chosen["models"] else None
    return chosen, backend_model


async def create_channel(db: AsyncSession, **kwargs) -> Channel:
    channel = Channel(**kwargs)
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    await load_channels_to_cache(db)
    return channel


async def update_channel(db: AsyncSession, channel_id: int, **kwargs) -> bool:
    result = await db.execute(update(Channel).where(Channel.id == channel_id).values(**kwargs))
    await db.commit()
    if result.rowcount > 0:
        await load_channels_to_cache(db)
        return True
    return False


async def delete_channel(db: AsyncSession, channel_id: int) -> bool:
    from sqlalchemy import delete
    result = await db.execute(delete(Channel).where(Channel.id == channel_id))
    await db.commit()
    if result.rowcount > 0:
        await load_channels_to_cache(db)
        return True
    return False


async def get_all_channels(db: AsyncSession, limit: int | None = None, offset: int = 0) -> list[Channel]:
    q = select(Channel).order_by(Channel.priority.desc(), Channel.id).offset(offset)
    if limit is not None:
        q = q.limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


async def count_all_channels(db: AsyncSession) -> int:
    from sqlalchemy import func
    result = await db.execute(select(func.count()).select_from(Channel))
    return result.scalar_one()


async def update_channel_status(db: AsyncSession, channel_id: int, status: str, error_message: str | None = None):
    await db.execute(
        update(Channel)
        .where(Channel.id == channel_id)
        .values(status=status, error_message=error_message, last_check=now_beijing())
    )
    await db.commit()
    await load_channels_to_cache(db)
