"""渠道服务 - 管理多个后端 API 渠道，实现负载均衡和模型映射"""

import json
import random
import time
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.db_models import Channel
from app.utils import now_beijing

# 内存缓存
_channels: list[dict] = []
_last_load: float = 0


def _normalize_models(raw) -> dict:
    """将 models 字段统一转为 dict 格式 {"接受名": "后端名"}，空 dict 表示接受所有"""
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, list):
        # 兼容旧格式 ["model-a", "model-b"] → {"model-a": "model-a", "model-b": "model-b"}
        return {m: m for m in raw}
    return {}


async def load_channels_to_cache(db: AsyncSession) -> None:
    """加载渠道到内存缓存"""
    global _channels, _last_load
    result = await db.execute(
        select(Channel).where(Channel.is_enabled == True).order_by(Channel.priority.desc(), Channel.weight.desc())
    )
    rows = result.scalars().all()
    _channels = [
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
    _last_load = time.time()


def get_channels() -> list[dict]:
    """获取所有启用的渠道"""
    return _channels


def get_channel(channel_id: int) -> dict | None:
    """获取指定渠道"""
    for ch in _channels:
        if ch["id"] == channel_id:
            return ch
    return None


def select_channel(model: str | None = None) -> dict | None:
    """根据模型选择渠道（加权随机）

    Returns:
        (channel, backend_model) 元组，或 (None, None)
    """
    if not _channels:
        return None, None

    # 过滤支持该模型的渠道，同时记录映射后的模型名
    exact = []      # 精确匹配
    fallback = []   # 渠道有 models 但没匹配上，仍可作为兜底
    for ch in _channels:
        if ch["status"] != "active":
            continue
        models = ch["models"]
        if not models:
            # 空 dict = 接受所有模型
            exact.append((ch, model))
        elif model and model in models:
            exact.append((ch, models[model]))
        elif model and len(models) == 1:
            # 渠道只有 1 个映射，任何模型都自动转
            exact.append((ch, list(models.values())[0]))
        else:
            # 有 models 但没匹配上，作为兜底
            unique_backends = set(models.values())
            if len(unique_backends) == 1:
                # 所有映射指向同一个后端模型，自动使用
                fallback.append((ch, unique_backends.pop()))
            else:
                # 多个后端模型，用请求的原始模型名
                fallback.append((ch, model))

    candidates = exact or fallback
    if not candidates:
        return None, None

    # 按优先级分组
    max_priority = max(c[0]["priority"] for c in candidates)
    top_priority = [c for c in candidates if c[0]["priority"] == max_priority]

    # 加权随机选择
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


async def create_channel(db: AsyncSession, **kwargs) -> Channel:
    """创建渠道"""
    channel = Channel(**kwargs)
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    await load_channels_to_cache(db)
    return channel


async def update_channel(db: AsyncSession, channel_id: int, **kwargs) -> bool:
    """更新渠道"""
    result = await db.execute(update(Channel).where(Channel.id == channel_id).values(**kwargs))
    await db.commit()
    if result.rowcount > 0:
        await load_channels_to_cache(db)
        return True
    return False


async def delete_channel(db: AsyncSession, channel_id: int) -> bool:
    """删除渠道"""
    from sqlalchemy import delete
    result = await db.execute(delete(Channel).where(Channel.id == channel_id))
    await db.commit()
    if result.rowcount > 0:
        await load_channels_to_cache(db)
        return True
    return False


async def get_all_channels(db: AsyncSession, limit: int | None = None, offset: int = 0) -> list[Channel]:
    """获取所有渠道（包括禁用的）"""
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
    """更新渠道状态"""
    await db.execute(
        update(Channel)
        .where(Channel.id == channel_id)
        .values(status=status, error_message=error_message, last_check=now_beijing())
    )
    await db.commit()
    await load_channels_to_cache(db)
