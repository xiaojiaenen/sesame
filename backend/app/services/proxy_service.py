import asyncio
import contextvars
import json
import re
import time
import uuid
from typing import Any

import httpx
from fastapi.responses import StreamingResponse

from app.config import settings
from app.services import channel_service
from app.utils import now_beijing

_client: httpx.AsyncClient | None = None
_last_backend_model: contextvars.ContextVar[str] = contextvars.ContextVar("_last_backend_model", default="")


async def _get_user_channel_cookie(user_id: str, channel_id: int) -> str | None:
    """获取用户为指定 cookie 渠道提交的 cookie"""
    from sqlalchemy import select, and_
    from app.database import async_session
    from app.models.db_models import UserChannelCookie
    from app.services.session_service import decrypt
    from datetime import datetime

    async with async_session() as db:
        result = await db.execute(
            select(UserChannelCookie).where(
                and_(
                    UserChannelCookie.user_id == user_id,
                    UserChannelCookie.channel_id == channel_id,
                    UserChannelCookie.status == "active",
                )
            )
        )
        row = result.scalar_one_or_none()
        if not row:
            return None
        # 检查过期
        if row.expire_at and row.expire_at < now_beijing():
            return None
        return decrypt(row.cookie_encrypted)

# Regex to detect OpenAI SSE format: data: {"id":"...","choices":[...]}
_OPENAI_SSE_RE = re.compile(r'"choices"\s*:\s*\[')


def _extract_sse_payload(line: str) -> str | None:
    """Extract JSON payload from SSE data line. Handles both 'data: {...}' and 'data:{...}'."""
    if line.startswith("data: "):
        return line[6:].strip()
    if line.startswith("data:"):
        return line[5:].strip()
    return None


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=5.0))
    return _client


async def close_client():
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


async def proxy_request(
    cookie: str,
    raw_body: bytes,
    target_model: str,
    stream: bool,
    backend_path: str = "/v1/chat/completions",
    channel_id: int | None = None,
    user_id: str | None = None,
) -> dict | StreamingResponse:
    """代理请求 - 支持多渠道"""
    client = await get_client()

    # 选择渠道（返回渠道和映射后的后端模型名）
    channel = None
    backend_model = target_model
    if channel_id:
        channel = channel_service.get_channel(channel_id)
        # 指定渠道时也需要做模型映射
        if channel:
            models = channel.get("models") or {}
            if not models:
                backend_model = target_model
            elif target_model in models:
                backend_model = models[target_model]
            elif len(models) == 1:
                backend_model = list(models.values())[0]
    else:
        channel, backend_model = channel_service.select_channel(target_model)
        if backend_model is None:
            backend_model = target_model

    if channel:
        target_model = backend_model
        _last_backend_model.set(backend_model)
        url = f"{channel['base_url']}{backend_path}"
        if channel.get("auth_type") == "cookie":
            # cookie 类型渠道：使用用户个人的 cookie
            if not user_id:
                raise BackendError("Cookie 类型渠道需要用户身份")
            user_cookie = await _get_user_channel_cookie(user_id, channel["id"])
            if not user_cookie:
                raise BackendError(f"渠道 {channel['name']} 需要配置 Cookie")
            headers = {
                "Cookie": user_cookie,
                "Content-Type": "application/json",
            }
        else:
            # api_key 类型渠道
            headers = {
                "Authorization": f"Bearer {channel['api_key']}",
                "Content-Type": "application/json",
            }
    else:
        # 使用默认配置（向后兼容）
        _last_backend_model.set(backend_model)
        url = f"{settings.enterprise_ai_url}{backend_path}"
        headers = {
            "Cookie": cookie,
            "Content-Type": "application/json",
        }

    # Replace model in raw body, preserve all other fields as-is
    body_with_model = _replace_model(raw_body, target_model)

    if stream:
        return await _proxy_stream(client, url, headers, body_with_model, target_model)
    else:
        return await _proxy_sync(client, url, headers, body_with_model, target_model)


