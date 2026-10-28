"""Priority Token Queue REST endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_heap, get_queue
from app.api.serializers import serialize_token
from app.core.ao02_state_and_graph import IncidentToken

router = APIRouter(prefix="/queue", tags=["queue"])


@router.get("/snapshot")
def queue_snapshot(queue=Depends(get_queue), heap=Depends(get_heap)) -> dict:
    """Return all queued IncidentTokens ordered by priority (for the visualizer)."""
    tokens = queue.snapshot()
    return {
        "count": len(tokens),
        "tokens": [serialize_token(token, heap) for token in tokens],
    }


@router.post("/enqueue")
def enqueue_token(
    token: IncidentToken,
    queue=Depends(get_queue),
) -> dict:
    """Manually enqueue an IncidentToken (rejects duplicates)."""
    enqueued = queue.enqueue(token)
    if not enqueued:
        raise HTTPException(
            status_code=409,
            detail=f"Duplicate token for {token.rack_id}/{token.tenant_id}/{token.resource_type.value}",
        )
    return {"status": "enqueued", "token_id": token.token_id}
