from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(
    settings.db_url,
    echo=False,
    pool_size=20,
    max_overflow=40,
    pool_recycle=3600,
    pool_pre_ping=True,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


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
            except Exception:
                pass  # 列已存在

        # v1.3 扩大 key_prefix 列长度
        try:
            await conn.execute(text("ALTER TABLE api_keys MODIFY COLUMN key_prefix VARCHAR(20) NOT NULL"))
        except Exception:
            pass
