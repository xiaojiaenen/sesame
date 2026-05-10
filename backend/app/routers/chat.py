import json
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.auth import AuthUser, get_api_key_user
from app.database import async_session
from app.models.db_models import SessionLog
from app.services import apikey_service, channel_service, proxy_service, rate_limit_service, session_service
from app.services import log_service
from app.services.websocket_service import broadcast_request_event

router = APIRouter()

# 不走渠道的路径（直接返回 404）
SUPPORTED_PATHS = {"/v1/chat/completions", "/v1/images/generations"}


@router.api_route("/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_endpoint(
    request: Request,
    path: str,
    auth: AuthUser = Depends(get_api_key_user),
):
    full_path = f"/v1/{path}"

    if full_path not in SUPPORTED_PATHS:
        # 允许 /v1/models 之类的探测请求通过，但不路由
        return JSONResponse(
            status_code=404,
            content={"error": {"message": f"未支持的接口: {full_path}", "type": "sesame_error"}},
        )

    return await _proxy_request(request, auth, full_path)


async def _proxy_request(request: Request, auth: AuthUser, backend_path: str):
    start = time.monotonic()
    proxy_service._last_backend_model.set("")

    # Rate limit
    if auth.key_id:
        allowed = await rate_limit_service.check_rate_limit(auth.key_id, auth.max_qpm)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"error": {"message": f"请求频率超限（{auth.max_qpm}次/分钟）", "type": "rate_limit_error"}},
            )

    raw_body = await request.body()
    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"error": {"message": "Invalid JSON", "type": "sesame_error"}})

    external_model = body.get("model", "")
    stream = body.get("stream", False)

    # Model permission
    if auth.allowed_models and external_model not in auth.allowed_models:
        return JSONResponse(
            status_code=403,
            content={"error": {"message": f"API Key 无权使用模型: {external_model}", "type": "sesame_error"}},
        )

    # 检查用户偏好：是否使用指定渠道
    preferred_channel_id = None
    async with async_session() as db:
        from app.models.db_models import User
        from sqlalchemy import select
        result = await db.execute(select(User).where(User.user_id == auth.user_id))
        user_row = result.scalar_one_or_none()
        if user_row and not user_row.load_balance_enabled and user_row.preferred_channel_id:
            preferred_channel_id = user_row.preferred_channel_id

    # 检查是否有可用渠道
    channel, _ = channel_service.select_channel(external_model)
    cookie = ""

    if channel and channel.get("auth_type") != "cookie":
        pass
    else:
        session = await session_service.get_session(auth.user_id)
        if not session:
            return JSONResponse(
                status_code=503,
                content={"error": {"message": "需要配置 Cookie 或有可用的 API 渠道", "type": "sesame_error"}},
            )
        cookie = await session_service.get_decrypted_cookie(auth.user_id) or ""

    # 广播请求开始事件
    await broadcast_request_event(
        event_type="request_start",
        user_id=auth.user_id,
        model=external_model,
        is_stream=stream,
    )

    # Proxy with retry support
    try:
        if preferred_channel_id:
            result = await proxy_service.proxy_request(
                cookie=cookie,
                raw_body=raw_body,
                target_model=external_model,
                stream=stream,
                backend_path=backend_path,
                user_id=auth.user_id,
                channel_id=preferred_channel_id,
            )
        else:
            result = await proxy_service.proxy_request_with_retry(
                cookie=cookie,
                raw_body=raw_body,
                target_model=external_model,
                stream=stream,
                backend_path=backend_path,
                user_id=auth.user_id,
            )
    except proxy_service.BackendAuthError:
        await broadcast_request_event(
            event_type="request_error",
            user_id=auth.user_id,
            model=external_model,
            status_code=401,
            error_message="会话已过期",
        )
        async with async_session() as db:
            await session_service.delete_session(db, auth.user_id)
        return JSONResponse(
            status_code=503,
            content={"error": {"message": "会话已过期，请重新提交 Cookie", "type": "sesame_error"}},
        )
    except proxy_service.BackendError as e:
        await broadcast_request_event(
            event_type="request_error",
            user_id=auth.user_id,
            model=external_model,
            status_code=502,
            error_message=str(e),
        )
        return JSONResponse(
            status_code=502,
            content={"error": {"message": str(e), "type": "sesame_error"}},
        )

    # 提取 token 用量并记录日志
    if isinstance(result, dict):
        usage = result.get("usage", {})
        tokens_prompt = usage.get("prompt_tokens", 0)
        tokens_completion = usage.get("completion_tokens", 0)
        duration_ms = int((time.monotonic() - start) * 1000)
        await broadcast_request_event(
            event_type="request_end", user_id=auth.user_id, model=external_model,
            latency_ms=duration_ms, status_code=200, is_stream=False,
        )
        await _log_request(auth.user_id, auth.key_id, external_model, False, 200, duration_ms, tokens_prompt, tokens_completion)
    else:
        # 替换 body_iterator 而非创建新 StreamingResponse，避免并发下 generator 被重复消费
        _stream_start = start
        _orig_iter = result.body_iterator

        async def wrapped_stream():
            tp = 0
            tc = 0
            async for chunk in _orig_iter:
                yield chunk
                line = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
                if line.startswith("data: ") and line.strip() != "data: [DONE]":
                    try:
                        import json as _json
                        data = _json.loads(line[6:])
                        u = data.get("usage")
                        if u:
                            tp = u.get("prompt_tokens", 0) or tp
                            tc = u.get("completion_tokens", 0) or tc
                    except Exception:
                        pass
            duration_ms = int((time.monotonic() - _stream_start) * 1000)
            await _log_request(auth.user_id, auth.key_id, external_model, True, 200, duration_ms, tp, tc)

        result.body_iterator = wrapped_stream()

    import asyncio
    asyncio.create_task(session_service.update_last_used(auth.user_id))
    if auth.key_id:
        asyncio.create_task(_update_key_last_used(auth.key_id))

    return result


async def _update_key_last_used(key_id: int):
    try:
        async with async_session() as db:
            await apikey_service.update_last_used(db, key_id)
    except Exception:
        pass


async def _log_request(user_id, key_id, external_model, stream, status_code, duration_ms, tokens_prompt=0, tokens_completion=0):
    try:
        from app.services.proxy_service import _last_backend_model
        internal_model = _last_backend_model.get() or external_model
        async with async_session() as db:
            await log_service.log_request(
                db=db,
                user_id=user_id,
                key_id=key_id,
                model=external_model,
                internal_model=internal_model,
                tokens_prompt=tokens_prompt,
                tokens_completion=tokens_completion,
                latency_ms=duration_ms,
                status_code=status_code,
                is_stream=stream,
            )
            db.add(SessionLog(
                user_id=user_id,
                external_model=external_model,
                model=internal_model,
                stream=stream,
                status_code=status_code,
                duration_ms=duration_ms,
            ))
            await db.commit()
    except Exception as e:
        import logging
        logging.getLogger("sesame").error(f"Failed to log request: {e}")
