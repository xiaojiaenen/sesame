from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import ProxyRoute

# Cache: path -> {backend_path, method, is_streamable}
ROUTE_CACHE: dict[str, dict] = {}


async def load_routes_to_cache(db: AsyncSession):
    result = await db.execute(select(ProxyRoute).where(ProxyRoute.is_enabled == True))
    ROUTE_CACHE.clear()
    for r in result.scalars().all():
        ROUTE_CACHE[r.path] = {
            "backend_path": r.backend_path,
            "method": r.method,
            "is_streamable": r.is_streamable,
        }


def get_route(path: str) -> dict | None:
    return ROUTE_CACHE.get(path)


async def create_route(db: AsyncSession, **kwargs) -> ProxyRoute:
    route = ProxyRoute(**kwargs)
    db.add(route)
    await db.commit()
    await db.refresh(route)
    if route.is_enabled:
        ROUTE_CACHE[route.path] = {
            "backend_path": route.backend_path,
            "method": route.method,
            "is_streamable": route.is_streamable,
        }
    return route


async def list_routes(db: AsyncSession) -> list[ProxyRoute]:
    result = await db.execute(select(ProxyRoute).order_by(ProxyRoute.id))
    return list(result.scalars().all())


async def update_route(db: AsyncSession, route_id: int, **kwargs) -> bool:
    result = await db.execute(select(ProxyRoute).where(ProxyRoute.id == route_id))
    route = result.scalar_one_or_none()
    if not route:
        return False
    for k, v in kwargs.items():
        if v is not None:
            setattr(route, k, v)
    await db.commit()
    # Update cache
    ROUTE_CACHE.pop(route.path, None)
    if route.is_enabled:
        ROUTE_CACHE[route.path] = {
            "backend_path": route.backend_path,
            "method": route.method,
            "is_streamable": route.is_streamable,
        }
    return True


async def delete_route(db: AsyncSession, route_id: int) -> bool:
    result = await db.execute(select(ProxyRoute).where(ProxyRoute.id == route_id))
    route = result.scalar_one_or_none()
    if not route:
        return False
    ROUTE_CACHE.pop(route.path, None)
    await db.delete(route)
    await db.commit()
    return True
