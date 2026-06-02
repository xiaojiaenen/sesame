"""精确匹配缓存 + 请求去重 + 并发控制

三层防护，按顺序执行：
1. 并发控制  —— 槽位计数，防止单用户占满连接池
2. 请求去重  —— 5s 窗口，相同请求只处理一次
3. 精确缓存  —— N 分钟 TTL，相同请求直接返回缓存结果
"""

import asyncio
import hashlib
import json
import logging
import time
from typing import Any

from app.cache import get_cache, get_redis
from app.config import settings

logger = logging.getLogger("sesame.cache")

# ── 模块级常量，避免每次调用重复计算 ─────────────────────────
_IS_CLUSTER = settings.redis_mode == "cluster"


def _redis_key(base_key: str) -> str:
    """构造 Redis key，cluster 模式自动加 hash tag。"""
    if _IS_CLUSTER:
        return "{" + base_key + "}"
    return base_key


# ── Lua scripts ──────────────────────────────────────────────

LUA_CONCURRENCY_ACQUIRE = """
local key = KEYS[1]
local max_concurrent = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = redis.call('GET', key) or 0
if tonumber(current) >= max_concurrent then
    return 0
end

local n = redis.call('INCR', key)
redis.call('EXPIRE', key, ttl)
return 1
"""

LUA_CONCURRENCY_RELEASE = """
local key = KEYS[1]
local current = redis.call('GET', key) or 0
if tonumber(current) > 0 then
    return redis.call('DECR', key)
end
return 0
"""


# ── Fingerprint ──────────────────────────────────────────────

def compute_fingerprint(body: dict, user_id: str) -> str:
    """计算请求指纹——只对影响响应的字段做哈希。

    排除 stream 参数，因为缓存与流式无关。
    排除 max_tokens，因为它不影响内容。
    """
    cacheable: dict[str, Any] = {}
    for field in ("model", "messages", "temperature", "top_p", "tools", "tool_choice"):
        if field in body:
            cacheable[field] = body[field]
    raw = json.dumps(cacheable, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(f"{user_id}:{raw}".encode()).hexdigest()


# ── 并发控制 ─────────────────────────────────────────────────

async def acquire_concurrency(key_id: int, max_concurrent: int = 10) -> bool:
    """尝试获取并发槽位。成功返回 True，并发满返回 False。"""
    if max_concurrent <= 0:
        return True  # 并发控制已禁用
    try:
        r = await get_redis()
        key = _redis_key(f"concurrency:key:{key_id}")
        result = await r.eval(LUA_CONCURRENCY_ACQUIRE, 1, key, str(max_concurrent), "120")
        if result == 1:
            return True
        logger.debug(f"[CONCURRENCY] key_id={key_id} at limit ({max_concurrent})")
        return False
    except Exception as e:
        logger.warning(f"[CONCURRENCY] acquire error: {e}")
        return True  # Redis 故障时放行


async def release_concurrency(key_id: int) -> None:
    """释放并发槽位。请求结束（成功/失败/取消）时必须调用。"""
    try:
        r = await get_redis()
        key = _redis_key(f"concurrency:key:{key_id}")
        await r.eval(LUA_CONCURRENCY_RELEASE, 1, key)
    except Exception:
        pass


# ── 请求去重（5s 窗口）────────────────────────────────────────

async def acquire_dedup(fingerprint: str, ttl: int = 5) -> bool:
    """尝试获取去重锁。成功 → 当前请求是第一个，继续处理。"""
    try:
        r = await get_redis()
        key = _redis_key(f"dedup:{fingerprint}")
        acquired = await r.set(key, "pending", nx=True, ex=ttl)
        return bool(acquired)
    except Exception:
        return True  # Redis 故障时放行


async def wait_dedup_result(fingerprint: str, timeout: float = 3.0) -> dict | None:
    """等待去重锁中的结果。使用 Redis Pub/Sub 替代轮询。"""
    try:
        r = await get_redis()
        key = _redis_key(f"dedup:{fingerprint}")
        pubsub_key = _redis_key(f"dedup:notify:{fingerprint}")
        deadline = time.monotonic() + timeout

        # 先检查是否已有结果
        val = await r.get(key)
        if val and val != "pending":
            try:
                return json.loads(val)
            except json.JSONDecodeError:
                return None

        # 订阅通知频道，等待结果
        pubsub = r.pubsub()
        await pubsub.subscribe(pubsub_key)
        try:
            while time.monotonic() < deadline:
                msg = await pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=min(0.5, deadline - time.monotonic())
                )
                if msg and msg["type"] == "message":
                    try:
                        return json.loads(msg["data"])
                    except (json.JSONDecodeError, TypeError):
                        return None
                # 每次循环也检查 key（防止 pubsub 消息丢失）
                val = await r.get(key)
                if val and val != "pending":
                    try:
                        return json.loads(val)
                    except json.JSONDecodeError:
                        return None
            return None
        finally:
            await pubsub.unsubscribe(pubsub_key)
            await pubsub.close()
    except Exception:
        return None


async def store_dedup_result(fingerprint: str, result: dict, ttl: int = 30) -> None:
    """把请求结果写入去重键，并通过 Pub/Sub 通知等待的请求。"""
    try:
        r = await get_redis()
        key = _redis_key(f"dedup:{fingerprint}")
        pubsub_key = _redis_key(f"dedup:notify:{fingerprint}")
        val = json.dumps(result, ensure_ascii=False)
        await r.set(key, val, ex=ttl)
        # 通知所有等待的请求
        await r.publish(pubsub_key, val)
    except Exception:
        pass


# ── 精确缓存 ─────────────────────────────────────────────────

async def get_cached(fingerprint: str) -> dict | None:
    """读取缓存。命中返回 dict，未命中返回 None。"""
    try:
        cache = get_cache()
        data = await cache.get(f"cache:{fingerprint}")
        return data
    except Exception:
        return None


async def set_cached(fingerprint: str, result: dict, ttl: int = 300) -> None:
    """写入缓存。"""
    try:
        cache = get_cache()
        await cache.set(f"cache:{fingerprint}", result, ttl=ttl)
    except Exception:
        pass
