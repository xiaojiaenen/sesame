import asyncio
import logging
from collections.abc import AsyncGenerator

from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

logger = logging.getLogger("sesame.db")


class SafeAsyncSession(AsyncSession):
    """AsyncSession whose close() is shielded from cancellation.

    When a request task is cancelled mid-flight, the pool connection must still
    be returned.  Without shielding, the greenlet-based driver bridge can raise
    CancelledError inside do_terminate even though the pool already uses
    asyncio.shield() -- leaving the connection checked out forever.
    """

    async def close(self):
        try:
            await asyncio.shield(AsyncSession.close(self))
        except asyncio.CancelledError:
            # Shield itself raised CancelledError — try unshielded close
            try:
                await AsyncSession.close(self)
            except BaseException:
                pass
        except BaseException:
            try:
                await AsyncSession.close(self)
            except BaseException:
                pass


engine = create_async_engine(
    settings.db_url,
    echo=False,
    pool_size=20,
    max_overflow=40,
    pool_recycle=1800,
    pool_timeout=10,
    connect_args={
        "connect_timeout": 10,
        "autocommit": False,
    },
)


async_session = async_sessionmaker(engine, class_=SafeAsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with async_session() as session:
        yield session


async def init_db():
    from app.models.db_models import Base
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # v1.2 新增列迁移
        cols = [
            ("user_channel_cookies", "login_url", "VARCHAR(512) DEFAULT NULL"),
            ("user_channel_cookies", "username", "VARCHAR(128) DEFAULT NULL"),
            ("user_channel_cookies", "password_encrypted", "TEXT DEFAULT NULL"),
            ("user_channel_cookies", "auto_refresh", "TINYINT(1) NOT NULL DEFAULT 0"),
        ]
        for table, col, dtype in cols:
            try:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col}"))
            except ProgrammingError:
                pass  # 列已存在
            except Exception as e:
                logger.warning(f"Migration failed for {table}.{col}: {e}")

        # v1.3 扩大 key_prefix 列长度
        try:
            await conn.execute(text("ALTER TABLE api_keys MODIFY COLUMN key_prefix VARCHAR(20) NOT NULL"))
        except ProgrammingError:
            pass
        except Exception as e:
            logger.warning(f"Migration failed for api_keys.key_prefix: {e}")

        # v1.4 请求日志添加 api_format 列
        try:
            await conn.execute(text("ALTER TABLE request_logs ADD COLUMN api_format VARCHAR(16) DEFAULT NULL"))
        except ProgrammingError:
            pass
        except Exception as e:
            logger.warning(f"Migration failed for request_logs.api_format: {e}")

        # v1.5 用户默认模型
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN default_model VARCHAR(64) DEFAULT NULL"))
        except ProgrammingError:
            pass
        except Exception as e:
            logger.warning(f"Migration failed for users.default_model: {e}")

        # v1.6 请求日志添加请求体和响应体列
        try:
            await conn.execute(text("ALTER TABLE request_logs ADD COLUMN request_body TEXT DEFAULT NULL"))
        except ProgrammingError:
            pass
        except Exception as e:
            logger.warning(f"Migration failed for request_logs.request_body: {e}")
        try:
            await conn.execute(text("ALTER TABLE request_logs ADD COLUMN response_body TEXT DEFAULT NULL"))
        except ProgrammingError:
            pass
        except Exception as e:
            logger.warning(f"Migration failed for request_logs.response_body: {e}")