async def proxy_request_with_retry(
    cookie: str,
    raw_body: bytes,
    target_model: str,
    stream: bool,
    backend_path: str = "/v1/chat/completions",
    max_retries: int = 1,
    fallback_models: list[str] = None,
    user_id: str | None = None,
) -> dict | StreamingResponse:
    """带重试的代理请求 - 失败时尝试其他渠道和 fallback 模型"""
    channels = channel_service.get_channels()

    # 构建模型尝试列表：主模型 + fallback 模型
    models_to_try = [target_model]
    if fallback_models:
        models_to_try.extend(fallback_models)

    last_error = None

    for model in models_to_try:
        if not channels:
            # 没有渠道，使用默认方式
            try:
                return await proxy_request(cookie, raw_body, model, stream, backend_path, user_id=user_id)
            except BackendAuthError:
                raise
            except Exception as e:
                last_error = e
                continue

        tried_channels = set()

        for attempt in range(max_retries + 1):
            # 选择一个未尝试过的渠道
            channel = None
            for ch in channels:
                if ch['id'] not in tried_channels and ch['status'] == 'active':
                    channel = ch
                    break

            if not channel:
                break

            tried_channels.add(channel['id'])

            try:
                return await proxy_request(
                    cookie, raw_body, model, stream, backend_path,
                    channel_id=channel['id'], user_id=user_id
                )
            except BackendAuthError:
                raise
            except BackendError as e:
                last_error = e
                if attempt < max_retries:
                    await asyncio.sleep(0.3)
                    continue
            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    await asyncio.sleep(0.3)
                    continue

    raise BackendError(f"所有模型和渠道都失败: {last_error}")


async def validate_cookie(cookie: str) -> tuple[bool, str]:
    """Validate cookie by making a lightweight request to the backend.
    Returns (is_valid, message).
    If backend is unreachable, returns True (allow submit, validate later).
    """
    client = await get_client()
    url = settings.validate_cookie_url or settings.enterprise_ai_url
    try:
        resp = await client.get(
            url,
            headers={"Cookie": cookie},
            timeout=10.0,
            follow_redirects=True,
        )
        if resp.status_code == 200:
            return True, "Cookie 有效"
        if resp.status_code in (401, 403):
            return False, "Cookie 无效或已过期"
        # Other status codes: allow submit
        return True, f"后端返回 {resp.status_code}，已提交但可能不可用"
    except Exception:
        # Backend unreachable: allow submit, validate when actually used
        return True, "无法连接后端，已提交（使用时将验证）"



def _check_backend_error(data: dict) -> None:
    """Check for backend-specific error codes in response body.
    Raises BackendAuthError for auth failures (code 4002).
    """
    code = data.get("code")
    if code == 4002:
        raise BackendAuthError(401)


def _replace_model(raw_body: bytes, target_model: str) -> bytes:
    try:
        body = json.loads(raw_body)
        body["model"] = target_model
        return json.dumps(body, ensure_ascii=False).encode()
    except Exception:
        return raw_body


async def _proxy_sync(
    client: httpx.AsyncClient,
    url: str,
    headers: dict,
    body: bytes,
    model: str,
) -> dict:
    max_retries = 1
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            resp = await client.post(url, headers=headers, content=body)

            if resp.status_code in (401, 403):
                raise BackendAuthError(resp.status_code)

            if resp.status_code == 429:
                retry_after = min(int(resp.headers.get("Retry-After", "1")), 1)
                if attempt < max_retries:
                    await asyncio.sleep(retry_after)
                    continue

            if resp.status_code >= 500:
                if attempt < max_retries:
                    await asyncio.sleep(0.5)
                    continue

            resp.raise_for_status()
            data = resp.json()
            _check_backend_error(data)
            if _is_openai_format(data):
                return data
            if _is_image_response(data):
                return _convert_image_response(data)
            return _to_openai_format(data, model)

        except BackendAuthError:
            raise
        except httpx.HTTPStatusError as e:
            raise BackendError(f"Backend returned {e.response.status_code}: {e.response.text[:200]}")
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            last_error = e
            if attempt < max_retries:
                await asyncio.sleep(0.5)
                continue

    raise BackendError(f"Backend unreachable after {max_retries} retries: {last_error}")


