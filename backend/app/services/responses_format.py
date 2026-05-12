"""OpenAI Responses API 格式转换 - /v1/responses 与 Chat Completions 互转"""

import json
import time
import uuid


# ============================================================
#  Request: Responses API → Chat Completions
# ============================================================

def convert_responses_request_to_openai(req: dict) -> dict:
    """将 Responses API 请求转换为 Chat Completions 格式。"""
    messages = []

    # instructions → system message
    instructions = req.get("instructions")
    if instructions:
        messages.append({"role": "system", "content": instructions})

    # input → messages
    input_data = req.get("input", "")
    if isinstance(input_data, str):
        messages.append({"role": "user", "content": input_data})
    elif isinstance(input_data, list):
        for item in input_data:
            msg = _convert_input_item(item)
            if msg:
                messages.append(msg)

    # 构建 Chat Completions 请求
    openai_req = {
        "model": req.get("model", ""),
        "messages": messages,
        "stream": req.get("stream", False),
    }

    # 可选参数透传
    if "temperature" in req:
        openai_req["temperature"] = req["temperature"]
    if "max_output_tokens" in req:
        openai_req["max_tokens"] = req["max_output_tokens"]
    if "top_p" in req:
        openai_req["top_p"] = req["top_p"]

    # tools 转换
    tools = req.get("tools")
    if tools:
        openai_req["tools"] = _convert_tools_to_openai(tools)

    # stream_options
    if req.get("stream"):
        openai_req["stream_options"] = {"include_usage": True}

    return openai_req


def _convert_input_item(item: dict) -> dict | None:
    """将 Responses API input item 转为 Chat Completions message。"""
    item_type = item.get("type", "message")

    if item_type == "message":
        role = item.get("role", "user")
        content = _extract_content_text(item.get("content", []))
        return {"role": role, "content": content}

    if item_type == "function_call":
        return {
            "role": "assistant",
            "tool_calls": [{
                "id": item.get("call_id", ""),
                "type": "function",
                "function": {
                    "name": item.get("name", ""),
                    "arguments": item.get("arguments", "{}"),
                },
            }],
        }

    if item_type == "function_call_output":
        return {
            "role": "tool",
            "tool_call_id": item.get("call_id", ""),
            "content": item.get("output", ""),
        }

    return None


