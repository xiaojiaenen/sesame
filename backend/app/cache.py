import json
import logging
from typing import Any

from redis.asyncio import Redis as AsyncRedis
from redis.asyncio.cluster import RedisCluster as AsyncRedisCluster

from app.config import settings

logger = logging.getLogger("sesame.cache")

_redis: AsyncRedis | AsyncRedisCluster | None = None


async def get_redis() -> AsyncRedis | AsyncRedisCluster:
    global _redis
    if _redis is None:
        if settings.redis_mode == "cluster":
            nodes = _parse_cluster_nodes()
            _redis = AsyncRedisCluster(
                host=nodes[0][0], port=nodes[0][1],
                password=settings.redis_password or None,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_keepalive=True,
            )
        else:
            _redis = AsyncRedis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_keepalive=True,
            )
    return _redis


def _parse_cluster_nodes() -> list[tuple[str, int]]:
    if settings.redis_cluster_nodes:
        nodes = []
        for item in settings.redis_cluster_nodes.split(","):
            item = item.strip()
            if ":" in item:
                host, port = item.rsplit(":", 1)
                nodes.append((host, int(port)))
        if nodes:
            return nodes
    # Fallback to single host:port
    return [(settings.redis_host, settings.redis_port)]


async def close_redis():
    global _redis
    if _redis:
        await _redis.close()
        _redis = None


class CacheBackend:
    """Redis cache — supports both single-node and cluster mode.

    In cluster mode, key tags {_} are used to colocate related hash keys
    on the same node.
    """

    def __init__(self, prefix: str = ""):
        self.prefix = prefix or settings.redis_prefix
        self._cluster = settings.redis_mode == "cluster"

    def _k(self, key: str) -> str:
        k = f"{self.prefix}{key}"
        if self._cluster:
            # Hash tag ensures keys with same {} land on same slot
            return "{" + k + "}"
        return k

    async def get(self, key: str) -> dict[str, Any] | None:
        try:
            r = await get_redis()
            data = await r.get(self._k(key))
            if data:
                return json.loads(data)
        except Exception as e:
            logger.warning(f"Cache GET error for key={key}: {e}")
        return None

    async def set(self, key: str, value: dict[str, Any], ttl: int | None = None) -> None:
        try:
            r = await get_redis()
            k = self._k(key)
            v = json.dumps(value, ensure_ascii=False)
            if ttl:
                await r.setex(k, ttl, v)
            else:
                await r.set(k, v)
        except Exception as e:
            logger.warning(f"Cache SET error for key={key}: {e}")

    async def delete(self, key: str) -> None:
        try:
            r = await get_redis()
            await r.delete(self._k(key))
        except Exception as e:
            logger.warning(f"Cache DEL error for key={key}: {e}")

    async def hash_get(self, key: str, field: str) -> str | None:
        try:
            r = await get_redis()
            return await r.hget(self._k(key), field)
        except Exception as e:
            logger.warning(f"Cache HGET error for key={key} field={field}: {e}")
            return None

    async def hash_set(self, key: str, field: str, value: str) -> None:
        try:
            r = await get_redis()
            await r.hset(self._k(key), field, value)
        except Exception as e:
            logger.warning(f"Cache HSET error for key={key} field={field}: {e}")

    async def hash_get_all(self, key: str) -> dict[str, str]:
        try:
            r = await get_redis()
            return await r.hgetall(self._k(key))
        except Exception as e:
            logger.warning(f"Cache HGETALL error for key={key}: {e}")
            return {}

    async def hash_delete(self, key: str, field: str) -> None:
        try:
            r = await get_redis()
            await r.hdel(self._k(key), field)
        except Exception as e:
            logger.warning(f"Cache HDEL error for key={key} field={field}: {e}")

    async def hash_exists(self, key: str, field: str) -> bool:
        try:
            r = await get_redis()
            return await r.hexists(self._k(key), field)
        except Exception as e:
            logger.warning(f"Cache HEXISTS error for key={key} field={field}: {e}")
            return False

    async def hash_incrby(self, key: str, field: str, amount: int = 1) -> int:
        try:
            r = await get_redis()
            return await r.hincrby(self._k(key), field, amount)
        except Exception as e:
            logger.warning(f"Cache HINCRBY error for key={key} field={field}: {e}")
            return 0

    async def get_all_hash_keys(self) -> list[str]:
        r = await get_redis()
        prefix_len = len(self.prefix)
        keys = []
        try:
            cursor = 0
            while True:
                cursor, batch = await r.scan(cursor, match=f"{self.prefix}*", count=100)
                for k in batch:
                    if isinstance(k, bytes):
                        k = k.decode()
                    if self._cluster and k.startswith("{") and k.endswith("}"):
                        k = k[1:-1]
                    keys.append(k[prefix_len:])
                if cursor == 0:
                    break
        except Exception as e:
            logger.warning(f"Cache SCAN error: {e}")
        return keys

    async def incr(self, key: str, ttl: int | None = None) -> int:
        try:
            r = await get_redis()
            k = self._k(key)
            script = """
            local v = redis.call('INCR', KEYS[1])
            if v == 1 and ARGV[1] ~= '' then
                redis.call('EXPIRE', KEYS[1], ARGV[1])
            end
            return v
            """
            ttl_str = str(ttl) if ttl and ttl > 0 else ""
            return await r.eval(script, 1, k, ttl_str)
        except Exception as e:
            logger.warning(f"Cache INCR error for key={key}: {e}")
            return 0

    async def set_nx(self, key: str, value: str, ttl: int | None = None) -> bool:
        try:
            r = await get_redis()
            k = self._k(key)
            if ttl and ttl > 0:
                return await r.set(k, value, nx=True, ex=ttl)
            return await r.set(k, value, nx=True)
        except Exception as e:
            logger.warning(f"Cache SET_NX error for key={key}: {e}")
            return False

    async def key_exists(self, key: str) -> bool:
        try:
            r = await get_redis()
            return await r.exists(self._k(key)) > 0
        except Exception as e:
            logger.warning(f"Cache EXISTS error for key={key}: {e}")
            return False


# Global cache instance
cache: CacheBackend = CacheBackend()


def get_cache() -> CacheBackend:
    return cache
