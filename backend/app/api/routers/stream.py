"""
AO-02 WebSocket endpoints for live agent graph streaming.

Streams LangGraph state transitions and priority queue changes to the
decoupled React frontend in real time.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.deps import get_heap, get_queue
from app.api.serializers import serialize_token

router = APIRouter(prefix="/stream", tags=["streaming"])

HEARTBEAT_SECONDS = 20


class ConnectionManager:
    """Manages active WebSocket connections for live streaming."""

    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        if not self.active_connections:
            return
        payload = json.dumps(message, default=str)
        dead: Set[WebSocket] = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception:  # noqa: BLE001 - drop broken connections
                dead.add(connection)
        for connection in dead:
            self.disconnect(connection)


manager = ConnectionManager()


@router.websocket("/agent-events")
async def agent_events(websocket: WebSocket) -> None:
    """WebSocket stream for live agent graph state transitions.

    On connect the client receives a queue snapshot, then every pipeline
    transition and queue change as it happens. Idle connections receive a
    heartbeat every 20s so proxies do not silently close the socket.
    """
    await manager.connect(websocket)
    try:
        queue = get_queue()
        heap = get_heap()
        snapshot = {
            "type": "queue_snapshot",
            "tokens": [serialize_token(token, heap) for token in queue.snapshot()],
        }
        await websocket.send_text(json.dumps(snapshot, default=str))

        while True:
            try:
                await asyncio.wait_for(
                    websocket.receive_text(), timeout=HEARTBEAT_SECONDS
                )
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
    except (WebSocketDisconnect, RuntimeError, asyncio.CancelledError):
        pass
    finally:
        manager.disconnect(websocket)


@router.get("/queue/snapshot")
async def queue_snapshot() -> dict[str, Any]:
    """HTTP fallback for the current priority queue snapshot."""
    queue = get_queue()
    heap = get_heap()
    tokens = queue.snapshot()
    return {
        "count": len(tokens),
        "tokens": [serialize_token(token, heap) for token in tokens],
    }
