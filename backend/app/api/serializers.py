"""
Shared serializers for AO-02 API payloads.

A queued IncidentToken only carries scheduling metadata. The dashboard needs
the telemetry summary and forecast that live in the Shared Context Heap, so
every token payload is enriched here. This keeps `/queue`, `/stream` and
`/agents` responses consistent and gives the frontend a single shape to parse.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.core.ao02_state_and_graph import (
    HeapIncidentEnvelope,
    IncidentToken,
    PipelinePhase,
    SharedContextHeap,
)


def _iso(value) -> Optional[str]:
    return value.isoformat() if value is not None else None


def serialize_token(
    token: IncidentToken,
    heap: Optional[SharedContextHeap] = None,
) -> Dict[str, Any]:
    """Serialize a token plus its heap-resident telemetry and forecast."""
    payload: Dict[str, Any] = {
        "token_id": token.token_id,
        "priority_number": token.priority_number,
        "rack_id": token.rack_id,
        "tenant_id": token.tenant_id,
        "resource_type": token.resource_type.value,
        "current_phase": token.current_phase.value,
        "hop_count": token.hop_count,
        "max_allowed_hops": token.max_allowed_hops,
        "created_at": _iso(token.created_at),
        "utilization_pct": None,
        "safety_margin_pct": None,
        "hard_capacity_limit": None,
        "unit": None,
        "lead_time_weeks": None,
        "forecast_confidence_score": None,
        "confidence_interval_days": None,
        "predicted_exhaustion_date": None,
        "is_transient_spike": None,
        "regime_change_detected": None,
        "regime_change_description": None,
        "awaiting_human_verification": (
            token.current_phase == PipelinePhase.HUMAN_VERIFICATION
        ),
        "risk_score": None,
        "gate_decision": None,
        "human_approved": None,
    }

    if heap is None:
        return payload

    try:
        envelope = heap.get_envelope_for_agent(token.token_id)
    except KeyError:
        return payload

    telemetry = envelope.telemetry
    forecast = envelope.forecast

    payload.update(
        {
            "utilization_pct": telemetry.current_utilization_pct,
            "safety_margin_pct": telemetry.safety_margin_pct,
            "hard_capacity_limit": telemetry.hard_capacity_limit,
            "unit": telemetry.unit,
            "window_start": _iso(telemetry.window_start),
            "window_end": _iso(telemetry.window_end),
            "raw_series_sha256": telemetry.raw_series_sha256,
            "lead_time_weeks": forecast.lead_time_weeks,
            "forecast_confidence_score": forecast.forecast_confidence_score,
            "confidence_interval_days": list(forecast.confidence_interval_days),
            "predicted_exhaustion_date": _iso(forecast.predicted_exhaustion_date),
            "is_transient_spike": forecast.is_transient_spike,
            "regime_change_detected": forecast.regime_change_detected,
            "regime_change_description": forecast.regime_change_description,
            "human_approved": envelope.human_approved,
        }
    )

    if envelope.risk_evaluation is not None:
        payload["risk_score"] = envelope.risk_evaluation.risk_score
        payload["gate_decision"] = envelope.risk_evaluation.gate_decision.value

    return payload


def serialize_envelope(envelope: HeapIncidentEnvelope) -> Dict[str, Any]:
    """Serialize a full envelope for the HITL console."""
    return envelope.model_dump(mode="json")
