import json
import logging
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("sesame.chat")

from app.config import settings
from app.auth import AuthUser, get_api_key_user
from app.database import async_session
from app.services import apikey_service, channel_service, proxy_service, rate_limit_service, log_service
from app.services.cache_service import (
    acquire_concurrency, release_concurrency,
    acquire_dedup, wait_dedup_result, store_dedup_result,
    get_cached, set_cached, compute_fingerprint,
)
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

    return await _proxy_request(request, auth)


async def _proxy_request(request: Request, auth: AuthUser):
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

    # 检查用户偏好：是否使用指定渠道（从内存缓存读取，无 DB 查询）
    from app.services.user_pref_cache import get_user_prefs
    pref_channel_id, load_balance = get_user_prefs(auth.user_id)
    preferred_channel_id = pref_channel_id if not load_balance else None

    # 检查是否有可用渠道
    channel, backend_model = channel_service.select_channel(external_model)
    logger.info(f"[CHAT] model={external_model} user={auth.user_id} key_id={auth.key_id} selected_channel={channel['id'] if channel else None} backend_model={backend_model}")
    cookie = ""

    if not channel:
        return JSONResponse(
            status_code=503,
            content={"error": {"message": "没有可用的 API 渠道，请先在管理后台创建渠道", "type": "sesame_error"}},
        )

    # ── 三层防护：并发控制 → 去重 → 缓存 ──
    fingerprint = compute_fingerprint(body, auth.user_id)

    # 1. 并发控制
    if auth.key_id:
        if not await acquire_concurrency(auth.key_id, settings.max_concurrent_per_key):
            return JSONResponse(
                status_code=429,
                content={"error": {"message": "并发请求过多，请稍后重试", "type": "concurrency_error"}},
            )

    # 2. 请求去重 + 3. 精确缓存（仅非流式）
    if not stream:
        if not await acquire_dedup(fingerprint, settings.dedup_ttl_seconds):
            dedup_result = await wait_dedup_result(fingerprint, timeout=3.0)
            if dedup_result:
                logger.info(f"[CHAT] DEDUP_HIT model={external_model} user={auth.user_id}")
                duration_ms = int((time.monotonic() - start) * 1000)
                tokens_prompt = dedup_result.get("usage", {}).get("prompt_tokens", 0)
                tokens_completion = dedup_result.get("usage", {}).get("completion_tokens", 0)
                await _log_request(auth.user_id, auth.key_id, external_model, False, 200, duration_ms, tokens_prompt, tokens_completion)
                await broadcast_request_event(
                    event_type="request_end", user_id=auth.user_id, model=external_model,
                    latency_ms=duration_ms, status_code=200, is_stream=False,
                )
                if auth.key_id:
                    await release_concurrency(auth.key_id)
                return JSONResponse(content=dedup_result)
            if auth.key_id:
                await release_concurrency(auth.key_id)
            return JSONResponse(
                status_code=429,
                content={"error": {"message": "重复请求，请稍后重试", "type": "dedup_error"}},
            )

        cached = await get_cached(fingerprint)
        if cached:
            logger.info(f"[CHAT] CACHE_HIT model={external_model} user={auth.user_id}")
            duration_ms = int((time.monotonic() - start) * 1000)
            tokens_prompt = cached.get("usage", {}).get("prompt_tokens", 0)
            tokens_completion = cached.get("usage", {}).get("completion_tokens", 0)
            await _log_request(auth.user_id, auth.key_id, external_model, False, 200, duration_ms, tokens_prompt, tokens_completion)
            await broadcast_request_event(
                event_type="request_end", user_id=auth.user_id, model=external_model,
                latency_ms=duration_ms, status_code=200, is_stream=False,
            )
            await store_dedup_result(fingerprint, cached)
            if auth.key_id:
                await release_concurrency(auth.key_id)
            return JSONResponse(content=cached)

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
                user_id=auth.user_id,
                channel_id=preferred_channel_id,
            )
        else:
            result = await proxy_service.proxy_request_with_retry(
                cookie=cookie,
                raw_body=raw_body,
                target_model=external_model,
                stream=stream,
                user_id=auth.user_id,
            )
    except proxy_service.BackendAuthError:
        logger.warning(f"[CHAT] BackendAuthError from {url if 'url' in dir() else 'unknown'}")
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_request(auth.user_id, auth.key_id, external_model, stream, 401, duration_ms, error_message="后端认证失败")
        await broadcast_request_event(
            event_type="request_error",
            user_id=auth.user_id,
            model=external_model,
            status_code=401,
            error_message="认证失败",
        )
        return JSONResponse(
            status_code=401,
            content={"error": {"message": "后端认证失败，请检查渠道配置", "type": "sesame_error"}},
        )
    except proxy_service.BackendError as e:
        logger.error(f"[CHAT] BackendError: {e}")
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_request(auth.user_id, auth.key_id, external_model, stream, 502, duration_ms, error_message=str(e))
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
    except Exception as e:
        logger.exception(f"[CHAT] Unexpected error: {e}")
        duration_ms = int((time.monotonic() - start) * 1000)
        await _log_request(auth.user_id, auth.key_id, external_model, stream, 500, duration_ms, error_message=str(e))
        await broadcast_request_event(
            event_type="request_error",
            user_id=auth.user_id,
            model=external_model,
            status_code=500,
            error_message=str(e),
        )
        return JSONResponse(
            status_code=500,
            content={"error": {"message": "内部服务器错误", "type": "sesame_error"}},
        )
    finally:
        if auth.key_id:
            await release_concurrency(auth.key_id)

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

        # 写入缓存 + 更新去重结果
        await set_cached(fingerprint, result, settings.cache_ttl_seconds)
        await store_dedup_result(fingerprint, result)
    else:
        # 替换 body_iterator 而非创建新 StreamingResponse，避免并发下 generator 被重复消费
        _stream_start = start
        _orig_iter = result.body_iterator

        async def wrapped_stream():
            tp = 0
            tc = 0
            try:
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
            finally:
                duration_ms = int((time.monotonic() - _stream_start) * 1000)
                await _log_request(auth.user_id, auth.key_id, external_model, True, 200, duration_ms, tp, tc)

        result.body_iterator = wrapped_stream()

    import asyncio
    if auth.key_id:
        asyncio.create_task(_update_key_last_used(auth.key_id))

    return result


async def _update_key_last_used(key_id: int):
    try:
        async with async_session() as db:
            await apikey_service.update_last_used(db, key_id)
    except Exception:
        pass


async def _log_request(user_id, key_id, external_model, stream, status_code, duration_ms, tokens_prompt=0, tokens_completion=0, error_message=None):
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
                api_format="openai",
                error_message=error_message,
            )
    except Exception as e:
        import logging
        logging.getLogger("sesame").error(f"Failed to log request: {e}")
