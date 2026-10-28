"""
Remediation Agent — Phase 4 of the AO-02 pipeline.

Consumes the RCA report and calculates viable capacity remediation options
(e.g., workload rebalancing, storage tier archival, quota adjustments,
cooling airflow optimization preview). Strictly read-only advisory: the
Pydantic schema enforces mutates_live_facility_controls=False.
"""

from __future__ import annotations

from typing import Any

from app.core.ao02_state_and_graph import (
    HeapIncidentEnvelope,
    PipelinePhase,
    RemediationOption,
)
from app.core.llm_provider import LLMProvider
from app.agents.base import BaseAgent


class RemediationAgent(BaseAgent):
    def __init__(
        self,
        heap,
        llm: Optional[LLMProvider] = None,
    ) -> None:
        super().__init__(heap=heap, llm=llm, name="RemediationAgent")

    async def run(self, token_id: str) -> dict[str, Any]:
        envelope: HeapIncidentEnvelope = self.heap.get_envelope_for_agent(token_id)
        telemetry = envelope.telemetry
        forecast = envelope.forecast
        rca = envelope.rca

        prompt = self._build_remediation_prompt(telemetry, forecast, rca)
        system_prompt = (
            "You are a data-center capacity remediation engineer. Generate "
            "read-only advisory capacity mitigation options. Never recommend "
            "mutating live facility controls (power, cooling, network). "
            "Return ONLY the JSON object."
        )

        # The LLM returns a single RemediationOption; wrap into a list.
        option: RemediationOption = await self._llm_structured(
            prompt=prompt,
            schema=RemediationOption,
            system_prompt=system_prompt,
        )

        # Hard safety gate: schema validator already enforces False, but
        # double-check at runtime before persisting.
        if option.mutates_live_facility_controls:
            option.mutates_live_facility_controls = False

        envelope.remediation_options = [option]
        summary = (
            f"Generated {len(envelope.remediation_options)} read-only "
            f"remediation option(s) for {telemetry.resource_type.value} in "
            f"{telemetry.rack_id}/{telemetry.tenant_id}."
        )

        envelope = self._advance(
            envelope,
            PipelinePhase.RISK_ANALYSIS,
            summary,
        )
        return {
            "current_phase": envelope.token.current_phase.value,
            "hop_count": envelope.token.hop_count,
        }

    def _build_remediation_prompt(
        self,
        telemetry,
        forecast,
        rca,
    ) -> str:
        rca_summary = rca.root_cause_summary if rca else "No RCA available."
        attributed = rca.attributed_tenant_id if rca else telemetry.tenant_id
        workload = rca.driving_workload_signature if rca else "unknown"

        return (
            f"Resource: {telemetry.resource_type.value}\n"
            f"Rack: {telemetry.rack_id}\n"
            f"Tenant: {telemetry.tenant_id}\n"
            f"Unit: {telemetry.unit}\n"
            f"Current utilization: {telemetry.current_utilization_pct}%\n"
            f"Hard capacity limit: {telemetry.hard_capacity_limit}\n"
            f"Predicted exhaustion: {forecast.predicted_exhaustion_date}\n"
            f"Lead time (weeks): {forecast.lead_time_weeks}\n"
            f"RCA summary: {rca_summary}\n"
            f"Attributed tenant: {attributed}\n"
            f"Driving workload: {workload}\n"
            "\nPropose a single read-only advisory remediation option that extends "
            "lead time without mutating live facility controls (e.g., workload "
            "rebalancing across racks, storage tier archival, quota adjustments, "
            "cooling airflow preview). Include simulated post-action utilization "
            "and projected lead-time extension in weeks. Output the structured "
            "RemediationOption JSON with mutates_live_facility_controls=false."
        )
