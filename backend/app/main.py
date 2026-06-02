import asyncio
import logging
import sys
import warnings
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
# 抑制 asyncio 未捕获异常噪音
logging.getLogger("asyncio").setLevel(logging.WARNING)

# 抑制 sqlalchemy pool 连接终止错误的噪音日志
# 异步驱动取消时 do_terminate 中的 asyncio.shield 会被 greenlet 桥接绕过，
# 导致 CancelledError（连接由 pool 自动恢复）。同时抑制 GC 发现未归还连接时的
# ERROR 日志——这些连接会在 engine.dispose() 时统一清理。
class _PoolNoiseFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        if "Exception terminating connection" in msg:
            return False
        if "Exception during reset or similar" in msg:
            return False
        if "garbage collector is trying to clean up" in msg:
            return False
        if "Not connected" in msg:
            return False
        return True

logging.getLogger("sqlalchemy.pool.impl.AsyncAdaptedQueuePool").addFilter(_PoolNoiseFilter())
# 抑制 SQLAlchemy GC 清理未归还连接的 SAWarning（连接由 pool 自动恢复，engine.dispose() 时统一清理）
warnings.filterwarnings("ignore", message=".*garbage collector is trying to clean up.*")
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import async_session, init_db
from app.routers import admin, anthropic, chat, health, responses, user
from app.services.apikey_service import load_keys_to_cache
from app.services.auth_service import create_user, get_user
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
    # 提前续期的缓冲时间（在过期前 2 小时就开始续期）
    REFRESH_BUFFER_HOURS = 2

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
                        now = now_beijing()
                        expired_by_time = ucc.expire_at and ucc.expire_at < now
                        # 即将过期（缓冲时间内）
                        expiring_soon = (
                            ucc.expire_at
                            and not expired_by_time
                            and (ucc.expire_at - now).total_seconds() < REFRESH_BUFFER_HOURS * 3600
                        )

                        if not expired_by_time and not expiring_soon:
                            # 未到过期时间，验证 cookie 是否还有效
                            cookie = decrypt(ucc.cookie_encrypted)
                            channel = channel_service.get_channel(ucc.channel_id)
                            if not channel:
                                continue
                            valid, _ = await validate_cookie(cookie, ucc.channel_id)
                            if valid:
                                continue
                            # cookie 已失效
                            logger.info(f"Cookie invalid user={ucc.user_id} ch={ucc.channel_id}")

                        if expiring_soon:
                            logger.info(f"Cookie expiring soon user={ucc.user_id} ch={ucc.channel_id} expire_at={ucc.expire_at}")

                        # cookie 已过期 / 即将过期 / 失效
                        if ucc.auto_refresh and ucc.login_url and ucc.username and ucc.password_encrypted:
                            # 自动续期：重新登录
                            pwd = decrypt(ucc.password_encrypted)
                            success, msg, new_cookie, real_expire = await login_with_credentials(
                                ucc.login_url, ucc.username, pwd
                            )
                            if success and new_cookie:
                                ucc.cookie_encrypted = encrypt(new_cookie)
                                ucc.expire_at = real_expire if real_expire else now + timedelta(days=7)
                                ucc.updated_at = now
                                ucc.status = "active"
                                await db.commit()
                                logger.info(f"Auto-refreshed cookie user={ucc.user_id} ch={ucc.channel_id} new_expire={ucc.expire_at}")
                            else:
                                # 只有真正过期或失效才标记 expired，即将过期的暂时保留
                                if expired_by_time or not expiring_soon:
                                    ucc.status = "expired"
                                    await db.commit()
                                    logger.warning(f"Auto-refresh failed, marked expired user={ucc.user_id} ch={ucc.channel_id}: {msg}")
                                else:
                                    logger.warning(f"Auto-refresh failed but cookie still valid, will retry user={ucc.user_id} ch={ucc.channel_id}: {msg}")
                        else:
                            # 手动 cookie：只有真正过期才标记
                            if expired_by_time:
                                ucc.status = "expired"
                                await db.commit()
                                logger.info(f"Cookie expired user={ucc.user_id} ch={ucc.channel_id}")
                    except Exception as e:
                        logger.warning(f"Cookie check failed user={ucc.user_id}: {e}")
        except Exception as e:
            logger.warning(f"Cookie check loop error: {e}")


async def _channel_health_loop():
    """定时检测所有渠道健康状态（每 5 分钟检查一次）"""
    while True:
        await asyncio.sleep(300)
        try:
            from app.services import channel_service
            from app.services.proxy_service import get_client
            import httpx

            channels = channel_service.get_channels()
            if not channels:
                continue

            client = await get_client()
            for ch in channels:
                if not ch.get("base_url"):
                    continue
                try:
                    url = f"{ch['base_url']}/v1/models"
                    headers = {}
                    if ch.get("api_key"):
                        headers["Authorization"] = f"Bearer {ch['api_key']}"
                    resp = await client.get(url, headers=headers, timeout=httpx.Timeout(10.0, connect=5.0))
                    if resp.status_code in (200, 401, 403):
                        new_status = "active"
                        error_msg = None
                    else:
                        new_status = "error"
                        error_msg = f"HTTP {resp.status_code}"
                except Exception as e:
                    new_status = "error"
                    error_msg = str(e)[:200]

                if ch.get("status") != new_status:
                    try:
                        async with async_session() as db:
                            await channel_service.update_channel_status(db, ch["id"], new_status, error_msg)
                        logger.info(f"[HEALTH] Channel {ch['name']} status: {ch.get('status')} -> {new_status}")
                    except Exception as e:
                        logger.warning(f"[HEALTH] Failed to update channel {ch['name']}: {e}")
        except Exception as e:
            logger.warning(f"Channel health check loop error: {e}")


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
        await load_keys_to_cache(db)
        logger.info("API keys loaded.")
        await load_channels_to_cache(db)
        logger.info("Channels loaded.")
        from app.services.user_pref_cache import load_user_prefs
        await load_user_prefs(db)
        logger.info("User preferences cached.")

    cookie_task = asyncio.create_task(_cookie_check_loop())
    health_task = asyncio.create_task(_channel_health_loop())

    def _bg_task_done(task: asyncio.Task):
        if task.cancelled():
            return
        exc = task.exception()
        if exc:
            logger.error(f"Background task crashed: {exc}")

    cookie_task.add_done_callback(_bg_task_done)
    health_task.add_done_callback(_bg_task_done)
    logger.info("Application startup complete.")
    yield
    cookie_task.cancel()
    health_task.cancel()
    for t in (cookie_task, health_task):
        try:
            await asyncio.wait_for(t, timeout=5)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    from app.services.proxy_service import close_client
    from app.cache import close_redis
    from app.database import engine
    await close_client()
    await close_redis()
    # 确保连接池被彻底清空——即使 shutdown 期间触发了取消也要执行完毕
    await asyncio.shield(engine.dispose())


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
app.include_router(responses.router)
app.include_router(chat.router)
app.include_router(health.router)
app.include_router(admin.router)
app.include_router(user.router)
