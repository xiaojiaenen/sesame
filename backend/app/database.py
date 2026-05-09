from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with async_session() as session:
        yield session


async def init_db():
    from app.models.db_models import Base  # noqa: F811

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # 迁移：为已有表添加新列（create_all 不会修改已有表）
        for stmt in [
            "ALTER TABLE channels ADD COLUMN auth_type VARCHAR(10) NOT NULL DEFAULT 'api_key'",
            "ALTER TABLE users ADD COLUMN preferred_channel_id INTEGER",
            "ALTER TABLE users ADD COLUMN load_balance_enabled BOOLEAN NOT NULL DEFAULT 1",
            "ALTER TABLE request_logs ADD COLUMN internal_model VARCHAR(64)",
        ]:
            try:
                await conn.execute(__import__("sqlalchemy").text(stmt))
            except Exception:
                pass
