import asyncio
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


async def _refresh_cookies_loop():
    """定时刷新即将过期的 Cookie（每 30 分钟检查一次）"""
    while True:
        await asyncio.sleep(1800)
        try:
            from app.models.db_models import UserChannelCookie
            from sqlalchemy import select, and_
            from datetime import timedelta
            from app.utils import now_beijing
            from app.crypto import encrypt, decrypt
            from app.services.auto_login_service import login_with_credentials

            async with async_session() as db:
                # 自动续期：有登录凭证且即将过期的
                threshold = now_beijing() + timedelta(hours=6)
                rows = await db.execute(
                    select(UserChannelCookie).where(
                        and_(
                            UserChannelCookie.auto_refresh == True,
                            UserChannelCookie.status == "active",
                            UserChannelCookie.expire_at != None,
                            UserChannelCookie.expire_at < threshold,
                            UserChannelCookie.login_url != None,
                        )
                    )
                )
                for ucc in rows.scalars().all():
                    try:
                        pwd = decrypt(ucc.password_encrypted)
                        success, _, cookie = await login_with_credentials(
                            ucc.login_url, ucc.username, pwd
                        )
                        if success and cookie:
                            ucc.cookie_encrypted = encrypt(cookie)
                            ucc.expire_at = now_beijing() + timedelta(days=7)
                            ucc.updated_at = now_beijing()
                            await db.commit()
                            logger.info(f"Auto-refreshed cookie for user={ucc.user_id} channel={ucc.channel_id}")
                    except Exception as e:
                        logger.warning(f"Cookie refresh failed user={ucc.user_id}: {e}")
        except Exception as e:
            logger.warning(f"Cookie refresh loop error: {e}")


async def _validate_cookies_loop():
    """定时检测手动提交的 Cookie 是否仍然有效（每 30 分钟检查一次）"""
    while True:
        await asyncio.sleep(1800)
        try:
            from app.models.db_models import UserChannelCookie
            from sqlalchemy import select, and_
            from app.utils import now_beijing
            from app.crypto import decrypt
            from app.services.proxy_service import validate_cookie
            from app.services import channel_service

            async with async_session() as db:
                rows = await db.execute(
                    select(UserChannelCookie).where(
                        and_(
                            UserChannelCookie.status == "active",
                            UserChannelCookie.auto_refresh == False,
                        )
                    )
                )
                for ucc in rows.scalars().all():
                    try:
                        cookie = decrypt(ucc.cookie_encrypted)
                        channel = channel_service.get_channel(ucc.channel_id)
                        if not channel:
                            continue
                        valid, msg = await validate_cookie(cookie)
                        if not valid:
                            ucc.status = "expired"
                            await db.commit()
                            logger.info(f"Cookie expired for user={ucc.user_id} channel={ucc.channel_id}: {msg}")
                    except Exception as e:
                        logger.warning(f"Cookie validation failed user={ucc.user_id}: {e}")
        except Exception as e:
            logger.warning(f"Cookie validation loop error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database...")
    await init_db()
    logger.info("Database ready.")

    logger.info("Initializing admin user...")
    await _init_admin()
    logger.info("Admin ready.")

    logger.info("Loading cache...")
    async with async_session() as db:
        await load_mappings_to_cache(db)
        logger.info("Mappings loaded.")
        await load_keys_to_cache(db)
        logger.info("API keys loaded.")
        await load_channels_to_cache(db)
        logger.info("Channels loaded.")

    refresh_task = asyncio.create_task(_refresh_cookies_loop())
    validate_task = asyncio.create_task(_validate_cookies_loop())
    logger.info("Application startup complete.")
    yield
    refresh_task.cancel()
    validate_task.cancel()
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
