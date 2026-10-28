"""
Resource Monitoring Agent — Phase 1 of the AO-02 pipeline.

Evaluates the telemetry window attached to an IncidentToken, runs the
time-to-exhaustion forecast, suppresses transient spikes (false-alarm
filtering), detects regime changes, and advances the token to incident
reporting when a genuine breach is confirmed.
"""

from __future__ import annotations

from typing import Any, Optional

from app.core.ao02_state_and_graph import (
    CapacityForecast,
    HeapIncidentEnvelope,
    PipelinePhase,
)
from app.core.llm_provider import LLMProvider
from app.agents.base import BaseAgent


class ResourceMonitoringAgent(BaseAgent):
    def __init__(
        self,
        heap,
        llm: Optional[LLMProvider] = None,
    ) -> None:
        super().__init__(heap=heap, llm=llm, name="ResourceMonitoringAgent")

    async def run(self, token_id: str) -> dict[str, Any]:
        envelope: HeapIncidentEnvelope = self.heap.get_envelope_for_agent(token_id)
        forecast: CapacityForecast = envelope.forecast

        # --- False-alarm suppression: transient spike that resolves on its own ---
        if forecast.is_transient_spike:
            envelope.token.current_phase = PipelinePhase.RESOLVED
            self.heap.put_envelope(
                envelope,
                actor=self.name,
                summary=(
                    "Transient spike detected and suppressed; "
                    "no operator page triggered."
                ),
            )
            return {
                "current_phase": PipelinePhase.RESOLVED.value,
                "should_halt": True,
                "halt_reason": "Transient spike suppressed",
                "hop_count": envelope.token.hop_count,
            }

        # --- Regime change: annotate but continue pipeline ---
        regime_note = ""
        if forecast.regime_change_detected:
            regime_note = (
                f" Regime change detected: {forecast.regime_change_description or 'step-change in trend'}."
            )

        # --- Escalate urgency if lead time is critically short ---
        urgency_note = ""
        if forecast.lead_time_weeks < 4.0:
            urgency_note = (
                f" CRITICAL: lead time {forecast.lead_time_weeks:.1f} weeks is below "
                "the 4-week operator action threshold."
            )

        summary = (
            f"Confirmed {envelope.telemetry.resource_type.value} exhaustion risk in "
            f"{envelope.telemetry.rack_id}/{envelope.telemetry.tenant_id}: "
            f"utilization {envelope.telemetry.current_utilization_pct:.1f}%, "
            f"lead time {forecast.lead_time_weeks:.1f} weeks, "
            f"confidence {forecast.forecast_confidence_score:.2f}.{regime_note}{urgency_note}"
        )

        envelope = self._advance(
            envelope,
            PipelinePhase.INCIDENT_REPORTING,
            summary,
        )
        return {
            "current_phase": envelope.token.current_phase.value,
            "hop_count": envelope.token.hop_count,
            "should_halt": False,
            "halt_reason": None,
        }
