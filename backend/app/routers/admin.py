from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthUser, get_admin_user
from app.database import get_db
from app.models.schemas import (
    ModelMappingInfo,
    ModelMappingRequest,
    ProxyRouteCreate,
    ProxyRouteInfo,
    ProxyRouteUpdate,
    UserCreate,
)
from app.services import apikey_service, auth_service, mapping_service, session_service
from app.services import proxy_route_service, channel_service, log_service
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
    return {"status": "disabled", "user_id": user_id}


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
                "allowed_models": k.allowed_models.split(",") if k.allowed_models else None,
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


# --- Sessions ---

@router.get("/sessions")
async def list_sessions(_: AuthUser = Depends(get_admin_user)):
    return await session_service.list_sessions()


@router.get("/sessions/{user_id}")
async def get_session_detail(
    user_id: str,
    _: AuthUser = Depends(get_admin_user),
):
    detail = await session_service.get_session_detail(user_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Session not found")
    return detail


@router.delete("/sessions/{user_id}")
async def delete_session(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    deleted = await session_service.delete_session(db, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted", "user_id": user_id}


# --- Model Mapping ---

@router.get("/model-mapping", response_model=list[ModelMappingInfo])
async def list_model_mappings(_: AuthUser = Depends(get_admin_user)):
    return await mapping_service.list_mappings()


@router.post("/model-mapping")
async def upsert_model_mapping(
    req: ModelMappingRequest,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    fallback_models = req.fallback_models if hasattr(req, 'fallback_models') else None
    await mapping_service.upsert_mapping(db, req.external_model, req.internal_model, fallback_models)
    return {"status": "ok", "external_model": req.external_model, "internal_model": req.internal_model}


@router.delete("/model-mapping/{external_model}")
async def delete_model_mapping(
    external_model: str,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    deleted = await mapping_service.delete_mapping(db, external_model)
    if not deleted:
        raise HTTPException(status_code=404, detail="映射不存在")
    return {"status": "deleted"}


# --- Proxy Routes ---

@router.post("/proxy-routes", response_model=ProxyRouteInfo)
async def create_proxy_route(
    req: ProxyRouteCreate,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    route = await proxy_route_service.create_route(db, **req.model_dump())
    return ProxyRouteInfo(
        id=route.id,
        path=route.path,
        backend_path=route.backend_path,
        method=route.method,
        is_streamable=route.is_streamable,
        is_enabled=route.is_enabled,
        description=route.description,
        created_at=route.created_at.isoformat() if route.created_at else None,
    )


@router.get("/proxy-routes", response_model=list[ProxyRouteInfo])
async def list_proxy_routes(
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    routes = await proxy_route_service.list_routes(db)
    return [
        ProxyRouteInfo(
            id=r.id,
            path=r.path,
            backend_path=r.backend_path,
            method=r.method,
            is_streamable=r.is_streamable,
            is_enabled=r.is_enabled,
            description=r.description,
            created_at=r.created_at.isoformat() if r.created_at else None,
        )
        for r in routes
    ]


@router.patch("/proxy-routes/{route_id}")
async def update_proxy_route(
    route_id: int,
    req: ProxyRouteUpdate,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    updated = await proxy_route_service.update_route(db, route_id, **req.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="路由不存在")
    return {"status": "ok"}


@router.delete("/proxy-routes/{route_id}")
async def delete_proxy_route(
    route_id: int,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    deleted = await proxy_route_service.delete_route(db, route_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="路由不存在")
    return {"status": "deleted"}


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
    limit: int = Query(100, le=1000),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: AuthUser = Depends(get_admin_user),
):
    logs = await log_service.get_logs(db, user_id, model, start_date, end_date, limit, offset)
    total = await log_service.get_logs_count(db, user_id, model, start_date, end_date)
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
                "error_message": l.error_message,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ],
    }


# --- Usage Statistics (用量统计) ---

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
