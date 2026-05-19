"""精确匹配缓存 + 请求去重 + 并发控制

三层防护，按顺序执行：
1. 并发控制  —— 槽位计数，防止单用户占满连接池
2. 请求去重  —— 5s 窗口，相同请求只处理一次
3. 精确缓存  —— N 分钟 TTL，相同请求直接返回缓存结果
"""

import hashlib
import json
import logging
import time
from typing import Any

from app.cache import get_cache, get_redis

logger = logging.getLogger("sesame.cache")

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
        from app.config import settings
        key = f"concurrency:key:{key_id}"
        if settings.redis_mode == "cluster":
            key = "{" + key + "}"
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
        from app.config import settings
        key = f"concurrency:key:{key_id}"
        if settings.redis_mode == "cluster":
            key = "{" + key + "}"
        await r.eval(LUA_CONCURRENCY_RELEASE, 1, key)
    except Exception:
        pass


# ── 请求去重（5s 窗口）────────────────────────────────────────

async def acquire_dedup(fingerprint: str, ttl: int = 5) -> bool:
    """尝试获取去重锁。成功 → 当前请求是第一个，继续处理。"""
    try:
        r = await get_redis()
        from app.config import settings
        key = f"dedup:{fingerprint}"
        if settings.redis_mode == "cluster":
            key = "{" + key + "}"
        acquired = await r.set(key, "pending", nx=True, ex=ttl)
        return bool(acquired)
    except Exception:
        return True  # Redis 故障时放行


async def wait_dedup_result(fingerprint: str, timeout: float = 3.0) -> dict | None:
    """等待去重锁中的结果。轮询直到有结果或超时。"""
    try:
        r = await get_redis()
        from app.config import settings
        key = f"dedup:{fingerprint}"
        if settings.redis_mode == "cluster":
            key = "{" + key + "}"
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            val = await r.get(key)
            if val and val != "pending":
                try:
                    return json.loads(val)
                except json.JSONDecodeError:
                    return None
            await _asleep(0.15)
        return None
    except Exception:
        return None


async def store_dedup_result(fingerprint: str, result: dict, ttl: int = 30) -> None:
    """把请求结果写入去重键，让等待中的重复请求直接拿到结果。"""
    try:
        r = await get_redis()
        from app.config import settings
        key = f"dedup:{fingerprint}"
        if settings.redis_mode == "cluster":
            key = "{" + key + "}"
        val = json.dumps(result, ensure_ascii=False)
        await r.set(key, val, ex=ttl)
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


# ── util ─────────────────────────────────────────────────────

async def _asleep(seconds: float) -> None:
    import asyncio
    await asyncio.sleep(seconds)
