"""Rate limiting - Redis-based sliding window, atomic Lua script."""

import time

from app.cache import get_cache

LUA_CHECK_RATE = """
local key = KEYS[1]
local max_qpm = tonumber(ARGV[1])
local window_sec = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window_sec)

-- Count current requests in window
local current = redis.call('ZCARD', key)
if current >= max_qpm then
    return 0
end

-- Add current request with unique score
redis.call('ZADD', key, now, now .. '-' .. current)
redis.call('EXPIRE', key, window_sec + 1)
return 1
"""


async def check_rate_limit(key_id: int, max_qpm: int) -> bool:
    """Returns True if request is allowed.

    Uses Redis sorted set for accurate sliding-window rate limiting.
    Atomic Lua script eliminates race conditions.
    Works with both single-node and cluster Redis.
    """
    from app.config import settings
    r = await _get_redis()
    now = time.time()
    key = f"ratelimit:{key_id}"
    # Cluster mode requires hash tag around key for Lua scripts
    if settings.redis_mode == "cluster":
        key = "{" + key + "}"

    result = await r.eval(
        LUA_CHECK_RATE,
        1,
        key,
        str(max_qpm),
        "60",
        str(now),
    )
    return result == 1


async def cleanup_old_records():
    """No-op with Redis — expired keys are auto-deleted via EXPIRE."""
    pass


async def _get_redis():
    from app.cache import get_redis
    return await get_redis()
