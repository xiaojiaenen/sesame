from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthUser, get_jwt_user
from app.config import settings
from app.database import get_db
from app.models.schemas import (
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyResponse,
    ApiKeyUpdate,
    AutoLoginRequest,
    CookieSubmit,
    TokenResponse,
    UserInfo,
    UserLogin,
)
from sqlalchemy import select, and_
from app.utils import now_beijing
from app.models.db_models import UserChannelCookie
from app.services import apikey_service, channel_service, proxy_service
from app.services.auth_service import create_access_token, get_user, verify_password

router = APIRouter(prefix="/user")


@router.post("/login", response_model=TokenResponse)
async def login(req: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await get_user(db, req.user_id)
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已禁用")
    return TokenResponse(access_token=create_access_token(req.user_id, user.role))


@router.get("/profile", response_model=UserInfo)
async def profile(
    auth: AuthUser = Depends(get_jwt_user),
):
    return UserInfo(user_id=auth.user_id, role=auth.role, is_active=True)


@router.put("/password")
async def change_password(
    old_password: str,
    new_password: str,
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    """用户修改自己的密码"""
    from app.services.auth_service import hash_password
    user = await get_user(db, auth.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if not verify_password(old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="原密码错误")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码长度不能少于 6 位")
    user.password_hash = await hash_password(new_password)
    await db.commit()
    return {"message": "密码修改成功"}


# --- Channel Management (用户侧) ---


@router.get("/channels")
async def list_channels(
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, le=1000),
    offset: int = 0,
):
    """获取所有可用渠道（用户视角）"""
    channels = await channel_service.get_all_channels(db)
    total = await channel_service.count_all_channels(db)
    result = []
    for c in channels:
        if not c.is_enabled:
            continue
        item = {
            "id": c.id,
            "name": c.name,
            "base_url": c.base_url,
            "auth_type": c.auth_type or "api_key",
            "models": c.models,
            "status": c.status,
        }
        # 如果是 cookie 类型，附带用户自己的 cookie 状态
        if item["auth_type"] == "cookie":
            row = await db.execute(
                select(UserChannelCookie).where(
                    and_(
                        UserChannelCookie.user_id == auth.user_id,
                        UserChannelCookie.channel_id == c.id,
                        UserChannelCookie.status == "active",
                    )
                )
            )
            ucc = row.scalar_one_or_none()
            if ucc:
                expired = ucc.expire_at and ucc.expire_at < now_beijing()
                item["user_cookie_status"] = "expired" if expired else "active"
                item["cookie_expire_at"] = ucc.expire_at.isoformat() if ucc.expire_at else None
            else:
                item["user_cookie_status"] = "none"
                item["cookie_expire_at"] = None
        result.append(item)
    return {"total": len(result), "channels": result}


@router.post("/channels/{channel_id}/cookie")
async def submit_channel_cookie(
    channel_id: int,
    req: CookieSubmit,
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    """为 cookie 类型渠道提交自己的 cookie"""
    from app.crypto import encrypt

    channel = channel_service.get_channel(channel_id)
    if not channel or channel.get("auth_type") != "cookie":
        raise HTTPException(status_code=404, detail="渠道不存在或不是 Cookie 类型")

    # 验证 cookie
    if settings.validate_cookie_on_submit:
        valid, msg = await proxy_service.validate_cookie(req.cookie)
        if not valid:
            raise HTTPException(status_code=400, detail=msg)

    from datetime import timedelta
    days = req.expire_days or settings.default_cookie_expire_days
    expire_at = now_beijing() + timedelta(days=days)

    encrypted = encrypt(req.cookie)

    # Upsert
    result = await db.execute(
        select(UserChannelCookie).where(
            and_(
                UserChannelCookie.user_id == auth.user_id,
                UserChannelCookie.channel_id == channel_id,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.cookie_encrypted = encrypted
        existing.status = "active"
        existing.expire_at = expire_at
        existing.updated_at = now_beijing()
    else:
        db.add(UserChannelCookie(
            user_id=auth.user_id,
            channel_id=channel_id,
            cookie_encrypted=encrypted,
            status="active",
            expire_at=expire_at,
        ))

    await db.commit()
    return {"status": "ok", "channel_id": channel_id}


@router.get("/channels/{channel_id}/cookie")
async def get_channel_cookie(
    channel_id: int,
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    """查看自己在该渠道的 cookie 状态"""
    result = await db.execute(
        select(UserChannelCookie).where(
            and_(
                UserChannelCookie.user_id == auth.user_id,
                UserChannelCookie.channel_id == channel_id,
            )
        )
    )
    ucc = result.scalar_one_or_none()
    if not ucc:
        return {"status": "none", "expire_at": None, "cookie_preview": ""}
    from app.crypto import decrypt
    try:
        plain = decrypt(ucc.cookie_encrypted)
    except Exception:
        plain = ""
    preview = plain[:8] + "..." if len(plain) > 8 else "***"
    # 解密已保存的密码（如果有的话）
    saved_password = ""
    if ucc.password_encrypted:
        try:
            saved_password = decrypt(ucc.password_encrypted)
        except Exception:
            saved_password = ""
    expired = ucc.expire_at and ucc.expire_at < now_beijing()
    return {
        "status": "expired" if expired else ucc.status,
        "expire_at": ucc.expire_at.isoformat() if ucc.expire_at else None,
        "cookie_preview": preview,
        "login_url": ucc.login_url or "",
        "username": ucc.username or "",
        "password": saved_password,
        "auto_refresh": ucc.auto_refresh or False,
    }


@router.delete("/channels/{channel_id}/cookie")
async def delete_channel_cookie(
    channel_id: int,
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    """删除自己在该渠道的 cookie"""
    result = await db.execute(
        select(UserChannelCookie).where(
            and_(
                UserChannelCookie.user_id == auth.user_id,
                UserChannelCookie.channel_id == channel_id,
            )
        )
    )
    ucc = result.scalar_one_or_none()
    if not ucc:
        raise HTTPException(status_code=404, detail="未找到 Cookie 配置")
    await db.delete(ucc)
    await db.commit()
    return {"status": "deleted"}


@router.post("/channels/{channel_id}/cookie/auto-login")
async def auto_login_channel(
    channel_id: int,
    req: AutoLoginRequest,
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    """使用账号密码自动获取 Cookie"""
    from app.crypto import encrypt
    from app.services.auto_login_service import login_with_credentials

    channel = channel_service.get_channel(channel_id)
    if not channel or channel.get("auth_type") != "cookie":
        raise HTTPException(status_code=404, detail="渠道不存在或不是 Cookie 类型")

    login_url = req.login_url or channel.get("base_url", "")
    if not login_url:
        raise HTTPException(status_code=400, detail="未配置登录地址，请在渠道中设置 Base URL")

    success, msg, cookie, real_expire = await login_with_credentials(
        login_url=login_url,
        username=req.username,
        password=req.password,
    )
    if not success:
        raise HTTPException(status_code=400, detail=msg)

    # 保存 cookie + 登录凭证，使用真实过期时间（无则默认 7 天）
    expire_at = real_expire if real_expire else now_beijing() + timedelta(days=7)
    encrypted = encrypt(cookie)
    password_enc = encrypt(req.password)

    result = await db.execute(
        select(UserChannelCookie).where(
            and_(
                UserChannelCookie.user_id == auth.user_id,
                UserChannelCookie.channel_id == channel_id,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.cookie_encrypted = encrypted
        existing.status = "active"
        existing.expire_at = expire_at
        existing.login_url = login_url
        existing.username = req.username
        existing.password_encrypted = password_enc
        existing.auto_refresh = req.auto_refresh
        existing.updated_at = now_beijing()
    else:
        db.add(UserChannelCookie(
            user_id=auth.user_id,
            channel_id=channel_id,
            cookie_encrypted=encrypted,
            status="active",
            expire_at=expire_at,
            login_url=login_url,
            username=req.username,
            password_encrypted=password_enc,
            auto_refresh=req.auto_refresh,
        ))

    await db.commit()
    return {"status": "ok", "message": msg}


# --- API Key Management ---


@router.post("/api-keys", response_model=ApiKeyCreated)
async def create_key(
    req: ApiKeyCreate,
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    full_key, api_key = await apikey_service.create_api_key(
        db,
        user_id=auth.user_id,
        name=req.name,
        max_qpm=req.max_qpm,
        expire_days=req.expire_days,
    )
    return ApiKeyCreated(
        id=api_key.id,
        key_prefix=api_key.key_prefix,
        name=api_key.name,
        max_qpm=api_key.max_qpm,
        is_active=api_key.is_active,
        expire_at=api_key.expire_at.isoformat() if api_key.expire_at else None,
        created_at=api_key.created_at.isoformat() if api_key.created_at else None,
        last_used_at=api_key.last_used_at.isoformat() if api_key.last_used_at else None,
        api_key=full_key,
    )


@router.get("/api-keys", response_model=list[ApiKeyResponse])
async def list_keys(
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    keys = await apikey_service.get_user_keys(db, auth.user_id)
    return [
        ApiKeyResponse(
            id=k.id,
            key_prefix=k.key_prefix,
            name=k.name,
            max_qpm=k.max_qpm,
            is_active=k.is_active,
            expire_at=k.expire_at.isoformat() if k.expire_at else None,
            created_at=k.created_at.isoformat() if k.created_at else None,
            last_used_at=k.last_used_at.isoformat() if k.last_used_at else None,
        )
        for k in keys
    ]


@router.patch("/api-keys/{key_id}")
async def update_key(
    key_id: int,
    req: ApiKeyUpdate,
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    updated = await apikey_service.update_api_key(
        db, key_id, user_id=auth.user_id, **req.model_dump(exclude_none=True)
    )
    if not updated:
        raise HTTPException(status_code=404, detail="未找到 API Key")
    return {"status": "ok"}


@router.delete("/api-keys/{key_id}")
async def delete_key(
    key_id: int,
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await apikey_service.delete_api_key(db, key_id, user_id=auth.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="未找到 API Key")
    return {"status": "deleted"}


@router.get("/api-keys/{key_id}/reveal")
async def reveal_key(
    key_id: int,
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    """获取完整 API Key（仅限所有者）"""
    full_key = await apikey_service.reveal_key(db, key_id, auth.user_id)
    if not full_key:
        raise HTTPException(status_code=404, detail="未找到 API Key 或无法解密")
    return {"api_key": full_key}


@router.get("/models")
async def list_models():
    """返回所有渠道中配置的可用模型列表"""
    models = set()
    for ch in channel_service.get_channels():
        for model_name in ch.get("models", {}).keys():
            models.add(model_name)
    return [{"external_model": m} for m in sorted(models)]


# --- User Preferences ---


@router.get("/preferences")
async def get_preferences(
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.db_models import User
    result = await db.execute(select(User).where(User.user_id == auth.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {
        "preferred_channel_id": user.preferred_channel_id,
        "load_balance_enabled": user.load_balance_enabled if user.load_balance_enabled is not None else True,
        "default_model": user.default_model,
    }


@router.put("/preferences")
async def update_preferences(
    preferred_channel_id: int | None = None,
    load_balance_enabled: bool | None = None,
    default_model: str | None = None,
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.db_models import User
    from sqlalchemy import update
    update_data = {}
    if preferred_channel_id is not None:
        update_data["preferred_channel_id"] = preferred_channel_id
    if load_balance_enabled is not None:
        update_data["load_balance_enabled"] = load_balance_enabled
    if default_model is not None:
        update_data["default_model"] = default_model if default_model != "" else None
    if update_data:
        await db.execute(update(User).where(User.user_id == auth.user_id).values(**update_data))
        await db.commit()
        from app.services.user_pref_cache import set_user_prefs
        # 重新读取以保持缓存与 DB 一致
        result = await db.execute(select(User).where(User.user_id == auth.user_id))
        user = result.scalar_one_or_none()
        if user:
            set_user_prefs(auth.user_id, user.preferred_channel_id, user.load_balance_enabled if user.load_balance_enabled is not None else True, user.default_model)
    return {"status": "ok"}


# --- Request Logs (用户自己的) ---


@router.get("/logs")
async def get_my_logs(
    model: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    errors_only: bool = False,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    auth: AuthUser = Depends(get_jwt_user),
):
    from app.services import log_service

    logs = await log_service.get_logs(db, auth.user_id, model, start_date, end_date, limit, offset, errors_only)
    total = await log_service.get_logs_count(db, auth.user_id, model, start_date, end_date, errors_only)
    return {
        "total": total,
        "logs": [
            {
                "id": l.id,
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


# --- Usage Statistics (用户自己的) ---


@router.get("/usage/daily")
async def get_my_daily_usage(
    days: int = Query(30, le=365),
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.log_service import get_daily_stats_for_user
    stats = await get_daily_stats_for_user(db, auth.user_id, days)
    return stats


@router.get("/usage/summary")
async def get_my_usage_summary(
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.log_service import get_user_summary
    stats = await get_user_summary(db, auth.user_id)
    return stats


@router.get("/usage/by-model")
async def get_my_usage_by_model(
    days: int = Query(30, le=365),
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    """用户自己的模型用量分布"""
    from datetime import timedelta
    from sqlalchemy import func, select
    from app.models.db_models import UsageStats
    from app.utils import now_beijing

    start_date = (now_beijing() - timedelta(days=days)).strftime("%Y-%m-%d")
    result = await db.execute(
        select(
            UsageStats.model,
            func.sum(UsageStats.total_requests).label("total_requests"),
            func.sum(UsageStats.total_tokens).label("total_tokens"),
            func.sum(UsageStats.total_prompt_tokens).label("prompt_tokens"),
            func.sum(UsageStats.total_completion_tokens).label("completion_tokens"),
        )
        .where(UsageStats.user_id == auth.user_id)
        .where(UsageStats.date >= start_date)
        .group_by(UsageStats.model)
        .order_by(func.sum(UsageStats.total_tokens).desc())
    )
    return [
        {
            "model": row.model or "unknown",
            "total_requests": row.total_requests or 0,
            "total_tokens": row.total_tokens or 0,
            "prompt_tokens": row.prompt_tokens or 0,
            "completion_tokens": row.completion_tokens or 0,
        }
        for row in result.all()
    ]
