"""Priority Token Queue REST endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_queue
from app.core.ao02_state_and_graph import IncidentToken

router = APIRouter(prefix="/queue", tags=["queue"])


@router.get("/snapshot")
def queue_snapshot(queue=Depends(get_queue)) -> dict:
    """Return all queued IncidentTokens ordered by priority (for the visualizer)."""
    tokens = queue.snapshot()
    return {
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
                "max_allowed_hops": t.max_allowed_hops,
                "created_at": t.created_at.isoformat(),
            }
            for t in tokens
        ],
    }


@router.post("/enqueue")
def enqueue_token(token: IncidentToken, queue=Depends(get_queue)) -> dict:
    """Manually enqueue an IncidentToken (rejects duplicates)."""
    enqueued = queue.enqueue(token)
    if not enqueued:
        raise HTTPException(
            status_code=409,
            detail=f"Duplicate token for {token.rack_id}/{token.tenant_id}/{token.resource_type.value}",
        )
    return {"status": "enqueued", "token_id": token.token_id}
