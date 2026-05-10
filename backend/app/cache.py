import json
import time
from typing import Any

from redis.asyncio import Redis as AsyncRedis

from app.config import settings

_redis: AsyncRedis | None = None


async def get_redis() -> AsyncRedis:
    global _redis
    if _redis is None:
        _redis = AsyncRedis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_keepalive=True,
        )
    return _redis


async def close_redis():
    global _redis
    if _redis:
        await _redis.close()
        _redis = None


class CacheBackend:
    """Redis-backed cache implementing the same interface as MemoryCache."""

    def __init__(self, prefix: str = ""):
        self.prefix = prefix or settings.redis_prefix

    def _k(self, key: str) -> str:
        return f"{self.prefix}{key}"

    async def get(self, key: str) -> dict[str, Any] | None:
        r = await get_redis()
        data = await r.get(self._k(key))
        if data:
            return json.loads(data)
        return None

    async def set(self, key: str, value: dict[str, Any], ttl: int | None = None) -> None:
        r = await get_redis()
        k = self._k(key)
        v = json.dumps(value, ensure_ascii=False)
        if ttl:
            await r.setex(k, ttl, v)
        else:
            await r.set(k, v)

    async def delete(self, key: str) -> None:
        r = await get_redis()
        await r.delete(self._k(key))

    async def hash_get(self, key: str, field: str) -> str | None:
        r = await get_redis()
        return await r.hget(self._k(key), field)

    async def hash_set(self, key: str, field: str, value: str) -> None:
        r = await get_redis()
        await r.hset(self._k(key), field, value)

    async def hash_get_all(self, key: str) -> dict[str, str]:
        r = await get_redis()
        return await r.hgetall(self._k(key))

    async def hash_delete(self, key: str, field: str) -> None:
        r = await get_redis()
        await r.hdel(self._k(key), field)

    async def hash_exists(self, key: str, field: str) -> bool:
        r = await get_redis()
        return await r.hexists(self._k(key), field)

    async def hash_incrby(self, key: str, field: str, amount: int = 1) -> int:
        r = await get_redis()
        return await r.hincrby(self._k(key), field, amount)

    async def get_all_hash_keys(self) -> list[str]:
        r = await get_redis()
        prefix_len = len(self.prefix)
        keys = []
        cursor = 0
        while True:
            cursor, batch = await r.scan(cursor, match=f"{self.prefix}*", count=100)
            for k in batch:
                keys.append(k[prefix_len:])
            if cursor == 0:
                break
        return keys

    async def incr(self, key: str, ttl: int | None = None) -> int:
        """Atomic increment, optionally set TTL on first call."""
        r = await get_redis()
        k = self._k(key)
        # Lua script: INCR, set TTL only if key just created
        script = """
        local v = redis.call('INCR', KEYS[1])
        if v == 1 and ARGV[1] ~= '' then
            redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        return v
        """
        ttl_str = str(ttl) if ttl else ""
        return await r.eval(script, 1, k, ttl_str)

    async def set_nx(self, key: str, value: str, ttl: int | None = None) -> bool:
        """SET NX — returns True if key was set, False if already existed."""
        r = await get_redis()
        k = self._k(key)
        if ttl:
            return await r.set(k, value, nx=True, ex=ttl)
        return await r.set(k, value, nx=True)

    async def key_exists(self, key: str) -> bool:
        r = await get_redis()
        return await r.exists(self._k(key)) > 0


# Global cache instance
cache: CacheBackend = CacheBackend()


def get_cache() -> CacheBackend:
    return cache
