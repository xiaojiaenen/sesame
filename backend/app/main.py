import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI

# 配置日志输出到 stdout（Docker 可捕获）
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    stream=sys.stdout,
)
# 降低 uvicorn access 日志噪音
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
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


async def _cookie_check_loop():
    """定时检测所有 Cookie 有效性（每 30 分钟检查一次）"""
    while True:
        await asyncio.sleep(1800)
        try:
            from app.models.db_models import UserChannelCookie
            from sqlalchemy import select, and_
            from datetime import timedelta
            from app.utils import now_beijing
            from app.crypto import encrypt, decrypt
            from app.services.proxy_service import validate_cookie
            from app.services.auto_login_service import login_with_credentials
            from app.services import channel_service

            async with async_session() as db:
                rows = await db.execute(
                    select(UserChannelCookie).where(
                        UserChannelCookie.status == "active"
                    )
                )
                for ucc in rows.scalars().all():
                    try:
                        # 先检查过期时间
                        now = now_beijing()
                        expired_by_time = ucc.expire_at and ucc.expire_at < now

                        if not expired_by_time:
                            # 未到过期时间，验证 cookie 是否还有效
                            cookie = decrypt(ucc.cookie_encrypted)
                            channel = channel_service.get_channel(ucc.channel_id)
                            if not channel:
                                continue
                            valid, _ = await validate_cookie(cookie)
                            if valid:
                                continue
                            # cookie 已失效

                        # cookie 已过期或失效
                        if ucc.auto_refresh and ucc.login_url and ucc.username and ucc.password_encrypted:
                            # 自动续期：重新登录
                            pwd = decrypt(ucc.password_encrypted)
                            success, _, new_cookie, real_expire = await login_with_credentials(
                                ucc.login_url, ucc.username, pwd
                            )
                            if success and new_cookie:
                                ucc.cookie_encrypted = encrypt(new_cookie)
                                ucc.expire_at = real_expire if real_expire else now + timedelta(days=7)
                                ucc.updated_at = now
                                await db.commit()
                                logger.info(f"Auto-refreshed cookie user={ucc.user_id} ch={ucc.channel_id}")
                            else:
                                ucc.status = "expired"
                                await db.commit()
                                logger.warning(f"Auto-refresh failed, marked expired user={ucc.user_id} ch={ucc.channel_id}")
                        else:
                            # 手动 cookie：标记过期
                            ucc.status = "expired"
                            await db.commit()
                            logger.info(f"Cookie expired user={ucc.user_id} ch={ucc.channel_id}")
                    except Exception as e:
                        logger.warning(f"Cookie check failed user={ucc.user_id}: {e}")
        except Exception as e:
            logger.warning(f"Cookie check loop error: {e}")


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

    cookie_task = asyncio.create_task(_cookie_check_loop())
    logger.info("Application startup complete.")
    yield
    cookie_task.cancel()
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
