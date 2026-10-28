"""
AO-02 REST endpoints for the agent pipeline.

The endpoint (not the graph) owns dequeueing so a token is only removed from
the queue once the run succeeds. Failed runs are requeued instead of silently
losing work.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import get_heap, get_queue, get_workflow
from app.api.serializers import serialize_envelope, serialize_token
from app.core.ao02_state_and_graph import GateDecision, PipelinePhase
from app.services.streaming import broadcast_queue_update, broadcast_token_transition

router = APIRouter(prefix="/agents", tags=["agents"])


class DecisionRequest(BaseModel):
    token_id: str
    decision: Literal["approve", "reject", "defer"]
    operator: str = Field(default="operator@facility", min_length=1, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=1000)


@router.post("/run")
async def run_agent_pipeline(
    queue=Depends(get_queue),
    heap=Depends(get_heap),
    workflow=Depends(get_workflow),
) -> Dict[str, Any]:
    """Dequeue the highest-priority token and run the 6-phase pipeline.

    Execution pauses before the human-verification gate; the token is then
    exposed by `/agents/pending` until an operator records a decision.
    """
    token = queue.dequeue()
    if token is None:
        return {"status": "idle", "message": "No tokens in queue"}

    initial_state = {
        "active_token_id": token.token_id,
        "current_phase": token.current_phase.value,
        "hop_count": token.hop_count,
        "should_halt": False,
        "halt_reason": None,
        "awaiting_human_verification": False,
    }

    try:
        result = await workflow.ainvoke(initial_state)
    except Exception as exc:  # noqa: BLE001 - surface graph errors to the caller
        queue.requeue(token)
        await broadcast_queue_update()
        return {
            "status": "error",
            "token_id": token.token_id,
            "error": str(exc),
            "requeued": True,
        }

    await broadcast_queue_update()
    envelope = heap.get_envelope_for_agent(token.token_id)
    return {
        "status": "completed",
        "token_id": token.token_id,
        "final_phase": result.get("current_phase"),
        "hop_count": result.get("hop_count"),
        "should_halt": result.get("should_halt", False),
        "halt_reason": result.get("halt_reason"),
        "awaiting_human_verification": envelope.token.current_phase
        == PipelinePhase.HUMAN_VERIFICATION,
        "token": serialize_token(envelope.token, heap),
    }


@router.get("/pending")
async def pending_verification(heap=Depends(get_heap)) -> Dict[str, Any]:
    """Tokens that reached the human-verification gate and await a decision."""
    pending = [
        env
        for env in heap.all_envelopes()
        if env.token.current_phase == PipelinePhase.HUMAN_VERIFICATION
    ]
    return {
        "count": len(pending),
        "tokens": [serialize_token(env.token, heap) for env in pending],
    }


@router.post("/decision")
async def record_decision(
    request: DecisionRequest,
    heap=Depends(get_heap),
) -> Dict[str, Any]:
    """Record a human-in-the-loop decision in the immutable audit trail."""
    try:
        envelope = heap.get_envelope_for_agent(request.token_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if envelope.token.current_phase != PipelinePhase.HUMAN_VERIFICATION:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Token {request.token_id} is in phase "
                f"{envelope.token.current_phase.value}, not awaiting human verification."
            ),
        )

    notes = request.notes or ""
    if request.decision == "approve":
        envelope.human_approved = True
        envelope.token.current_phase = PipelinePhase.RESOLVED
        if envelope.risk_evaluation is not None:
            envelope.risk_evaluation.gate_decision = GateDecision.APPROVED_BY_OPERATOR
        summary = f"Operator {request.operator} approved advisory. {notes}".strip()
    elif request.decision == "reject":
        envelope.human_approved = False
        envelope.token.current_phase = PipelinePhase.REJECTED
        if envelope.risk_evaluation is not None:
            envelope.risk_evaluation.gate_decision = GateDecision.REJECTED_BY_OPERATOR
        summary = f"Operator {request.operator} rejected advisory. {notes}".strip()
    else:
        envelope.operator_notes = notes
        summary = f"Operator {request.operator} deferred decision. {notes}".strip()

    heap.put_envelope(
        envelope,
        actor=f"HumanOperator:{request.operator}",
        summary=summary,
    )

    await broadcast_token_transition(
        token_id=envelope.token.token_id,
        phase=envelope.token.current_phase.value,
        hop_count=envelope.token.hop_count,
        summary=summary,
        awaiting_human=envelope.token.current_phase
        == PipelinePhase.HUMAN_VERIFICATION,
    )
    await broadcast_queue_update()

    return {
        "status": "recorded",
        "decision": request.decision,
        "token": serialize_token(envelope.token, heap),
        "envelope": serialize_envelope(envelope),
    }


@router.get("/history")
async def pipeline_history(
    limit: int = 25,
    heap=Depends(get_heap),
) -> List[Dict[str, Any]]:
    """Completed incidents (resolved, rejected, or halted), newest first."""
    terminal = {
        PipelinePhase.RESOLVED,
        PipelinePhase.REJECTED,
        PipelinePhase.HALTED_LOOP_GUARD,
    }
    envelopes = [
        envelope
        for envelope in heap.all_envelopes()
        if envelope.token.current_phase in terminal
    ]
    envelopes.sort(key=lambda env: env.token.created_at, reverse=True)
    return [serialize_token(env.token, heap) for env in envelopes[: max(1, min(limit, 100))]]
