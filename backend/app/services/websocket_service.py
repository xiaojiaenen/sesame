"""WebSocket 服务 - 实时监控 API 请求"""

import asyncio
import json
from datetime import datetime

from app.utils import now_beijing
from typing import Set
from fastapi import WebSocket


class ConnectionManager:
    """WebSocket 连接管理器"""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        """广播消息给所有连接的客户端"""
        if not self.active_connections:
            return

        message_str = json.dumps(message, ensure_ascii=False)
        disconnected = set()

        for connection in self.active_connections:
            try:
                await connection.send_text(message_str)
            except Exception:
                disconnected.add(connection)

        # 清理断开的连接
        if disconnected:
            async with self._lock:
                self.active_connections -= disconnected


# 全局连接管理器
manager = ConnectionManager()


async def broadcast_request_event(
    event_type: str,
    user_id: str,
    model: str,
    tokens: int = 0,
    latency_ms: int = 0,
    status_code: int = 200,
    is_stream: bool = False,
    error_message: str = None,
):
    """广播请求事件"""
    event = {
        "type": event_type,  # "request_start", "request_end", "request_error"
        "timestamp": now_beijing().isoformat(),
        "data": {
            "user_id": user_id,
            "model": model,
            "tokens": tokens,
            "latency_ms": latency_ms,
            "status_code": status_code,
            "is_stream": is_stream,
            "error_message": error_message,
        }
    }
    await manager.broadcast(event)


async def broadcast_stats_update(stats: dict):
    """广播统计数据更新"""
    event = {
        "type": "stats_update",
        "timestamp": now_beijing().isoformat(),
        "data": stats
    }
    await manager.broadcast(event)
