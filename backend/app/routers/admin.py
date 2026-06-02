import json

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthUser, get_admin_user
from app.database import get_db
from app.models.schemas import (
    UserCreate,
)
from app.services import apikey_service, auth_service
from app.services import channel_service, log_service
from app.services.websocket_service import manager

router = APIRouter(prefix="/admin")


# --- User Management ---

@router.post("/users")
async def create_user(
    req: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    existing = await auth_service.get_user(db, req.user_id)
    if existing:
        raise HTTPException(status_code=409, detail="用户已存在")
    user = await auth_service.create_user(db, req.user_id, req.password, req.role)
    return {"user_id": user.user_id, "role": user.role, "is_active": user.is_active}


@router.get("/users")
async def list_users(
    limit: int = Query(100, le=1000),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    users = await auth_service.list_users(db, limit=limit, offset=offset)
    total = await auth_service.count_users(db)
    return {
        "total": total,
        "users": [
            {
                "user_id": u.user_id,
                "role": u.role,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


@router.delete("/users/{user_id}")
async def disable_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    disabled = await auth_service.disable_user(db, user_id)
    if not disabled:
        raise HTTPException(status_code=404, detail="用户不存在")
    from app.services.user_pref_cache import remove_user_prefs
    remove_user_prefs(user_id)
    return {"status": "disabled", "user_id": user_id}


@router.put("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    new_password: str,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    """管理员重置用户密码"""
    from app.services.auth_service import hash_password
    user = await auth_service.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="密码长度不能少于 6 位")
    user.password_hash = await hash_password(new_password)
    await db.commit()
    return {"message": f"用户 {user_id} 密码已重置"}


# --- Global API Key View ---

@router.get("/api-keys")
async def list_all_keys(
    limit: int = Query(100, le=1000),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    keys = await apikey_service.get_all_keys(db, limit=limit, offset=offset)
    total = await apikey_service.count_all_keys(db)
    return {
        "total": total,
        "keys": [
            {
                "id": k.id,
                "key_prefix": k.key_prefix,
                "name": k.name,
                "user_id": k.user_id,
                "max_qpm": k.max_qpm,
                "is_active": k.is_active,
                "expire_at": k.expire_at.isoformat() if k.expire_at else None,
                "created_at": k.created_at.isoformat() if k.created_at else None,
                "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
            }
            for k in keys
        ],
    }


@router.delete("/api-keys/{key_id}")
async def force_delete_key(
    key_id: int,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    deleted = await apikey_service.delete_api_key(db, key_id, user_id=None)
    if not deleted:
        raise HTTPException(status_code=404, detail="API Key 不存在")
    return {"status": "deleted", "key_id": key_id}


# --- Channels (多渠道支持) ---

@router.get("/channels")
async def list_channels(
    limit: int = Query(100, le=1000),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    channels = await channel_service.get_all_channels(db, limit=limit, offset=offset)
    total = await channel_service.count_all_channels(db)
    return {
        "total": total,
        "channels": [
            {
                "id": c.id,
                "name": c.name,
                "base_url": c.base_url,
                "auth_type": c.auth_type or "api_key",
                "models": c.models,
                "weight": c.weight,
                "is_enabled": c.is_enabled,
                "status": c.status,
                "priority": c.priority,
                "max_qps": c.max_qps,
                "last_check": c.last_check.isoformat() if c.last_check else None,
                "error_message": c.error_message,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in channels
        ],
    }


@router.post("/channels")
async def create_channel(
    name: str,
    base_url: str,
    api_key: str = "",
    auth_type: str = "api_key",
    models: str | None = None,
    weight: int = 1,
    priority: int = 0,
    max_qps: int = 10,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    channel = await channel_service.create_channel(
        db,
        name=name,
        base_url=base_url,
        api_key=api_key,
        auth_type=auth_type,
        models=models,
        weight=weight,
        priority=priority,
        max_qps=max_qps,
    )
    return {
        "id": channel.id,
        "name": channel.name,
        "base_url": channel.base_url,
        "auth_type": channel.auth_type,
        "status": "created",
    }


@router.put("/channels/{channel_id}")
async def update_channel(
    channel_id: int,
    name: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    auth_type: str | None = None,
    models: str | None = None,
    weight: int | None = None,
    priority: int | None = None,
    max_qps: int | None = None,
    is_enabled: bool | None = None,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    update_data = {}
    if name is not None:
        update_data["name"] = name
    if base_url is not None:
        update_data["base_url"] = base_url
    if api_key:  # 空字符串不覆盖已有 key
        update_data["api_key"] = api_key
    if auth_type is not None:
        update_data["auth_type"] = auth_type
    if models is not None:
        update_data["models"] = models
    if weight is not None:
        update_data["weight"] = weight
    if priority is not None:
        update_data["priority"] = priority
    if max_qps is not None:
        update_data["max_qps"] = max_qps
    if is_enabled is not None:
        update_data["is_enabled"] = is_enabled

    updated = await channel_service.update_channel(db, channel_id, **update_data)
    if not updated:
        raise HTTPException(status_code=404, detail="渠道不存在")
    return {"status": "updated"}


@router.delete("/channels/{channel_id}")
async def delete_channel(
    channel_id: int,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    deleted = await channel_service.delete_channel(db, channel_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="渠道不存在")
    return {"status": "deleted"}


@router.post("/channels/{channel_id}/test")
async def test_channel(
    channel_id: int,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    """测试渠道连接"""
    channel = channel_service.get_channel(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="渠道不存在")

    import httpx
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if channel.get("auth_type") == "cookie":
                # cookie 渠道：尝试用一个最小请求测试连通性
                # 先尝试获取任意一个活跃 cookie
                from app.services.proxy_service import _get_random_user_cookie
                test_cookie = None
                result = await _get_random_user_cookie(channel_id)
                if result:
                    test_cookie, _ = result

                if test_cookie:
                    # 有 cookie，发送最小 chat 请求验证
                    test_body = json.dumps({
                        "model": list(channel.get("models", {}).values())[0] if channel.get("models") else "test",
                        "messages": [{"role": "user", "content": "hi"}],
                        "max_tokens": 1,
                        "stream": False,
                    }).encode()
                    resp = await client.post(
                        f"{channel['base_url']}/agents/baitong/chat/completions",
                        content=test_body,
                        headers={"Cookie": test_cookie, "Content-Type": "application/json"},
                    )
                    if resp.status_code == 200:
                        await channel_service.update_channel_status(db, channel_id, "active")
                        return {"status": "ok", "message": "连接成功（Cookie 有效）"}
                    elif resp.status_code == 401:
                        await channel_service.update_channel_status(db, channel_id, "error", "Cookie 已失效")
                        return {"status": "error", "message": "Cookie 已失效"}
                    else:
                        await channel_service.update_channel_status(db, channel_id, "error", f"HTTP {resp.status_code}")
                        return {"status": "error", "message": f"HTTP {resp.status_code}"}
                else:
                    # 没有 cookie，仅测试基础连通性
                    try:
                        resp = await client.get(channel['base_url'])
                        await channel_service.update_channel_status(db, channel_id, "active")
                        return {"status": "ok", "message": "基础连通正常（无可用 Cookie 验证）"}
                    except Exception:
                        await channel_service.update_channel_status(db, channel_id, "error", "无法连接到后端")
                        return {"status": "error", "message": "无法连接到后端"}
            else:
                # api_key 渠道：测试 /v1/models
                resp = await client.get(
                    f"{channel['base_url']}/v1/models",
                    headers={"Authorization": f"Bearer {channel['api_key']}"},
                )
                if resp.status_code == 200:
                    await channel_service.update_channel_status(db, channel_id, "active")
                    return {"status": "ok", "message": "连接成功"}
                else:
                    await channel_service.update_channel_status(db, channel_id, "error", f"HTTP {resp.status_code}")
                    return {"status": "error", "message": f"HTTP {resp.status_code}"}
    except Exception as e:
        await channel_service.update_channel_status(db, channel_id, "error", str(e))
        return {"status": "error", "message": str(e)}


# --- Request Logs (请求日志) ---

@router.get("/logs")
async def list_logs(
    user_id: str | None = None,
    model: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    errors_only: bool = False,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    logs = await log_service.get_logs(db, user_id, model, start_date, end_date, limit, offset, errors_only)
    total = await log_service.get_logs_count(db, user_id, model, start_date, end_date, errors_only)
    return {
        "total": total,
        "logs": [
            {
                "id": l.id,
                "user_id": l.user_id,
                "key_id": l.key_id,
                "channel_id": l.channel_id,
                "model": l.model,
                "internal_model": l.internal_model,
                "tokens_prompt": l.tokens_prompt,
                "tokens_completion": l.tokens_completion,
                "latency_ms": l.latency_ms,
                "status_code": l.status_code,
                "is_stream": l.is_stream,
                "api_format": l.api_format,
                "error_message": l.error_message,
                "request_body": l.request_body,
                "response_body": l.response_body,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ],
    }


# --- Usage Statistics (用量统计) ---

@router.get("/usage/hourly")
async def get_hourly_usage(
    days: int = Query(1, le=7),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    stats = await log_service.get_hourly_stats(db, days)
    return stats


@router.get("/usage/daily")
async def get_daily_usage(
    days: int = Query(30, le=365),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    stats = await log_service.get_daily_stats(db, days)
    return stats


@router.get("/usage/by-model")
async def get_usage_by_model(
    days: int = Query(30, le=365),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    stats = await log_service.get_model_stats(db, days)
    return stats


@router.get("/usage/by-user")
async def get_usage_by_user(
    days: int = Query(30, le=365),
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    stats = await log_service.get_user_stats(db, days)
    return stats


# --- WebSocket 实时监控 ---

@router.websocket("/ws/monitor")
async def websocket_monitor(websocket: WebSocket):
    """WebSocket 实时监控端点"""
    await manager.connect(websocket)
    try:
        while True:
            # 保持连接活跃，等待客户端消息
            try:
                data = await websocket.receive_text()
                # 处理客户端发送的消息
                if data == "ping":
                    await websocket.send_text("pong")
            except Exception:
                # 接收消息失败，可能是连接已关闭
                break
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await manager.disconnect(websocket)
