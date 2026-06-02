import asyncio
import contextvars
import json
import logging
import re
import time
import uuid
from typing import Any

import httpx
from fastapi.responses import StreamingResponse

logger = logging.getLogger("sesame.proxy")

from app.config import settings
from app.services import channel_service
from app.utils import now_beijing

_client: httpx.AsyncClient | None = None
_client_lock: asyncio.Lock = asyncio.Lock()
_last_backend_model: contextvars.ContextVar[str] = contextvars.ContextVar("_last_backend_model", default="")
# Public ContextVar for per-request correlation ID. Set by routers.
current_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("current_request_id", default="")


async def _try_refresh_cookie(row) -> str | None:
    """尝试自动续期 cookie（用保存的凭证重新登录）。返回新 cookie 或 None。"""
    if not (row.auto_refresh and row.login_url and row.username and row.password_encrypted):
        return None
    try:
        from app.crypto import decrypt, encrypt
        from app.database import async_session
        from app.services.auto_login_service import login_with_credentials
        from datetime import timedelta
        from app.models.db_models import UserChannelCookie

        pwd = decrypt(row.password_encrypted)
        success, msg, new_cookie, real_expire = await login_with_credentials(
            row.login_url, row.username, pwd
        )
        if success and new_cookie:
            async with async_session() as db:
                ucc = await db.get(UserChannelCookie, row.id)
                if ucc:
                    ucc.cookie_encrypted = encrypt(new_cookie)
                    ucc.expire_at = real_expire if real_expire else now_beijing() + timedelta(days=7)
                    ucc.updated_at = now_beijing()
                    ucc.status = "active"
                    await db.commit()
            logger.info(f"[COOKIE_REFRESH] user={row.user_id} ch={row.channel_id} new_expire={real_expire}")
            return new_cookie
        else:
            logger.warning(f"[COOKIE_REFRESH] failed user={row.user_id} ch={row.channel_id}: {msg}")
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.warning(f"[COOKIE_REFRESH] error user={row.user_id} ch={row.channel_id}: {e}")
    return None


async def _get_user_channel_cookie(user_id: str, channel_id: int) -> str | None:
    """��ȡ�û�Ϊָ�� cookie �����ύ�� cookie"""
    from sqlalchemy import select, and_
    from app.database import async_session
    from app.models.db_models import UserChannelCookie
    from app.crypto import decrypt
    from datetime import datetime

    try:
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

            now = now_beijing()
            expired = row.expire_at and row.expire_at < now
            expiring_soon = (
                row.expire_at
                and not expired
                and (row.expire_at - now).total_seconds() < 2 * 3600
            )

            if expired or expiring_soon:
                # 尝试自动续期
                new_cookie = await _try_refresh_cookie(row)
                if new_cookie:
                    return new_cookie
                # 续期失败且未真正过期，继续用旧 cookie
                if not expired:
                    return decrypt(row.cookie_encrypted)
                return None

            return decrypt(row.cookie_encrypted)
    except asyncio.CancelledError:
        raise
    except Exception:
        return None


async def _get_random_user_cookie(channel_id: int) -> tuple[str, str] | None:
    """随机获取一个用户为指定 cookie 渠道提交的活跃 Cookie。
    返回 (cookie, user_id) 或 None。"""
    import random as _random
    from sqlalchemy import select, and_
    from app.database import async_session
    from app.models.db_models import UserChannelCookie
    from app.crypto import decrypt

    try:
        async with async_session() as db:
            result = await db.execute(
                select(UserChannelCookie).where(
                    and_(
                        UserChannelCookie.channel_id == channel_id,
                        UserChannelCookie.status == "active",
                    )
                )
            )
            rows = list(result.scalars().all())
            if not rows:
                return None

            _random.shuffle(rows)
            now = now_beijing()
            for row in rows:
                if row.expire_at and row.expire_at < now:
                    continue
                try:
                    cookie = decrypt(row.cookie_encrypted)
                    return cookie, row.user_id
                except Exception:
                    continue
            return None
    except asyncio.CancelledError:
        raise
    except Exception:
        return None


