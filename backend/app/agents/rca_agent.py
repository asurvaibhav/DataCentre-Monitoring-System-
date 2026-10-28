"""
Root Cause Analysis (RCA) Agent — Phase 3 of the AO-02 pipeline.

Reads the token context from the Shared Context Heap, correlates cross-resource
telemetry to attribute the capacity trend to a specific tenant/workload, and
outputs a structured RCADiagnosis via the LLM provider.
"""

from __future__ import annotations

from typing import Any

from app.core.ao02_state_and_graph import (
    HeapIncidentEnvelope,
    PipelinePhase,
    RCADiagnosis,
)
from app.core.llm_provider import LLMProvider
from app.agents.base import BaseAgent


class RCAAgent(BaseAgent):
    def __init__(
        self,
        heap,
        llm: Optional[LLMProvider] = None,
    ) -> None:
        super().__init__(heap=heap, llm=llm, name="RCAAgent")

    async def run(self, token_id: str) -> dict[str, Any]:
        envelope: HeapIncidentEnvelope = self.heap.get_envelope_for_agent(token_id)
        telemetry = envelope.telemetry
        forecast = envelope.forecast

        prompt = self._build_rca_prompt(telemetry, forecast)
        system_prompt = (
            "You are a data-center capacity root-cause analysis engineer. "
            "Analyze the telemetry forecast and attribute the capacity trend "
            "to a specific tenant and workload. Return ONLY the JSON object."
        )

        diagnosis: RCADiagnosis = await self._llm_structured(
            prompt=prompt,
            schema=RCADiagnosis,
            system_prompt=system_prompt,
        )

        envelope.rca = diagnosis
        summary = (
            f"RCA complete for {telemetry.resource_type.value} in "
            f"{telemetry.rack_id}/{telemetry.tenant_id}: attributed to "
            f"{diagnosis.attributed_tenant_id} ({diagnosis.driving_workload_signature}); "
            f"confidence {diagnosis.confidence_score:.2f}."
        )

        envelope = self._advance(
            envelope,
            PipelinePhase.REMEDIATION_CHECKING,
            summary,
        )
        return {
            "current_phase": envelope.token.current_phase.value,
            "hop_count": envelope.token.hop_count,
        }

    def _build_rca_prompt(
        self,
        telemetry,
        forecast,
    ) -> str:
        return (
            f"Resource: {telemetry.resource_type.value}\n"
            f"Rack: {telemetry.rack_id}\n"
            f"Tenant: {telemetry.tenant_id}\n"
            f"Unit: {telemetry.unit}\n"
            f"Current utilization: {telemetry.current_utilization_pct}%\n"
            f"Safety margin: {telemetry.safety_margin_pct}%\n"
            f"Hard capacity limit: {telemetry.hard_capacity_limit}\n"
            f"Predicted exhaustion: {forecast.predicted_exhaustion_date}\n"
            f"Lead time (weeks): {forecast.lead_time_weeks}\n"
            f"Confidence interval (days): {forecast.confidence_interval_days}\n"
            f"Forecast confidence: {forecast.forecast_confidence_score}\n"
            f"Regime change detected: {forecast.regime_change_detected}\n"
            f"Regime change description: {forecast.regime_change_description}\n"
            f"Transient spike: {forecast.is_transient_spike}\n"
            "\nIdentify the root cause, the tenant driving the trend, the specific "
            "workload signature causing saturation, any cross-resource correlated "
            "signals, and your confidence score. Output the structured RCADiagnosis JSON."
        )
