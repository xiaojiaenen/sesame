import time
from abc import ABC, abstractmethod
from typing import Any


class CacheBackend(ABC):
    @abstractmethod
    async def get(self, key: str) -> dict[str, Any] | None: ...

    @abstractmethod
    async def set(self, key: str, value: dict[str, Any], ttl: int | None = None) -> None: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...

    @abstractmethod
    async def hash_get(self, key: str, field: str) -> str | None: ...

    @abstractmethod
    async def hash_set(self, key: str, field: str, value: str) -> None: ...

    @abstractmethod
    async def hash_get_all(self, key: str) -> dict[str, str]: ...

    @abstractmethod
    async def hash_delete(self, key: str, field: str) -> None: ...

    @abstractmethod
    async def get_all_hash_keys(self) -> list[str]: ...


class MemoryCache(CacheBackend):
    def __init__(self):
        self._store: dict[str, tuple[Any, float | None]] = {}
        self._hashes: dict[str, dict[str, str]] = {}

    def _is_expired(self, expires_at: float | None) -> bool:
        return expires_at is not None and time.time() > expires_at

    async def get(self, key: str) -> dict[str, Any] | None:
        if key in self._store:
            value, expires_at = self._store[key]
            if self._is_expired(expires_at):
                del self._store[key]
                return None
            return value
        return None

    async def set(self, key: str, value: dict[str, Any], ttl: int | None = None) -> None:
        expires_at = time.time() + ttl if ttl else None
        self._store[key] = (value, expires_at)

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def hash_get(self, key: str, field: str) -> str | None:
        h = self._hashes.get(key)
        if h is None:
            return None
        return h.get(field)

    async def hash_set(self, key: str, field: str, value: str) -> None:
        if key not in self._hashes:
            self._hashes[key] = {}
        self._hashes[key][field] = value

    async def hash_get_all(self, key: str) -> dict[str, str]:
        return dict(self._hashes.get(key, {}))

    async def hash_delete(self, key: str, field: str) -> None:
        h = self._hashes.get(key)
        if h:
            h.pop(field, None)

    async def get_all_hash_keys(self) -> list[str]:
        return list(self._hashes.keys())


cache: CacheBackend = MemoryCache()


def get_cache() -> CacheBackend:
    return cache