async def _proxy_stream(
    client: httpx.AsyncClient,
    url: str,
    headers: dict,
    body: bytes,
    model: str,
) -> StreamingResponse:
    req = client.build_request("POST", url, headers=headers, content=body)
    resp = await client.send(req, stream=True)

    if resp.status_code in (401, 403):
        await resp.aclose()
        raise BackendAuthError(resp.status_code)

    if resp.status_code >= 400:
        error_body = ""
        try:
            error_body = (await resp.aread()).decode("utf-8", errors="replace")[:200]
        except Exception:
            pass
        await resp.aclose()
        raise BackendError(f"Backend returned {resp.status_code}: {error_body}")

    # Check if backend returned a non-streaming error (e.g. auth failure as HTTP 200 JSON)
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type and "text/event-stream" not in content_type:
        body = await resp.aread()
        await resp.aclose()
        try:
            data = json.loads(body)
            _check_backend_error(data)
            # If not an error, return as-is
            if _is_openai_format(data):
                return data
            return _to_openai_format(data, model)
        except BackendAuthError:
            raise
        except json.JSONDecodeError:
            raise BackendError("Backend returned non-streaming JSON that could not be parsed")

    # Detect format from first data line
    format_detected = False
    is_openai = True  # Assume OpenAI until proven otherwise

    async def event_generator():
        nonlocal format_detected, is_openai
        chunk_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
        created = int(time.time())
        try:
            async for line in resp.aiter_lines():
                if not line.strip():
                    yield "\n"
                    continue

                payload = _extract_sse_payload(line)
                if payload is not None and payload == "[DONE]":
                    yield "data: [DONE]\n\n"
                    break

                # Detect format on first data line
                if not format_detected and payload is not None:
                    format_detected = True
                    is_openai = _OPENAI_SSE_RE.search(line) is not None

                if is_openai:
                    # Normalize: ensure "data: " prefix with space
                    if payload is not None:
                        yield f"data: {payload}\n\n"
                    else:
                        yield line + "\n\n"
                else:
                    converted = _convert_sse_line(line, chunk_id, model, created)
                    if converted:
                        yield converted + "\n\n"
        finally:
            await resp.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _is_openai_format(data: dict) -> bool:
    return "id" in data and "choices" in data and "object" in data


def _is_image_response(data: dict) -> bool:
    """Detect image generation response format: {code, data: {imageList: [...]}}."""
    return (
        "code" in data
        and isinstance(data.get("data"), dict)
        and "imageList" in data.get("data", {})
    )


def _convert_image_response(data: dict) -> dict:
    """Convert backend image response to OpenAI Images API format."""
    images = data.get("data", {}).get("imageList", [])
    return {
        "created": int(time.time()),
        "data": [
            {
                "url": img.get("fileUrl", ""),
                "b64_json": None,
                "revised_prompt": None,
            }
            for img in images
        ],
    }


def _to_openai_format(data: dict, model: str) -> dict:
    """Convert non-OpenAI response to OpenAI Chat Completion format."""
    # Try common field patterns
    content = (
        data.get("content")
        or data.get("text")
        or data.get("response")
        or data.get("message", {}).get("content")
        or data.get("result")
        or data.get("output")
        or ""
    )

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": data.get("usage", {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}),
    }


def _convert_sse_line(line: str, chunk_id: str, model: str, created: int) -> str | None:
    """Convert a non-OpenAI SSE data line to OpenAI streaming chunk format."""
    payload = _extract_sse_payload(line)
    if payload is None:
        return line  # Pass through non-data lines as-is

    if not payload or payload == "[DONE]":
        return "data: [DONE]"

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return line  # Can't parse, pass through

    # Already OpenAI format
    if _is_openai_format(data):
        return line

    # Extract content from various possible formats
    content = (
        data.get("content")
        or data.get("text")
        or data.get("delta", {}).get("content")
        or data.get("token", {}).get("text")
        or data.get("message", {}).get("content")
        or data.get("response")
        or data.get("output")
        or ""
    )

    # Check for finish signal
    finish_reason = None
    if data.get("finish_reason") or data.get("done") or data.get("stop"):
        finish_reason = "stop"
    elif data.get("status") == "complete":
        finish_reason = "stop"

    chunk = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {"content": content} if content else {},
                "finish_reason": finish_reason,
            }
        ],
    }

    return f"data: {json.dumps(chunk, ensure_ascii=False)}"


class BackendAuthError(Exception):
    def __init__(self, status_code: int):
        self.status_code = status_code


class BackendError(Exception):
    pass
