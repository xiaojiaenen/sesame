"""Anthropic 格式转换服务 - 实现 Anthropic API 兼容格式（含 tool use 支持）"""

import json
import time
import uuid


# ============================================================
#  Schema sanitization — 移除后端不支持的 JSON Schema 字段
# ============================================================

_UNSUPPORTED_SCHEMA_KEYS = {
    "additionalProperties", "strict", "$schema", "$id", "$ref",
    "default", "examples", "const", "contentMediaType", "contentEncoding",
}


def _sanitize_schema(schema: dict) -> dict:
    """递归清理 JSON Schema，移除常见后端不支持的字段。"""
    if not isinstance(schema, dict):
        return schema
    cleaned = {}
    for k, v in schema.items():
        if k in _UNSUPPORTED_SCHEMA_KEYS:
            continue
        if isinstance(v, dict):
            cleaned[k] = _sanitize_schema(v)
        elif isinstance(v, list):
            cleaned[k] = [_sanitize_schema(item) if isinstance(item, dict) else item for item in v]
        else:
            cleaned[k] = v
    return cleaned


# ============================================================
#  Request: Anthropic → OpenAI
# ============================================================

def _extract_assistant_blocks(content: list) -> tuple[list[str], list[dict], str | None]:
    """从 assistant 的 content blocks 中提取文本、tool_calls 和 thinking。"""
    text_parts = []
    tool_calls = []
    reasoning_content = None
    for part in content:
        if not isinstance(part, dict):
            continue
        ptype = part.get("type", "")
        if ptype == "text":
            text_parts.append(part.get("text", ""))
        elif ptype == "tool_use":
            tool_calls.append({
                "id": part.get("id", f"call_{uuid.uuid4().hex[:12]}"),
                "type": "function",
                "function": {
                    "name": part["name"],
                    "arguments": json.dumps(part.get("input") or {}, ensure_ascii=False),
                },
            })
        elif ptype == "thinking":
            # Anthropic thinking block → DeepSeek reasoning_content
            reasoning_content = part.get("thinking", "")
    return text_parts, tool_calls, reasoning_content


def _extract_tool_results(content: list) -> tuple[list[dict], str | None]:
    """从 user 的 content blocks 中提取 tool_results 和剩余文本。

    Returns:
        (tool_messages, remaining_text) — tool 消息列表和剩余的用户文本（如果有）
    """
    tool_results = []
    text_parts = []
    for part in content:
        if not isinstance(part, dict):
            continue
        ptype = part.get("type", "")
        if ptype == "tool_result":
            result_content = part.get("content", "")
            if isinstance(result_content, list):
                result_content = "\n".join(
                    p.get("text", "") for p in result_content
                    if isinstance(p, dict) and p.get("type") == "text"
                )
            tool_results.append({
                "tool_call_id": part.get("tool_use_id", ""),
                "role": "tool",
                "content": str(result_content),
            })
        elif ptype == "text":
            text_parts.append(part.get("text", ""))
    remaining = "\n".join(text_parts) if text_parts else None
    return tool_results, remaining


