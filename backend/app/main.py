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
from app.services.channel_service import load_channels_to_cache

logger = logging.getLogger("sesame")


async def _init_admin():
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _init_admin()
    async with async_session() as db:
        await load_mappings_to_cache(db)
        await load_keys_to_cache(db)
        await load_channels_to_cache(db)
    yield
    # Cleanup
    from app.services.proxy_service import close_client
    from app.cache import close_redis
    await close_client()
    await close_redis()


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