# Regex to detect OpenAI SSE format: data: {"id":"...","choices":[...]}
_OPENAI_SSE_RE = re.compile(r'"choices"\s*:\s*\[')


def _extract_sse_payload(line: str) -> str | None:
    """Extract JSON payload from SSE data line. Handles both 'data: {...}' and 'data:{...}'."""
    if line.startswith("data: "):
        return line[6:].strip()
    if line.startswith("data:"):
        return line[5:].strip()
    return None


def _reorder_messages(messages: list[dict]) -> list[dict]:
    """ȷ�� system ��Ϣʼ���� messages �������ǰ�档
    
    ĳЩģ�ͣ��� Qwen ͨ�� LiteLLM��Ҫ�� system message �����ǵ�һ����
    """
    if not messages:
        return messages
    
    system_messages = []
    other_messages = []
    
    for msg in messages:
        if msg.get("role") == "system":
            system_messages.append(msg)
        else:
            other_messages.append(msg)
    
    return system_messages + other_messages


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        async with _client_lock:
            if _client is None or _client.is_closed:
                _client = httpx.AsyncClient(
                    timeout=httpx.Timeout(60.0, connect=5.0),
                    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
                )
    return _client


async def close_client():
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


async def proxy_request_with_retry(
    cookie: str,
    raw_body: bytes,
    target_model: str,
    stream: bool,
    user_id: str | None = None,
    role: str = "user",
    channel_id: int | None = None,
    max_retries: int = 3,
) -> dict | StreamingResponse:
    """自动选渠道 + 失败重试换渠道。Cookie 渠道 401 时自动续期重试。"""
    last_error: Exception | None = None
    cookie_refreshed = False
    for attempt in range(max_retries):
        try:
            return await proxy_request(
                cookie=cookie,
                raw_body=raw_body,
                target_model=target_model,
                stream=stream,
                user_id=user_id,
                role=role,
                channel_id=channel_id,
            )
        except BackendAuthError as e:
            # Cookie 渠道 401：尝试续期后重试一次
            if user_id and not cookie_refreshed:
                ch = channel_service.get_channel(channel_id) if channel_id else None
                if ch and ch.get("auth_type") == "cookie":
                    logger.info(f"[PROXY_RETRY] Cookie 401, attempting refresh user={user_id} ch={channel_id}")
                    from app.database import async_session
                    from app.models.db_models import UserChannelCookie
                    from sqlalchemy import select, and_
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
                    if row:
                        new_cookie = await _try_refresh_cookie(row)
                        if new_cookie:
                            cookie_refreshed = True
                            continue  # 用新 cookie 重试
            raise
        except BackendError as e:
            last_error = e
            logger.warning(f"[PROXY_RETRY] attempt={attempt + 1}/{max_retries} model={target_model} error={e}")
            continue
    raise last_error or BackendError("所有渠道均失败")


