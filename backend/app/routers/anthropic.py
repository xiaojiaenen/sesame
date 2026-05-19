"""Anthropic 兼容 API 路由 - 提供 /v1/messages 端点"""

import json
import logging
import time

logger = logging.getLogger("sesame.anthropic")

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import settings
from app.auth import AuthUser
from app.database import async_session
from app.services import channel_service, proxy_service, rate_limit_service, log_service
from app.services.cache_service import (
    acquire_concurrency, release_concurrency,
    acquire_dedup, wait_dedup_result, store_dedup_result,
    get_cached, set_cached, compute_fingerprint,
)
from app.services.websocket_service import broadcast_request_event
from app.services.anthropic_format import (
    convert_anthropic_request_to_openai,
    convert_openai_response_to_anthropic,
    convert_openai_chunk_to_anthropic,
    format_sse_event,
)

router = APIRouter()


@router.api_route("/v1/messages", methods=["POST"])
async def anthropic_messages(
    request: Request,
):
    """
    Anthropic 兼容的 Messages API

    请求格式 (Anthropic):
    {
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": 1024,
        "system": "You are helpful",
        "messages": [{"role": "user", "content": "Hello"}],
        "stream": false
    }

    响应格式 (Anthropic):
    {
        "id": "msg_xxx",
        "type": "message",
        "role": "assistant",
        "content": [{"type": "text", "text": "Hi!"}],
        "model": "claude-3-5-sonnet-20241022",
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 10, "output_tokens": 5}
    }
    """
    start = time.monotonic()
    proxy_service._last_backend_model.set("")

    # 认证：同时支持 Authorization: Bearer xxx 和 x-api-key: xxx
    from app.services.apikey_service import validate_key
    api_key = request.headers.get("x-api-key", "")
    if not api_key:
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            api_key = auth_header[7:]
    if not api_key:
        return JSONResponse(status_code=401, content={"type": "error", "error": {"type": "authentication_error", "message": "Missing API key"}})
    key_info = await validate_key(api_key)
    if not key_info:
        return JSONResponse(status_code=401, content={"type": "error", "error": {"type": "authentication_error", "message": "Invalid or expired API key"}})
    auth = AuthUser(
        user_id=key_info["user_id"],
        key_id=key_info["key_id"],
        max_qpm=key_info["max_qpm"],
    )

    # Rate limit
    if auth.key_id:
        allowed = await rate_limit_service.check_rate_limit(auth.key_id, auth.max_qpm)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "type": "error",
                    "error": {
                        "type": "rate_limit_error",
                        "message": f"请求频率超限（{auth.max_qpm}次/分钟）"
                    }
                },
            )

    # 解析请求
    raw_body = await request.body()
    try:
        anthropic_req = json.loads(raw_body)
    except json.JSONDecodeError:
        return JSONResponse(
            status_code=400,
            content={
                "type": "error",
                "error": {"type": "invalid_request_error", "message": "Invalid JSON"}
            },
        )

    # 提取模型
    external_model = anthropic_req.get("model", "")
    stream = anthropic_req.get("stream", False)

    # 检查是否有可用渠道
    channel, _ = channel_service.select_channel(external_model)
    cookie = ""

    if not channel:
        return JSONResponse(
            status_code=503,
            content={
                "type": "error",
                "error": {
                    "type": "api_error",
                    "message": "没有可用的 API 渠道，请先在管理后台创建渠道"
                }
            },
        )

    # 转换请求格式
    openai_req = convert_anthropic_request_to_openai(anthropic_req)
    openai_req["model"] = external_model
    openai_body = json.dumps(openai_req).encode()

    # 检查用户偏好
    from app.services.user_pref_cache import get_user_prefs
    pref_channel_id, load_balance = get_user_prefs(auth.user_id)
    preferred_channel_id = pref_channel_id if not load_balance else None

    # ── 三层防护：并发控制 → 去重 → 缓存 ──
    fingerprint = compute_fingerprint(openai_req, auth.user_id)

    # 1. 并发控制
    if auth.key_id:
        if not await acquire_concurrency(auth.key_id, settings.max_concurrent_per_key):
            return JSONResponse(
                status_code=429,
                content={
                    "type": "error",
                    "error": {"type": "rate_limit_error", "message": "并发请求过多，请稍后重试"}
                },
            )

    # 2. 请求去重 + 3. 精确缓存（仅非流式）
    if not stream:
        if not await acquire_dedup(fingerprint, settings.dedup_ttl_seconds):
            dedup_result = await wait_dedup_result(fingerprint, timeout=3.0)
            if dedup_result:
                logger.info(f"[ANTHROPIC] DEDUP_HIT model={external_model} user={auth.user_id}")
                anthropic_resp = convert_openai_response_to_anthropic(dedup_result, external_model)
                duration_ms = int((time.monotonic() - start) * 1000)
                tokens_prompt = dedup_result.get("usage", {}).get("prompt_tokens", 0)
                tokens_completion = dedup_result.get("usage", {}).get("completion_tokens", 0)
                await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 200, tokens_prompt, tokens_completion)
                await broadcast_request_event(
                    event_type="request_end", user_id=auth.user_id, model=external_model,
                    latency_ms=duration_ms, status_code=200, is_stream=False,
                )
                if auth.key_id:
                    await release_concurrency(auth.key_id)
                return JSONResponse(content=anthropic_resp, headers={"anthropic-version": "2023-06-01", "anthropic-beta": "extended-thinking-2025-01-24"})
            if auth.key_id:
                await release_concurrency(auth.key_id)
            return JSONResponse(
                status_code=429,
                content={
                    "type": "error",
                    "error": {"type": "rate_limit_error", "message": "重复请求，请稍后重试"}
                },
            )

        cached = await get_cached(fingerprint)
        if cached:
            logger.info(f"[ANTHROPIC] CACHE_HIT model={external_model} user={auth.user_id}")
            anthropic_resp = convert_openai_response_to_anthropic(cached, external_model)
            duration_ms = int((time.monotonic() - start) * 1000)
            tokens_prompt = cached.get("usage", {}).get("prompt_tokens", 0)
            tokens_completion = cached.get("usage", {}).get("completion_tokens", 0)
            await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 200, tokens_prompt, tokens_completion)
            await broadcast_request_event(
                event_type="request_end", user_id=auth.user_id, model=external_model,
                latency_ms=duration_ms, status_code=200, is_stream=False,
            )
            await store_dedup_result(fingerprint, cached)
            if auth.key_id:
                await release_concurrency(auth.key_id)
            return JSONResponse(content=anthropic_resp, headers={"anthropic-version": "2023-06-01", "anthropic-beta": "extended-thinking-2025-01-24"})

    # 广播请求开始事件
    await broadcast_request_event(
        event_type="request_start",
        user_id=auth.user_id,
        model=external_model,
        is_stream=stream,
    )

    # 代理请求
    try:
        if stream:
            # 流式响应 - 需要转换格式
            if preferred_channel_id:
                result = await proxy_service.proxy_request(
                    cookie=cookie,
                    raw_body=openai_body,
                    target_model=external_model,
                    stream=True,
                    user_id=auth.user_id,
                    channel_id=preferred_channel_id,
                )
            else:
                result = await proxy_service.proxy_request_with_retry(
                cookie=cookie,
                raw_body=openai_body,
                target_model=external_model,
                stream=True,
                user_id=auth.user_id,
            )

            # 后端返回了 JSON 而非 SSE（如模型不支持流式）
            if isinstance(result, dict):
                anthropic_resp = convert_openai_response_to_anthropic(result, external_model)
                usage = result.get("usage", {})
                tokens_prompt = usage.get("prompt_tokens", 0)
                tokens_completion = usage.get("completion_tokens", 0)
                duration_ms = int((time.monotonic() - start) * 1000)
                await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 200, tokens_prompt, tokens_completion)
                await broadcast_request_event(
                    event_type="request_end", user_id=auth.user_id, model=external_model,
                    latency_ms=duration_ms, status_code=200, is_stream=False,
                )

                # 写入缓存 + 更新去重（stream 请求但后端返回非流式 dict）
                await set_cached(fingerprint, result, settings.cache_ttl_seconds)
                await store_dedup_result(fingerprint, result)

                return JSONResponse(content=anthropic_resp, headers={"anthropic-version": "2023-06-01", "anthropic-beta": "extended-thinking-2025-01-24"})

            # 包装流式响应以转换格式
            _stream_start = time.monotonic()
            _tokens_prompt = 0
            _tokens_completion = 0
            _sent_message_start = False
            _sent_finish = False
            _stream_state: dict = {}

            async def anthropic_stream():
                nonlocal _tokens_prompt, _tokens_completion, _sent_message_start, _sent_finish

                try:
                    # 处理 OpenAI 流式响应
                    try:
                        async for line in result.body_iterator:
                            line_str = line.decode("utf-8") if isinstance(line, bytes) else line

                            # 解析 SSE 数据
                            if line_str.startswith("data: "):
                                data_str = line_str[6:].strip()
                                if data_str == "[DONE]":
                                    break

                                try:
                                    openai_chunk = json.loads(data_str)
                                    # 提取 token 用量（OpenAI 流式最后一帧可能带 usage）
                                    usage = openai_chunk.get("usage")
                                    if usage:
                                        _tokens_prompt = usage.get("prompt_tokens", 0) or _tokens_prompt
                                        _tokens_completion = usage.get("completion_tokens", 0) or _tokens_completion
                                    events = convert_openai_chunk_to_anthropic(openai_chunk, external_model, _stream_state)

                                    # 如果转换函数没有发出 message_start（首 chunk 无 role），补发
                                    if not _sent_message_start:
                                        if events and events[0]["event"] == "message_start":
                                            _sent_message_start = True
                                        else:
                                            sse_msg = format_sse_event("message_start", {
                                                "type": "message_start",
                                                "message": {
                                                    "id": f"msg_{int(time.time())}",
                                                    "type": "message",
                                                    "role": "assistant",
                                                    "content": [],
                                                    "model": external_model,
                                                    "stop_reason": None,
                                                    "stop_sequence": None,
                                                    "usage": {"input_tokens": 0, "output_tokens": 0},
                                                },
                                            })
                                            yield sse_msg
                                            _sent_message_start = True

                                    for event in events:
                                        if event["event"] == "message_stop":
                                            _sent_finish = True
                                        yield format_sse_event(event["event"], event["data"])
                                except json.JSONDecodeError:
                                    continue
                    except Exception as e:
                        logger.error(f"[ANTHROPIC] Stream error: {type(e).__name__}: {e}")

                    # 如果后端没给 finish_reason，补发结束事件
                    if not _sent_finish:
                        max_tool_idx = _stream_state.get("max_tool_index", 0)
                        # 停止 thinking block（如果还没停过）
                        if _stream_state.get("thinking_started") and not _stream_state.get("thinking_stopped"):
                            yield format_sse_event("content_block_stop", {
                                "type": "content_block_stop",
                                "index": 0,
                            })
                        # 停止 text block
                        if _stream_state.get("text_started"):
                            text_idx = 1 if _stream_state.get("thinking_started") else 0
                            yield format_sse_event("content_block_stop", {
                                "type": "content_block_stop",
                                "index": text_idx,
                            })
                        # 停止 tool blocks
                        _tool_start = (1 if _stream_state.get("thinking_started") else 0) + 1
                        for i in range(_tool_start, max_tool_idx + 1):
                            yield format_sse_event("content_block_stop", {
                                "type": "content_block_stop",
                                "index": i,
                            })
                        yield format_sse_event("message_delta", {
                            "type": "message_delta",
                            "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                            "usage": {"output_tokens": _tokens_completion},
                        })
                        yield format_sse_event("message_stop", {
                            "type": "message_stop",
                        })
                finally:
                    # 流结束后记录日志（即使客户端断开也记录）
                    duration_ms = int((time.monotonic() - _stream_start) * 1000)
                    await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 200, _tokens_prompt, _tokens_completion, is_stream=True)
                    await broadcast_request_event(
                        event_type="request_end", user_id=auth.user_id, model=external_model,
                        latency_ms=duration_ms, status_code=200, is_stream=True,
                    )

            return StreamingResponse(
                anthropic_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",
                    "anthropic-version": "2023-06-01",
                    "anthropic-beta": "extended-thinking-2025-01-24",
                },
            )
        else:
            # 非流式响应
            if preferred_channel_id:
                result = await proxy_service.proxy_request(
                    cookie=cookie,
                    raw_body=openai_body,
                    target_model=external_model,
                    stream=False,
                    user_id=auth.user_id,
                    channel_id=preferred_channel_id,
                )
            else:
                result = await proxy_service.proxy_request_with_retry(
                    cookie=cookie,
                    raw_body=openai_body,
                    target_model=external_model,
                    stream=False,
                    user_id=auth.user_id,
                )

            # 转换响应格式
            if isinstance(result, dict):
                anthropic_resp = convert_openai_response_to_anthropic(result, external_model)

                # 提取 token 用量
                usage = result.get("usage", {})
                tokens_prompt = usage.get("prompt_tokens", 0)
                tokens_completion = usage.get("completion_tokens", 0)

                # 记录日志
                duration_ms = int((time.monotonic() - start) * 1000)
                await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 200, tokens_prompt, tokens_completion)
                await broadcast_request_event(
                    event_type="request_end", user_id=auth.user_id, model=external_model,
                    latency_ms=duration_ms, status_code=200, is_stream=False,
                )

                # 写入缓存 + 更新去重结果
                await set_cached(fingerprint, result, settings.cache_ttl_seconds)
                await store_dedup_result(fingerprint, result)

                import asyncio
                if auth.key_id:
                    asyncio.create_task(_update_key_last_used(auth.key_id))

                return JSONResponse(content=anthropic_resp, headers={"anthropic-version": "2023-06-01", "anthropic-beta": "extended-thinking-2025-01-24"})
            else:
                return result

    except proxy_service.BackendAuthError:
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 401, error_message="后端认证失败")
        await broadcast_request_event(
            event_type="request_error", user_id=auth.user_id, model=external_model,
            status_code=401, error_message="认证失败",
        )
        return JSONResponse(
            status_code=401,
            content={
                "type": "error",
                "error": {
                    "type": "api_error",
                    "message": "后端认证失败，请检查渠道配置"
                }
            },
        )
    except proxy_service.BackendError as e:
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 502, error_message=str(e))
        await broadcast_request_event(
            event_type="request_error", user_id=auth.user_id, model=external_model,
            status_code=502, error_message=str(e),
        )
        return JSONResponse(
            status_code=502,
            content={
                "type": "error",
                "error": {
                    "type": "api_error",
                    "message": str(e)
                }
            },
        )
    except Exception as e:
        logger.exception(f"[ANTHROPIC] Unexpected error: {e}")
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_request(auth.user_id, auth.key_id, external_model, duration_ms, 500, error_message=str(e))
        await broadcast_request_event(
            event_type="request_error", user_id=auth.user_id, model=external_model,
            status_code=500, error_message=str(e),
        )
        return JSONResponse(
            status_code=500,
            content={
                "type": "error",
                "error": {"type": "api_error", "message": "内部服务器错误"}
            },
        )
    finally:
        if auth.key_id:
            await release_concurrency(auth.key_id)


async def _log_request(user_id: str, key_id: int | None, model: str, duration_ms: int, status_code: int, tokens_prompt: int = 0, tokens_completion: int = 0, is_stream: bool = False, error_message: str | None = None):
    """记录请求日志"""
    try:
        internal_model = proxy_service._last_backend_model.get() or model
        async with async_session() as db:
            await log_service.log_request(
                db=db,
                user_id=user_id,
                key_id=key_id,
                model=model,
                internal_model=internal_model,
                tokens_prompt=tokens_prompt,
                tokens_completion=tokens_completion,
                latency_ms=duration_ms,
                status_code=status_code,
                is_stream=is_stream,
                api_format="anthropic",
                error_message=error_message,
            )
    except Exception as e:
        logging.getLogger("sesame").error(f"[ANTHROPIC] Failed to log request: {e}")


async def _update_key_last_used(key_id: int):
    try:
        async with async_session() as db:
            from app.services import apikey_service
            await apikey_service.update_last_used(db, key_id)
    except Exception:
        pass