def _extract_content_text(content) -> str:
    """从 Responses API content 数组中提取纯文本。"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict):
                ptype = part.get("type", "")
                if ptype in ("input_text", "output_text", "text"):
                    parts.append(part.get("text", ""))
        return "".join(parts)
    return str(content) if content else ""


def _convert_tools_to_openai(tools: list) -> list:
    """将 Responses API tools 格式转为 Chat Completions 格式。"""
    result = []
    for tool in tools:
        if tool.get("type") == "function":
            result.append({
                "type": "function",
                "function": {
                    "name": tool.get("name", ""),
                    "description": tool.get("description", ""),
                    "parameters": tool.get("parameters", {}),
                },
            })
    return result


# ============================================================
#  Response: Chat Completions → Responses API
# ============================================================

def convert_openai_response_to_responses(resp: dict, model: str) -> dict:
    """将 Chat Completions 响应转换为 Responses API 格式。"""
    choice = (resp.get("choices") or [{}])[0]
    message = choice.get("message") or {}

    output_items = []

    # reasoning_content → reasoning item
    reasoning = message.get("reasoning_content") or message.get("reasoning")
    if reasoning:
        output_items.append({
            "type": "reasoning",
            "id": f"rs_{uuid.uuid4().hex[:12]}",
            "summary": [{"type": "summary_text", "text": reasoning}],
        })

    # tool_calls → function_call items
    tool_calls = message.get("tool_calls") or []
    for tc in tool_calls:
        fn = tc.get("function") or {}
        output_items.append({
            "type": "function_call",
            "id": f"fc_{uuid.uuid4().hex[:12]}",
            "call_id": tc.get("id", ""),
            "name": fn.get("name", ""),
            "arguments": fn.get("arguments", "{}"),
        })

    # text content → message item
    text = message.get("content", "")
    if text or not tool_calls:
        output_items.append({
            "type": "message",
            "id": f"msg_{uuid.uuid4().hex[:12]}",
            "role": "assistant",
            "content": [{"type": "output_text", "text": text or ""}],
        })

    usage = resp.get("usage") or {}

    return {
        "id": f"resp_{uuid.uuid4().hex[:12]}",
        "object": "response",
        "created_at": int(time.time()),
        "model": model,
        "output": output_items,
        "usage": {
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
        },
        "status": "completed",
    }


# ============================================================
#  Streaming: Chat Completions → Responses API events
# ============================================================

def convert_openai_chunk_to_responses_events(
    chunk: dict, model: str, state: dict
) -> list[dict]:
    """将 Chat Completions 流式 chunk 转为 Responses API SSE 事件列表。"""
    events = []
    choice = (chunk.get("choices") or [None])[0]

    # 首个 chunk：发送 response.created
    if not state.get("started"):
        state["started"] = True
        state["resp_id"] = f"resp_{uuid.uuid4().hex[:12]}"
        state["msg_id"] = f"msg_{uuid.uuid4().hex[:12]}"
        state["text_buf"] = ""
        state["reasoning_buf"] = ""
        state["tool_calls"] = {}  # idx -> {id, name, arguments, fc_id, output_idx}
        state["next_output_idx"] = 1  # 0 = message item, tool calls start at 1

        events.append({
            "type": "response.created",
            "response": {
                "id": state["resp_id"],
                "object": "response",
                "created_at": int(time.time()),
                "model": model,
                "output": [],
                "usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
                "status": "in_progress",
            },
        })

    if choice is None:
        # usage-only chunk
        usage = chunk.get("usage")
        if usage and state.get("started"):
            state["prompt_tokens"] = usage.get("prompt_tokens", 0) or state.get("prompt_tokens", 0)
            state["completion_tokens"] = usage.get("completion_tokens", 0) or state.get("completion_tokens", 0)
        return events

    delta = choice.get("delta") or {}

    # --- reasoning_content delta ---
    reasoning = delta.get("reasoning_content") or delta.get("reasoning")
    if reasoning:
        if not state.get("reasoning_started"):
            state["reasoning_started"] = True
            state["reasoning_id"] = f"rs_{uuid.uuid4().hex[:12]}"
            state["reasoning_output_idx"] = state["next_output_idx"]
            state["next_output_idx"] += 1
            events.append({
                "type": "response.output_item.added",
                "item": {
                    "type": "reasoning",
                    "id": state["reasoning_id"],
                    "summary": [],
                },
                "output_index": state["reasoning_output_idx"],
            })
        state["reasoning_buf"] += reasoning
        events.append({
            "type": "response.reasoning_summary_text.delta",
            "item_id": state["reasoning_id"],
            "output_index": state["reasoning_output_idx"],
            "delta": reasoning,
        })

    # --- text delta ---
    content = delta.get("content")
    if content:
        if not state.get("text_started"):
            state["text_started"] = True
            state["msg_output_idx"] = state["next_output_idx"]
            state["next_output_idx"] += 1
            # 发送 message item added + content_part added
            events.append({
                "type": "response.output_item.added",
                "item": {
                    "type": "message",
                    "id": state["msg_id"],
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": ""}],
                },
                "output_index": state["msg_output_idx"],
            })
            events.append({
                "type": "response.content_part.added",
                "part": {"type": "output_text", "text": ""},
                "output_index": state["msg_output_idx"],
                "content_index": 0,
            })

        events.append({
            "type": "response.output_text.delta",
            "item_id": state["msg_id"],
            "output_index": state.get("msg_output_idx", 0),
            "content_index": 0,
            "delta": content,
        })
        state["text_buf"] += content

    # --- tool call deltas ---
    tool_calls = delta.get("tool_calls") or []
    for tc in tool_calls:
        idx = tc.get("index", 0)

        if idx not in state["tool_calls"]:
            fc_id = f"fc_{uuid.uuid4().hex[:12]}"
            call_id = tc.get("id", "")
            fn = tc.get("function") or {}
            output_idx = state["next_output_idx"]
            state["next_output_idx"] += 1

            state["tool_calls"][idx] = {
                "id": call_id,
                "name": fn.get("name", ""),
                "arguments": "",
                "fc_id": fc_id,
                "output_idx": output_idx,
            }

            events.append({
                "type": "response.output_item.added",
                "item": {
                    "type": "function_call",
                    "id": fc_id,
                    "call_id": call_id,
                    "name": fn.get("name", ""),
                    "arguments": "",
                },
                "output_index": output_idx,
            })

        tc_state = state["tool_calls"][idx]
        fn = tc.get("function") or {}
        if fn.get("name") and not tc_state["name"]:
            tc_state["name"] = fn["name"]
        if fn.get("arguments"):
            tc_state["arguments"] += fn["arguments"]
            events.append({
                "type": "response.function_call_arguments.delta",
                "item_id": tc_state["fc_id"],
                "output_index": tc_state["output_idx"],
                "delta": fn["arguments"],
            })

    # --- finish_reason → 结束事件 ---
    finish_reason = choice.get("finish_reason")
    if finish_reason and not state.get("finished"):
        state["finished"] = True

        # reasoning done
        if state.get("reasoning_started"):
            events.append({
                "type": "response.reasoning_summary_text.done",
                "item_id": state["reasoning_id"],
                "output_index": state["reasoning_output_idx"],
                "text": state["reasoning_buf"],
            })
            events.append({
                "type": "response.output_item.done",
                "item": {
                    "type": "reasoning",
                    "id": state["reasoning_id"],
                    "summary": [{"type": "summary_text", "text": state["reasoning_buf"]}],
                },
                "output_index": state["reasoning_output_idx"],
            })

        # text done
        if state.get("text_started"):
            events.append({
                "type": "response.output_text.done",
                "item_id": state["msg_id"],
                "output_index": state["msg_output_idx"],
                "content_index": 0,
                "text": state["text_buf"],
            })
            events.append({
                "type": "response.content_part.done",
                "part": {"type": "output_text", "text": state["text_buf"]},
                "output_index": state["msg_output_idx"],
                "content_index": 0,
            })
            events.append({
                "type": "response.output_item.done",
                "item": {
                    "type": "message",
                    "id": state["msg_id"],
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": state["text_buf"]}],
                },
                "output_index": state["msg_output_idx"],
            })

        # tool calls done — 用 list() 快照避免迭代问题
        for idx, tc_state in list(state["tool_calls"].items()):
            events.append({
                "type": "response.function_call_arguments.done",
                "item_id": tc_state["fc_id"],
                "output_index": tc_state["output_idx"],
                "arguments": tc_state["arguments"],
            })
            events.append({
                "type": "response.output_item.done",
                "item": {
                    "type": "function_call",
                    "id": tc_state["fc_id"],
                    "call_id": tc_state["id"],
                    "name": tc_state["name"],
                    "arguments": tc_state["arguments"],
                },
                "output_index": tc_state["output_idx"],
            })

    return events


def build_response_completed(state: dict, model: str) -> dict:
    """构建流式结束时的 response.completed 事件。"""
    output_items = []

    # reasoning item
    if state.get("reasoning_started"):
        output_items.append({
            "type": "reasoning",
            "id": state.get("reasoning_id", f"rs_{uuid.uuid4().hex[:12]}"),
            "summary": [{"type": "summary_text", "text": state.get("reasoning_buf", "")}],
        })

    # message item
    if state.get("text_started") or not state.get("tool_calls"):
        output_items.append({
            "type": "message",
            "id": state.get("msg_id", ""),
            "role": "assistant",
            "content": [{"type": "output_text", "text": state.get("text_buf", "")}],
        })

    # tool call items
    for idx, tc_state in state.get("tool_calls", {}).items():
        output_items.append({
            "type": "function_call",
            "id": tc_state["fc_id"],
            "call_id": tc_state["id"],
            "name": tc_state["name"],
            "arguments": tc_state["arguments"],
        })

    return {
        "type": "response.completed",
        "response": {
            "id": state.get("resp_id", ""),
            "object": "response",
            "created_at": int(time.time()),
            "model": model,
            "output": output_items,
            "usage": {
                "input_tokens": state.get("prompt_tokens", 0),
                "output_tokens": state.get("completion_tokens", 0),
                "total_tokens": state.get("prompt_tokens", 0) + state.get("completion_tokens", 0),
            },
            "status": "completed",
        },
    }