async def proxy_request(
    cookie: str,
    raw_body: bytes,
    target_model: str,
    stream: bool,
    channel_id: int | None = None,
    user_id: str | None = None,
    role: str = "user",
) -> dict | StreamingResponse:
    """�������� - ֧�ֶ�����"""
    client = await get_client()
    logger.info(f"[PROXY] model={target_model} stream={stream} user={user_id} channel_id={channel_id}")

    # ѡ������������������ӳ���ĺ��ģ������
    channel = None
    backend_model = target_model
    if channel_id:
        channel = channel_service.get_channel(channel_id)
        # ָ������ʱҲ��Ҫ��ģ��ӳ��
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
        if channel.get("auth_type") == "cookie":
            url = f"{channel['base_url']}/agents/baitong/chat/completions"
        else:
            url = f"{channel['base_url']}/v1/chat/completions"
        logger.info(f"[PROXY] Channel: {channel['name']} (id={channel['id']}) auth={channel.get('auth_type')} url={url} backend_model={backend_model}")
        if channel.get("auth_type") == "cookie":
            if role == "admin":
                # 管理员随机使用一个用户的 Cookie，没有则 fallback 到渠道 api_key
                result = await _get_random_user_cookie(channel["id"])
                if result:
                    rand_cookie, rand_user_id = result
                    logger.info(f"[PROXY] Admin using random user cookie: user={rand_user_id} channel={channel['id']}")
                    headers = {
                        "Cookie": rand_cookie,
                        "Content-Type": "application/json",
                    }
                else:
                    channel_key = channel.get("api_key", "")
                    if not channel_key:
                        raise BackendError(f"渠道 {channel['name']} 无可用凭证：没有用户 Cookie 且渠道 API Key 为空")
                    logger.info(f"[PROXY] Admin fallback to channel api_key: channel={channel['id']}")
                    headers = {
                        "Authorization": f"Bearer {channel_key}",
                        "Content-Type": "application/json",
                    }
            else:
                if not user_id:
                    raise BackendError("Cookie ����������Ҫ�û�����")
                user_cookie = await _get_user_channel_cookie(user_id, channel["id"])
                logger.info(f"[PROXY] Cookie found: {'yes' if user_cookie else 'NO'} (user={user_id}, channel={channel['id']})")
                if not user_cookie:
                    raise BackendError(f"���� {channel['name']} ��Ҫ���� Cookie")
                headers = {
                    "Cookie": user_cookie,
                    "Content-Type": "application/json",
                }
        else:
            headers = {
                "Authorization": f"Bearer {channel.get('api_key', '')}",
                "Content-Type": "application/json",
            }
    else:
        raise BackendError("û�п��õ� API ����")

    # �޸��������е�ģ��������ȷ�� system message ����ǰ��
    body = json.loads(raw_body)
    body["model"] = target_model
    
    # ���� messages ȷ�� system ����ǰ��
    if "messages" in body and isinstance(body["messages"], list):
        body["messages"] = _reorder_messages(body["messages"])
        roles = [m.get("role", "?") for m in body["messages"]]
        logger.info(f"[PROXY] Message roles after reorder: {roles}")
    
    modified_body = json.dumps(body, ensure_ascii=True).encode("ascii")
    logger.info(f"[PROXY] Modified body sent to backend: {modified_body[:1000]}")
    req_timeout = httpx.Timeout(300.0, connect=10.0)

    if stream:
        # 流式：用 client.stream() 避免 httpx 缓冲整个响应
        try:
            logger.info(f"[PROXY] Sending stream request to {url}")
            resp_cm = client.stream(
                "POST", url,
                content=modified_body,
                headers=headers,
                timeout=req_timeout,
            )
            resp = await resp_cm.__aenter__()
            logger.info(f"[PROXY] Response status: {resp.status_code}")
        except httpx.TimeoutException:
            raise BackendError("后端请求超时")
        except httpx.RequestError as e:
            raise BackendError(f"后端请求失败: {str(e)}")

        if resp.status_code == 401:
            await resp.aclose()
            await resp_cm.__aexit__(None, None, None)
            raise BackendAuthError(status_code=resp.status_code)

        if resp.status_code >= 400:
            error_text = await resp.aread()
            await resp_cm.__aexit__(None, None, None)
            logger.error(f"[PROXY] Backend error {resp.status_code}: {error_text}")
            raise BackendError(
                f"后端返回 {resp.status_code}: {error_text[:500]}",
                response_body=f"--- 发送给后端的请求体 ---\n{modified_body.decode('utf-8', errors='replace')}\n\n--- 后端返回 ---\n{error_text.decode('utf-8', errors='replace')}",
            )

        model = target_model
        format_detected = False
        is_openai = False

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
                        if payload is not None:
                            yield f"data: {payload}\n\n"
                        else:
                            yield line + "\n\n"
                    else:
                        converted = _convert_sse_line(line, chunk_id, model, created)
                        if converted:
                            yield converted + "\n\n"
            finally:
                # 确保 httpx 流式连接和 context manager 都被正确关闭
                try:
                    await resp.aclose()
                except Exception:
                    pass
                try:
                    await resp_cm.__aexit__(None, None, None)
                except Exception:
                    pass

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # 非流式
    try:
        logger.info(f"[PROXY] Sending request to {url}")
        resp = await client.post(
            url,
            content=modified_body,
            headers=headers,
            timeout=req_timeout,
        )
        logger.info(f"[PROXY] Response status: {resp.status_code}")
    except httpx.TimeoutException:
        raise BackendError("后端请求超时")
    except httpx.RequestError as e:
        raise BackendError(f"后端请求失败: {str(e)}")

    if resp.status_code == 401:
        raise BackendAuthError(status_code=resp.status_code)

    if resp.status_code >= 400:
        error_text = resp.text
        logger.error(f"[PROXY] Backend error {resp.status_code}: {error_text}")
        raise BackendError(
            f"后端返回 {resp.status_code}: {error_text[:500]}",
            response_body=f"--- 发送给后端的请求体 ---\n{modified_body.decode('utf-8', errors='replace')}\n\n--- 后端返回 ---\n{error_text}",
        )

    # ����ʽ��Ӧ
    try:
        data = resp.json()
    except json.JSONDecodeError:
        raise BackendError("��˷�����Ч�� JSON")

    # ת��Ϊ OpenAI ��ʽ
    if _is_openai_format(data):
        return data
    elif _is_image_response(data):
        return _convert_image_response(data)
    else:
        return _to_openai_format(data, target_model)


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


