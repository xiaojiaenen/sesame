"""Rate limiting - Redis-based sliding window, atomic Lua script."""

import logging
import secrets
import time

from app.cache import get_redis

logger = logging.getLogger("sesame.ratelimit")

# Unique member: timestamp + random nonce to avoid sorted-set dedup collisions
LUA_CHECK_RATE = """
local key = KEYS[1]
local max_qpm = tonumber(ARGV[1])
local window_sec = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local unique_member = ARGV[4]

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window_sec)

-- Count current requests in window
local current = redis.call('ZCARD', key)
if current >= max_qpm then
    return 0
end

-- Add current request with unique member (timestamp + random nonce)
redis.call('ZADD', key, now, unique_member)
redis.call('EXPIRE', key, window_sec + 1)
return 1
"""


async def check_rate_limit(key_id: int, max_qpm: int, window_sec: int = 60) -> bool:
    """Returns True if request is allowed.

    Uses Redis sorted set for accurate sliding-window rate limiting.
    Atomic Lua script eliminates race conditions.
    Works with both single-node and cluster Redis.
    """
    from app.config import settings
    r = await get_redis()
    now = time.time()
    key = f"ratelimit:{key_id}"
    # Cluster mode requires hash tag around key for Lua scripts
    if settings.redis_mode == "cluster":
        key = "{" + key + "}"

    # Use timestamp + random nonce for unique member to avoid collision
    unique_member = f"{now}-{secrets.token_hex(4)}"

    try:
        result = await r.eval(
            LUA_CHECK_RATE,
            1,
            key,
            str(max_qpm),
            str(window_sec),
            str(now),
            unique_member,
        )
        return result == 1
    except Exception as e:
        logger.warning(f"Rate limit check failed for key_id={key_id}: {e}")
        return True  # Fail-open on Redis errors


async def cleanup_old_records():
    """No-op with Redis — expired keys are auto-deleted via EXPIRE."""
    pass