def convert_anthropic_request_to_openai(anthropic_req: dict) -> dict:
    """将 Anthropic 请求转换为 OpenAI 格式，支持 tools / tool_use / tool_result。

    关键：OpenAI 要求 assistant(tool_calls) 后面必须紧跟 tool 消息，
    中间不能插入 user 消息。所以需要按正确的顺序输出消息。
    """
    messages = []

    # system → 独立 system message
    system = anthropic_req.get("system")
    if system:
        if isinstance(system, list):
            text_parts = [p.get("text", "") for p in system if isinstance(p, dict) and p.get("type") == "text"]
            system = "\n".join(text_parts)
        messages.append({"role": "system", "content": system})

    raw_messages = anthropic_req.get("messages") or []
    i = 0
    while i < len(raw_messages):
        msg = raw_messages[i]
        role = msg.get("role", "user")
        content = msg.get("content", "")

        # 简单字符串内容
        if isinstance(content, str):
            messages.append({"role": role, "content": content})
            i += 1
            continue

        if not isinstance(content, list):
            messages.append({"role": role, "content": str(content)})
            i += 1
            continue

        # --- assistant 消息 ---
        if role == "assistant":
            text_parts, tool_calls, reasoning = _extract_assistant_blocks(content)
            assistant_msg: dict = {"role": "assistant", "content": "\n".join(text_parts) or None}
            if tool_calls:
                assistant_msg["tool_calls"] = tool_calls
            if reasoning:
                assistant_msg["reasoning_content"] = reasoning
            messages.append(assistant_msg)

            # 如果 assistant 有 tool_calls，看下一个 user 消息里的 tool_result
            # 必须紧跟在 assistant 后面，不能插入 user 文本消息
            if tool_calls and i + 1 < len(raw_messages):
                next_msg = raw_messages[i + 1]
                if next_msg.get("role") == "user" and isinstance(next_msg.get("content"), list):
                    tool_results, remaining_text = _extract_tool_results(next_msg["content"])
                    # 先加 tool 消息（紧跟 assistant）
                    for tr in tool_results:
                        messages.append(tr)
                    # 再加 user 文本（如果有的话）
                    if remaining_text:
                        messages.append({"role": "user", "content": remaining_text})
                    i += 2  # 跳过已处理的 user 消息
                    continue
            i += 1
            continue

        # --- user 消息（没有 tool_result 的普通 user 消息）---
        if role == "user":
            text_parts = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    text_parts.append(part.get("text", ""))
                elif isinstance(part, str):
                    text_parts.append(part)
            if text_parts:
                messages.append({"role": "user", "content": "\n".join(text_parts)})
            i += 1
            continue

        # fallback
        messages.append({"role": role, "content": str(content)})
        i += 1

    # 构建 OpenAI 请求
    openai_req: dict = {
        "model": anthropic_req.get("model", ""),
        "messages": messages,
        "stream": anthropic_req.get("stream", False),
    }

    # tools 转换
    if "tools" in anthropic_req:
        openai_tools = []
        for tool in anthropic_req["tools"]:
            openai_tools.append({
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "parameters": _sanitize_schema(tool.get("input_schema") or {}),
                },
            })
        openai_req["tools"] = openai_tools

    # tool_choice 转换
    if "tool_choice" in anthropic_req:
        tc = anthropic_req["tool_choice"]
        tc_type = tc.get("type", "auto")
        if tc_type == "auto":
            openai_req["tool_choice"] = "auto"
        elif tc_type == "any":
            openai_req["tool_choice"] = "required"
        elif tc_type == "tool":
            openai_req["tool_choice"] = {
                "type": "function",
                "function": {"name": tc.get("name", "")},
            }

    # 可选参数
    for key in ("max_tokens", "temperature", "top_p", "stream"):
        if key in anthropic_req:
            openai_req[key] = anthropic_req[key]
    if "stop_sequences" in anthropic_req:
        openai_req["stop"] = anthropic_req["stop_sequences"]

    return openai_req


# ============================================================
#  Non-streaming Response: OpenAI → Anthropic
# ============================================================

