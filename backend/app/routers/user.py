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
    CookieInfo,
    CookieSubmit,
    ModelMappingInfo,
    TokenResponse,
    UserInfo,
    UserLogin,
)
from datetime import datetime
from sqlalchemy import select, and_
from app.utils import now_beijing
from app.models.db_models import UserChannelCookie
from app.services import apikey_service, channel_service, mapping_service, proxy_service, session_service
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
    session = await session_service.get_session(auth.user_id)
    session_status = session.get("status") if session else None
    return UserInfo(user_id=auth.user_id, role=auth.role, is_active=True, session_status=session_status)


# --- Cookie Management ---


@router.post("/cookie")
async def submit_cookie(
    req: CookieSubmit,
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate cookie by making a lightweight request to the backend
    if settings.validate_cookie_on_submit:
        valid, msg = await proxy_service.validate_cookie(req.cookie)
        if not valid:
            raise HTTPException(status_code=400, detail=msg)

    result = await session_service.submit_session(
        db, auth.user_id, req.cookie, req.expire_days
    )
    return result


@router.get("/cookie", response_model=CookieInfo)
async def get_cookie(auth: AuthUser = Depends(get_jwt_user)):
    session = await session_service.get_session(auth.user_id)
    if not session:
        return CookieInfo(status="none", expire_at=None, cookie_preview="")
    from app.crypto import decrypt
    try:
        cookie_plain = decrypt(session.get("cookie", ""))
    except Exception:
        cookie_plain = ""
    preview = cookie_plain[:8] + "..." if len(cookie_plain) > 8 else "***"
    return CookieInfo(
        status=session.get("status", "unknown"),
        expire_at=session.get("expire_at"),
        cookie_preview=preview,
    )


@router.delete("/cookie")
async def delete_cookie(
    auth: AuthUser = Depends(get_jwt_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await session_service.delete_session(db, auth.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="未找到 Session")
    return {"status": "deleted"}


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

    expire_at = None
    if req.expire_days:
        from datetime import timedelta
        expire_at = now_beijing() + timedelta(days=req.expire_days)

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
    expired = ucc.expire_at and ucc.expire_at < now_beijing()
    return {
        "status": "expired" if expired else ucc.status,
        "expire_at": ucc.expire_at.isoformat() if ucc.expire_at else None,
        "cookie_preview": preview,
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
        allowed_models=req.allowed_models,
        max_qpm=req.max_qpm,
        expire_days=req.expire_days,
    )
    return ApiKeyCreated(
        id=api_key.id,
        key_prefix=api_key.key_prefix,
        name=api_key.name,
        allowed_models=req.allowed_models,
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
            allowed_models=k.allowed_models.split(",") if k.allowed_models else None,
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


@router.get("/models", response_model=list[ModelMappingInfo])
async def list_models():
    return await mapping_service.list_mappings()


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
    }


@router.put("/preferences")
async def update_preferences(
    preferred_channel_id: int | None = None,
    load_balance_enabled: bool | None = None,
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
    if update_data:
        await db.execute(update(User).where(User.user_id == auth.user_id).values(**update_data))
        await db.commit()
    return {"status": "ok"}
