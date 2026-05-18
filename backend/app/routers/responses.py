"""OpenAI Responses API 兼容路由 - 提供 /v1/responses 端点"""

import json
import logging
import time

logger = logging.getLogger("sesame.responses")

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.auth import AuthUser
from app.database import async_session
from app.services import channel_service, proxy_service, rate_limit_service, log_service
from app.services.websocket_service import broadcast_request_event
from app.services.responses_format import (
    convert_responses_request_to_openai,
    convert_openai_response_to_responses,
    convert_openai_chunk_to_responses_events,
    build_response_completed,
)

router = APIRouter()


@router.api_route("/v1/responses", methods=["POST"])
async def responses_endpoint(request: Request):
    """OpenAI Responses API 兼容端点"""
    start = time.monotonic()
    proxy_service._last_backend_model.set("")

    # 认证
    from app.services.apikey_service import validate_key
    api_key = request.headers.get("authorization", "")
    if api_key.lower().startswith("bearer "):
        api_key = api_key[7:]
    if not api_key:
        return JSONResponse(status_code=401, content={
            "error": {"type": "authentication_error", "message": "Missing API key"}
        })
    key_info = await validate_key(api_key)
    if not key_info:
        return JSONResponse(status_code=401, content={
            "error": {"type": "authentication_error", "message": "Invalid or expired API key"}
        })
    auth = AuthUser(
        user_id=key_info["user_id"],
        key_id=key_info["key_id"],
        max_qpm=key_info["max_qpm"],
    )

    # Rate limit
    if auth.key_id:
        allowed = await rate_limit_service.check_rate_limit(auth.key_id, auth.max_qpm)
        if not allowed:
            return JSONResponse(status_code=429, content={
                "error": {"type": "rate_limit_error", "message": f"请求频率超限（{auth.max_qpm}次/分钟）"}
            })

    # 解析请求
    raw_body = await request.body()
    try:
        responses_req = json.loads(raw_body)
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={
            "error": {"type": "invalid_request_error", "message": "Invalid JSON"}
        })

    external_model = responses_req.get("model", "")
    stream = responses_req.get("stream", False)

    # 选择渠道
    channel, _ = channel_service.select_channel(external_model)
    if not channel:
        return JSONResponse(status_code=503, content={
            "error": {"type": "api_error", "message": "没有可用的 API 渠道，请先在管理后台创建渠道"}
        })

    # 转换为 Chat Completions 格式
    openai_req = convert_responses_request_to_openai(responses_req)
    openai_body = json.dumps(openai_req, ensure_ascii=False).encode()

    # 广播请求开始事件
    await broadcast_request_event(
        event_type="request_start",
        user_id=auth.user_id,
        model=external_model,
        is_stream=stream,
    )

    # 检查用户偏好
    from app.services.user_pref_cache import get_user_prefs
    pref_channel_id, load_balance = get_user_prefs(auth.user_id)
    preferred_channel_id = pref_channel_id if not load_balance else None

    try:
        if stream:
            if preferred_channel_id:
                result = await proxy_service.proxy_request(
                    cookie="",
                    raw_body=openai_body,
                    target_model=external_model,
                    stream=True,
                    user_id=auth.user_id,
                    channel_id=preferred_channel_id,
                )
            else:
                result = await proxy_service.proxy_request_with_retry(
                    cookie="",
                    raw_body=openai_body,
                    target_model=external_model,
                    stream=True,
                    user_id=auth.user_id,
                )

            # 后端返回 JSON 而非 SSE
            if isinstance(result, dict):
                resp = convert_openai_response_to_responses(result, external_model)
                usage = result.get("usage", {})
                duration_ms = int((time.monotonic() - start) * 1000)
                await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 200,
                                   usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))
                await broadcast_request_event(
                    event_type="request_end", user_id=auth.user_id, model=external_model,
                    latency_ms=duration_ms, status_code=200, is_stream=False,
                )
                return JSONResponse(content=resp)

            # 流式响应
            _stream_start = time.monotonic()
            _state: dict = {}
            _tokens_prompt = 0
            _tokens_completion = 0

            async def responses_stream():
                nonlocal _tokens_prompt, _tokens_completion

                try:
                    try:
                        async for line in result.body_iterator:
                            line_str = line.decode("utf-8") if isinstance(line, bytes) else line

                            if not line_str.startswith("data: "):
                                continue
                            data_str = line_str[6:].strip()
                            if data_str == "[DONE]":
                                break

                            try:
                                openai_chunk = json.loads(data_str)
                            except json.JSONDecodeError:
                                continue

                            # 提取 usage
                            usage = openai_chunk.get("usage")
                            if usage:
                                _tokens_prompt = usage.get("prompt_tokens", 0) or _tokens_prompt
                                _tokens_completion = usage.get("completion_tokens", 0) or _tokens_completion

                            # 转换为 Responses API 事件
                            events = convert_openai_chunk_to_responses_events(openai_chunk, external_model, _state)
                            for event in events:
                                yield f"event: {event['type']}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"

                        # 发送 response.completed
                        if _state.get("started"):
                            completed_event = build_response_completed(_state, external_model)
                            yield f"event: response.completed\ndata: {json.dumps(completed_event, ensure_ascii=False)}\n\n"

                    except Exception as e:
                        logger.error(f"[RESPONSES] Stream error: {type(e).__name__}: {e}")
                finally:
                    duration_ms = int((time.monotonic() - _stream_start) * 1000)
                    await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 200,
                                       _tokens_prompt, _tokens_completion, is_stream=True)
                    await broadcast_request_event(
                        event_type="request_end", user_id=auth.user_id, model=external_model,
                        latency_ms=duration_ms, status_code=200, is_stream=True,
                    )

            return StreamingResponse(
                responses_stream(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )

        else:
            # 非流式
            if preferred_channel_id:
                result = await proxy_service.proxy_request(
                    cookie="",
                    raw_body=openai_body,
                    target_model=external_model,
                    stream=False,
                    user_id=auth.user_id,
                    channel_id=preferred_channel_id,
                )
            else:
                result = await proxy_service.proxy_request_with_retry(
                    cookie="",
                    raw_body=openai_body,
                    target_model=external_model,
                    stream=False,
                    user_id=auth.user_id,
                )

            if isinstance(result, dict):
                resp = convert_openai_response_to_responses(result, external_model)
                usage = result.get("usage", {})
                duration_ms = int((time.monotonic() - start) * 1000)
                await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 200,
                                   usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))
                await broadcast_request_event(
                    event_type="request_end", user_id=auth.user_id, model=external_model,
                    latency_ms=duration_ms, status_code=200, is_stream=False,
                )
                import asyncio
                if auth.key_id:
                    asyncio.create_task(_update_key_last_used(auth.key_id))
                return JSONResponse(content=resp)
            else:
                return result

    except proxy_service.BackendAuthError:
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 401, error_message="后端认证失败")
        await broadcast_request_event(
            event_type="request_error", user_id=auth.user_id, model=external_model,
            status_code=401, error_message="认证失败",
        )
        return JSONResponse(status_code=401, content={
            "error": {"type": "api_error", "message": "后端认证失败，请检查渠道配置"}
        })
    except proxy_service.BackendError as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 502, error_message=str(e))
        await broadcast_request_event(
            event_type="request_error", user_id=auth.user_id, model=external_model,
            status_code=502, error_message=str(e),
        )
        return JSONResponse(status_code=502, content={
            "error": {"type": "api_error", "message": str(e)}
        })


async def _log_request(user_id, key_id, model, duration_ms, status_code,
                        tokens_prompt=0, tokens_completion=0, is_stream=False, error_message=None):
    try:
        internal_model = proxy_service._last_backend_model.get() or model
        async with async_session() as db:
            await log_service.log_request(
                db=db, user_id=user_id, key_id=key_id, model=model,
                internal_model=internal_model, tokens_prompt=tokens_prompt,
                tokens_completion=tokens_completion, latency_ms=duration_ms,
                status_code=status_code, is_stream=is_stream, api_format="responses",
                error_message=error_message,
            )
    except Exception:
        pass


async def _update_key_last_used(key_id: int):
    try:
        async with async_session() as db:
            from app.services import apikey_service
            await apikey_service.update_last_used(db, key_id)
    except Exception:
        pass