def _extract_content(data: dict) -> str:
    """Extract content from various backend response formats."""
    return (
        data.get("content")
        or data.get("text")
        or (data.get("delta") or {}).get("content")
        or (data.get("token") or {}).get("text")
        or (data.get("message") or {}).get("content")
        or data.get("response")
        or data.get("result")
        or data.get("output")
        or ""
    )


def _to_openai_format(data: dict, model: str) -> dict:
    """Convert non-OpenAI response to OpenAI Chat Completion format."""
    content = _extract_content(data)

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

    content = _extract_content(data)

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


async def validate_cookie(cookie: str, channel_id: int | None = None) -> tuple[bool, str]:
    """验证 cookie 是否有效。

    优先使用 validate_cookie_url 配置的验证地址，
    否则尝试用 cookie 发一个最小请求到后端。

    Returns:
        (valid, message)
    """
    from app.config import settings

    # 如果配置了专门的验证 URL
    if settings.validate_cookie_url:
        try:
            client = await get_client()
            resp = await client.get(
                settings.validate_cookie_url,
                headers={"Cookie": cookie, "Content-Type": "application/json"},
                timeout=httpx.Timeout(10.0, connect=5.0),
            )
            if resp.status_code == 200:
                return True, "Cookie 有效"
            elif resp.status_code in (401, 403):
                return False, "Cookie 已失效"
            else:
                return True, f"Cookie 验证返回 {resp.status_code}，假定有效"
        except Exception as e:
            logger.warning(f"[COOKIE_VALIDATE] 验证请求失败: {e}")
            return True, "验证请求失败，假定有效"

    # 无验证 URL：尝试用 cookie 访问后端
    if channel_id:
        channel = channel_service.get_channel(channel_id)
        if channel:
            try:
                client = await get_client()
                url = f"{channel['base_url']}/agents/baitong/chat/completions"
                test_body = json.dumps({
                    "model": "test",
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                    "stream": False,
                }).encode()
                resp = await client.post(
                    url,
                    content=test_body,
                    headers={"Cookie": cookie, "Content-Type": "application/json"},
                    timeout=httpx.Timeout(10.0, connect=5.0),
                )
                if resp.status_code == 200:
                    return True, "Cookie 有效"
                elif resp.status_code in (401, 403):
                    return False, "Cookie 已失效"
                else:
                    return True, f"验证返回 {resp.status_code}，假定有效"
            except Exception as e:
                logger.warning(f"[COOKIE_VALIDATE] 验证请求失败: {e}")
                return True, "验证请求失败，假定有效"

    # 无法验证，假定有效
    return True, "无验证方式，假定有效"


class BackendAuthError(Exception):
    def __init__(self, status_code: int):
        self.status_code = status_code


class BackendError(Exception):
    def __init__(self, message: str, response_body: str | None = None):
        super().__init__(message)
        self.response_body = response_body