def convert_openai_response_to_anthropic(openai_resp: dict, model: str = "") -> dict:
    """将 OpenAI 响应转换为 Anthropic 格式，支持 tool_calls。"""
    content_blocks = []
    stop_reason = "end_turn"

    if "choices" in openai_resp and len(openai_resp["choices"]) > 0:
        choice = openai_resp["choices"][0]
        message = choice.get("message") or choice.get("delta") or {}

        # thinking / reasoning_content
        reasoning = message.get("reasoning_content")
        if reasoning:
            content_blocks.append({"type": "thinking", "thinking": reasoning})

        # text content
        text = message.get("content")
        if text:
            content_blocks.append({"type": "text", "text": text})

        # tool_calls
        tool_calls = message.get("tool_calls") or []
        for tc in tool_calls:
            func = tc.get("function") or {}
            # 解析 arguments JSON
            try:
                args = json.loads(func.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            content_blocks.append({
                "type": "tool_use",
                "id": tc.get("id", f"toolu_{uuid.uuid4().hex[:24]}"),
                "name": func.get("name", ""),
                "input": args,
            })

        # finish_reason
        openai_finish = choice.get("finish_reason", "stop")
        if openai_finish == "stop":
            stop_reason = "end_turn"
        elif openai_finish == "length":
            stop_reason = "max_tokens"
        elif openai_finish == "tool_calls":
            stop_reason = "tool_use"
        elif openai_finish == "content_filter":
            stop_reason = "end_turn"
        else:
            stop_reason = "end_turn"

    # 确保至少有一个 content block
    if not content_blocks:
        content_blocks.append({"type": "text", "text": ""})

    anthropic_resp: dict = {
        "id": openai_resp.get("id", f"msg_{uuid.uuid4().hex[:24]}").replace("chatcmpl-", "msg_"),
        "type": "message",
        "role": "assistant",
        "content": content_blocks,
        "model": model or openai_resp.get("model", ""),
        "stop_reason": stop_reason,
        "stop_sequence": None,
    }

    if "usage" in openai_resp:
        usage = openai_resp["usage"]
        anthropic_resp["usage"] = {
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
        }

    return anthropic_resp


# ============================================================
#  Streaming: OpenAI chunk → Anthropic SSE events
# ============================================================

def convert_openai_chunk_to_anthropic(openai_chunk: dict, model: str = "", state: dict | None = None) -> list[dict]:
    """将 OpenAI 流式 chunk 转换为 Anthropic SSE 事件列表，支持 tool_calls。

    Args:
        state: 可选的 mutable dict，用于跨 chunk 跟踪 tool_calls 状态。
               调用方传入 {}，函数会写入 max_tool_index。
    """
    if state is None:
        state = {}
    events = []

    if "choices" not in openai_chunk or len(openai_chunk["choices"]) == 0:
        return events

    choice = openai_chunk["choices"][0]
    delta = choice.get("delta") or {}
    chunk_id = openai_chunk.get("id", f"msg_{uuid.uuid4().hex[:24]}").replace("chatcmpl-", "msg_")
    chunk_model = model or openai_chunk.get("model", "")

    # --- 第一个 chunk (带 role) ---
    if "role" in delta:
        events.append({
            "event": "message_start",
            "data": {
                "type": "message_start",
                "message": {
                    "id": chunk_id,
                    "type": "message",
                    "role": "assistant",
                    "content": [],
                    "model": chunk_model,
                    "stop_reason": None,
                    "stop_sequence": None,
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                },
            },
        })

    # --- thinking / reasoning_content delta ---
    if delta.get("reasoning_content"):
        if not state.get("thinking_started"):
            state["thinking_started"] = True
            state["thinking_index"] = 0
            events.append({
                "event": "content_block_start",
                "data": {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {"type": "thinking", "thinking": ""},
                },
            })
        events.append({
            "event": "content_block_delta",
            "data": {
                "type": "content_block_delta",
                "index": state.get("thinking_index", 0),
                "delta": {"type": "thinking_delta", "thinking": delta["reasoning_content"]},
            },
        })

    # --- text delta ---
    text_index = 1 if state.get("thinking_started") else 0
    if delta.get("content"):
        if not state.get("text_started"):
            state["text_started"] = True
            # thinking block 结束后才开始 text block
            if state.get("thinking_started") and not state.get("thinking_stopped"):
                state["thinking_stopped"] = True
                events.append({
                    "event": "content_block_stop",
                    "data": {"type": "content_block_stop", "index": 0},
                })
            events.append({
                "event": "content_block_start",
                "data": {
                    "type": "content_block_start",
                    "index": text_index,
                    "content_block": {"type": "text", "text": ""},
                },
            })
        events.append({
            "event": "content_block_delta",
            "data": {
                "type": "content_block_delta",
                "index": text_index,
                "delta": {"type": "text_delta", "text": delta["content"]},
            },
        })

    # --- tool_calls delta ---
    tool_index_offset = (1 if state.get("thinking_started") else 0) + 1  # thinking + text
    for tc in (delta.get("tool_calls") or []):
        tc_index = tc.get("index", 0)
        anthropic_index = tc_index + tool_index_offset

        # 跟踪最大 tool index
        if anthropic_index > state.get("max_tool_index", 0):
            state["max_tool_index"] = anthropic_index

        func = tc.get("function") or {}

        # 首个 tool chunk 有 id 和 name → 发 content_block_start
        if tc.get("id"):
            events.append({
                "event": "content_block_start",
                "data": {
                    "type": "content_block_start",
                    "index": anthropic_index,
                    "content_block": {
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": func.get("name", ""),
                        "input": {},
                    },
                },
            })

        # arguments delta
        if func.get("arguments"):
            events.append({
                "event": "content_block_delta",
                "data": {
                    "type": "content_block_delta",
                    "index": anthropic_index,
                    "delta": {
                        "type": "input_json_delta",
                        "partial_json": func["arguments"],
                    },
                },
            })

    # --- finish ---
    finish_reason = choice.get("finish_reason")
    if finish_reason:
        max_idx = state.get("max_tool_index", 0)

        # 停止 thinking block（如果还没停过）
        if state.get("thinking_started") and not state.get("thinking_stopped"):
            events.append({
                "event": "content_block_stop",
                "data": {"type": "content_block_stop", "index": 0},
            })

        # 停止 text block（如果有的话）
        if state.get("text_started"):
            text_idx = 1 if state.get("thinking_started") else 0
            events.append({
                "event": "content_block_stop",
                "data": {"type": "content_block_stop", "index": text_idx},
            })

        # 为每个 tool block 发 stop
        _tool_start = (1 if state.get("thinking_started") else 0) + 1
        for i in range(_tool_start, max_idx + 1):
            events.append({
                "event": "content_block_stop",
                "data": {"type": "content_block_stop", "index": i},
            })

        # stop_reason
        if finish_reason == "tool_calls":
            stop_reason = "tool_use"
        elif finish_reason == "length":
            stop_reason = "max_tokens"
        else:
            stop_reason = "end_turn"

        events.append({
            "event": "message_delta",
            "data": {
                "type": "message_delta",
                "delta": {"stop_reason": stop_reason, "stop_sequence": None},
                "usage": {"output_tokens": 0},
            },
        })
        events.append({
            "event": "message_stop",
            "data": {"type": "message_stop"},
        })

    return events


# ============================================================
#  SSE helper
# ============================================================

def format_sse_event(event: str, data: dict) -> str:
    """格式化 SSE 事件"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
