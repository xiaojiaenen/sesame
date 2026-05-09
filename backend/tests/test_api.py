import os

import pytest

os.environ.setdefault("ENCRYPTION_KEY", "dGVzdGtleTEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU=")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("VALIDATE_COOKIE_ON_SUBMIT", "false")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest_asyncio.fixture(scope="session")
async def client():
    # Manually init DB since ASGI lifespan may not trigger
    from app.database import init_db, async_session
    from app.services.mapping_service import load_mappings_to_cache
    from app.services.apikey_service import load_keys_to_cache

    await init_db()
    async with async_session() as db:
        await load_mappings_to_cache(db)
        await load_keys_to_cache(db)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _bootstrap_admin(client: AsyncClient) -> dict:
    from app.database import async_session
    from app.services.auth_service import create_user, get_user

    async with async_session() as db:
        existing = await get_user(db, "admin")
        if not existing:
            await create_user(db, "admin", "admin123", role="admin")

    r = await client.post("/user/login", json={"user_id": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _create_user(client: AsyncClient, user_id: str, password: str = "pass1234") -> dict:
    from app.database import async_session
    from app.services.auth_service import create_user, get_user

    async with async_session() as db:
        existing = await get_user(db, user_id)
        if not existing:
            await create_user(db, user_id, password)

    r = await client.post("/user/login", json={"user_id": user_id, "password": password})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_admin_create_user(client):
    admin_h = await _bootstrap_admin(client)
    r = await client.post("/admin/users", headers=admin_h, json={"user_id": "admin_created", "password": "pass1234", "role": "admin"})
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_admin_requires_auth(client):
    r = await client.get("/admin/users")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_user_login_and_profile(client):
    h = await _create_user(client, "profile_user")
    r = await client.get("/user/profile", headers=h)
    assert r.status_code == 200
    assert r.json()["user_id"] == "profile_user"
    assert r.json()["role"] == "user"


@pytest.mark.asyncio
async def test_wrong_password(client):
    await _create_user(client, "wrong_pw_user")
    r = await client.post("/user/login", json={"user_id": "wrong_pw_user", "password": "bad"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_cookie_crud(client):
    h = await _create_user(client, "cookie_user")

    r = await client.get("/user/cookie", headers=h)
    assert r.json()["status"] == "none"

    r = await client.post("/user/cookie", headers=h, json={"cookie": "test=abc"})
    assert r.status_code == 200
    assert r.json()["status"] == "active"

    r = await client.get("/user/cookie", headers=h)
    assert r.json()["status"] == "active"

    r = await client.delete("/user/cookie", headers=h)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_api_key_crud(client):
    h = await _create_user(client, "key_user")

    r = await client.post("/user/api-keys", headers=h, json={"name": "k1", "allowed_models": ["gpt-4"], "max_qpm": 10})
    assert r.status_code == 200
    assert r.json()["api_key"].startswith("sk-sesame-")
    key_id = r.json()["id"]

    r = await client.get("/user/api-keys", headers=h)
    assert len(r.json()) >= 1

    r = await client.delete(f"/user/api-keys/{key_id}", headers=h)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_chat_requires_auth(client):
    r = await client.post("/v1/chat/completions", json={"model": "gpt-4", "messages": []})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_chat_model_permission(client):
    h = await _create_user(client, "model_user")
    await client.post("/user/cookie", headers=h, json={"cookie": "test=abc"})
    r = await client.post("/user/api-keys", headers=h, json={"allowed_models": ["gpt-4"], "max_qpm": 60})
    api_h = {"Authorization": f"Bearer {r.json()['api_key']}"}

    r = await client.post("/v1/chat/completions", headers=api_h, json={"model": "deepseek-r1", "messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_rate_limit(client):
    h = await _create_user(client, "rl_user")
    await client.post("/user/cookie", headers=h, json={"cookie": "test=abc"})
    r = await client.post("/user/api-keys", headers=h, json={"max_qpm": 2})
    api_h = {"Authorization": f"Bearer {r.json()['api_key']}"}

    statuses = []
    for _ in range(4):
        r = await client.post("/v1/chat/completions", headers=api_h, json={"model": "gpt-4", "messages": [{"role": "user", "content": "hi"}]})
        statuses.append(r.status_code)

    assert 429 in statuses


@pytest.mark.asyncio
async def test_disable_user_cascades(client):
    admin_h = await _bootstrap_admin(client)
    h = await _create_user(client, "disable_me")
    await client.post("/user/cookie", headers=h, json={"cookie": "test=abc"})
    r = await client.post("/user/api-keys", headers=h, json={"max_qpm": 60})
    api_key = r.json()["api_key"]

    r = await client.delete("/admin/users/disable_me", headers=admin_h)
    assert r.status_code == 200

    # Login blocked
    r = await client.post("/user/login", json={"user_id": "disable_me", "password": "pass1234"})
    assert r.status_code == 403

    # API key invalidated
    r = await client.post("/v1/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json={"model": "gpt-4", "messages": []})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_non_admin_cannot_manage_users(client):
    h = await _create_user(client, "normal_user2")
    r = await client.get("/admin/users", headers=h)
    assert r.status_code == 403
