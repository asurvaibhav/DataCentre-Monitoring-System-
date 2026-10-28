"""
Pub/sub helpers used by agent nodes to broadcast live state transitions
to connected WebSocket clients.
"""

from __future__ import annotations

from typing import Any

from app.api.routers.stream import manager


async def broadcast_token_transition(
    token_id: str,
    phase: str,
    hop_count: int,
    summary: str,
    awaiting_human: bool = False,
    should_halt: bool = False,
    halt_reason: str | None = None,
) -> None:
    """Broadcast a token phase transition to all WebSocket subscribers."""
    await manager.broadcast(
        {
            "type": "token_transition",
            "token_id": token_id,
            "phase": phase,
            "hop_count": hop_count,
            "summary": summary,
            "awaiting_human_verification": awaiting_human,
            "should_halt": should_halt,
            "halt_reason": halt_reason,
        }
    )


async def broadcast_queue_update() -> None:
    """Broadcast a full queue snapshot to all WebSocket subscribers."""
    from app.api.deps import get_heap, get_queue
    from app.api.serializers import serialize_token

    queue = get_queue()
    heap = get_heap()
    await manager.broadcast(
        {
            "type": "queue_update",
            "tokens": [serialize_token(token, heap) for token in queue.snapshot()],
        }
    )
