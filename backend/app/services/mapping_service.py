import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import get_cache
from app.models.db_models import ModelMapping

MAPPING_KEY = "sesame:model_mapping"
FALLBACK_KEY = "sesame:fallback_models"


async def load_mappings_to_cache(db: AsyncSession):
    result = await db.execute(select(ModelMapping))
    mappings = result.scalars().all()
    cache = get_cache()
    for m in mappings:
        await cache.hash_set(MAPPING_KEY, m.external_model, m.internal_model)
        if m.fallback_models:
            await cache.hash_set(FALLBACK_KEY, m.external_model, m.fallback_models)


async def get_internal_model(external_model: str) -> str | None:
    cache = get_cache()
    internal = await cache.hash_get(MAPPING_KEY, external_model)
    if internal:
        return internal
    return None


async def get_fallback_models(external_model: str) -> list[str]:
    """获取模型的 fallback 列表"""
    cache = get_cache()
    fallback_json = await cache.hash_get(FALLBACK_KEY, external_model)
    if fallback_json:
        try:
            return json.loads(fallback_json)
        except json.JSONDecodeError:
            pass
    return []


async def upsert_mapping(
    db: AsyncSession,
    external_model: str,
    internal_model: str,
    fallback_models: list[str] = None,
):
    result = await db.execute(
        select(ModelMapping).where(ModelMapping.external_model == external_model)
    )
    existing = result.scalar_one_or_none()

    fallback_json = json.dumps(fallback_models) if fallback_models else None

    if existing:
        existing.internal_model = internal_model
        existing.fallback_models = fallback_json
    else:
        db.add(ModelMapping(
            external_model=external_model,
            internal_model=internal_model,
            fallback_models=fallback_json,
        ))
    await db.commit()

    cache = get_cache()
    await cache.hash_set(MAPPING_KEY, external_model, internal_model)
    if fallback_json:
        await cache.hash_set(FALLBACK_KEY, external_model, fallback_json)


async def list_mappings() -> list[dict]:
    cache = get_cache()
    all_mappings = await cache.hash_get_all(MAPPING_KEY)
    result = []
    for k, v in all_mappings.items():
        fallback_json = await cache.hash_get(FALLBACK_KEY, k)
        fallback_models = []
        if fallback_json:
            try:
                fallback_models = json.loads(fallback_json)
            except json.JSONDecodeError:
                pass
        result.append({
            "external_model": k,
            "internal_model": v,
            "fallback_models": fallback_models,
        })
    return result


async def delete_mapping(db: AsyncSession, external_model: str) -> bool:
    result = await db.execute(
        select(ModelMapping).where(ModelMapping.external_model == external_model)
    )
    mapping = result.scalar_one_or_none()
    if not mapping:
        return False
    await db.delete(mapping)
    await db.commit()
    cache = get_cache()
    await cache.hash_delete(MAPPING_KEY, external_model)
    await cache.hash_delete(FALLBACK_KEY, external_model)
    return True
