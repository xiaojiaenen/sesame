import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import async_session, init_db
from app.routers import admin, anthropic, chat, health, user
from app.services.apikey_service import load_keys_to_cache
from app.services.auth_service import create_user, get_user
from app.services.mapping_service import load_mappings_to_cache
from app.services.proxy_route_service import load_routes_to_cache
from app.services.rate_limit_service import cleanup_old_records
from app.services.channel_service import load_channels_to_cache

logger = logging.getLogger("sesame")


async def _periodic_cleanup():
    while True:
        await asyncio.sleep(300)
        try:
            async with async_session() as db:
                await cleanup_old_records(db)
        except Exception:
            pass


async def _init_admin():
    """Create default admin user if not exists."""
    if not settings.admin_password:
        logger.warning("ADMIN_PASSWORD not set, skipping admin user creation")
        return
    async with async_session() as db:
        existing = await get_user(db, settings.admin_user)
        if not existing:
            await create_user(db, settings.admin_user, settings.admin_password, role="admin")
            logger.info(f"Created default admin user: {settings.admin_user}")
        else:
            logger.info(f"Admin user already exists: {settings.admin_user}")


async def _init_default_routes():
    """Create default proxy routes from config."""
    if not settings.default_routes:
        return
    try:
        routes = json.loads(settings.default_routes)
        from app.services.proxy_route_service import create_route, get_route
        async with async_session() as db:
            for r in routes:
                existing = get_route(r["path"])
                if not existing:
                    await create_route(db, **r)
                    logger.info(f"Created default route: {r['path']} -> {r['backend_path']}")
    except Exception as e:
        logger.warning(f"Failed to init default routes: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _init_admin()
    await _init_default_routes()
    async with async_session() as db:
        await load_mappings_to_cache(db)
        await load_keys_to_cache(db)
        await load_routes_to_cache(db)
        await load_channels_to_cache(db)
    task = asyncio.create_task(_periodic_cleanup())
    yield
    task.cancel()
    # Cleanup httpx client
    from app.services.proxy_service import close_client
    await close_client()


app = FastAPI(
    title="Sesame Gateway",
    description="Enterprise OpenAI API Gateway",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(anthropic.router)
app.include_router(chat.router)
app.include_router(health.router)
app.include_router(admin.router)
app.include_router(user.router)
