"""
AO-02 WebSocket endpoints for live agent graph streaming.

Streams LangGraph state transitions and priority queue changes to the
decoupled React frontend in real time.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import JSONResponse

from app.api.deps import get_heap, get_queue

router = APIRouter(prefix="/stream", tags=["streaming"])


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

    Clients connect and receive JSON messages whenever the LangGraph
    pipeline advances a token through a phase, including phase changes,
    hop counts, risk scores, and human-verification prompts.
    """
    await manager.connect(websocket)
    try:
        # Send an initial snapshot of the current queue state.
        queue = get_queue()
        snapshot = {
            "type": "queue_snapshot",
            "tokens": [
                {
                    "token_id": t.token_id,
                    "priority_number": t.priority_number,
                    "rack_id": t.rack_id,
                    "tenant_id": t.tenant_id,
                    "resource_type": t.resource_type.value,
                    "current_phase": t.current_phase.value,
                    "hop_count": t.hop_count,
                    "created_at": t.created_at.isoformat(),
                }
                for t in queue.snapshot()
            ],
        }
        await websocket.send_text(json.dumps(snapshot, default=str))

        # Keep the connection open; the pipeline pushes events via manager.broadcast
        # from agent nodes / API endpoints. Here we simply hold the socket.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.get("/queue/snapshot")
async def queue_snapshot() -> JSONResponse:
    """HTTP fallback for the current priority queue snapshot."""
    queue = get_queue()
    tokens = queue.snapshot()
    return JSONResponse(
        content={
            "count": len(tokens),
            "tokens": [
                {
                    "token_id": t.token_id,
                    "priority_number": t.priority_number,
                    "rack_id": t.rack_id,
                    "tenant_id": t.tenant_id,
                    "resource_type": t.resource_type.value,
                    "current_phase": t.current_phase.value,
                    "hop_count": t.hop_count,
                    "created_at": t.created_at.isoformat(),
                }
                for t in tokens
            ],
        }
    )
