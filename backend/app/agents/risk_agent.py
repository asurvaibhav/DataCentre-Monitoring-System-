"""
Risk Analysis Agent — Phase 5 of the AO-02 pipeline.

Evaluates operational risk, blast radius, SLA impact, and confidence interval
of each proposed remediation option. Tags actions as Low/Medium/High risk and
issues a GateDecision for the human-in-the-loop verification gate.
"""

from __future__ import annotations

from typing import Any

from app.core.ao02_state_and_graph import (
    GateDecision,
    HeapIncidentEnvelope,
    PipelinePhase,
    RiskEvaluation,
)
from app.core.llm_provider import LLMProvider
from app.agents.base import BaseAgent


class RiskAgent(BaseAgent):
    def __init__(
        self,
        heap,
        llm: Optional[LLMProvider] = None,
    ) -> None:
        super().__init__(heap=heap, llm=llm, name="RiskEngine")

    async def run(self, token_id: str) -> dict[str, Any]:
        envelope: HeapIncidentEnvelope = self.heap.get_envelope_for_agent(token_id)
        telemetry = envelope.telemetry
        forecast = envelope.forecast
        options = envelope.remediation_options

        # Deterministic risk scoring baseline (supplements LLM output).
        risk_score = self._compute_risk_score(telemetry, forecast, options)

        # Select the best option (lowest post-action utilization).
        selected_option_id = options[0].option_id if options else "none"

        # Gate decision driven by risk score.
        if risk_score >= 0.7:
            gate_decision = GateDecision.REQUIRE_HUMAN_APPROVAL
        elif risk_score >= 0.4:
            gate_decision = GateDecision.ALLOW_ADVISORY
        else:
            gate_decision = GateDecision.ALLOW_ADVISORY

        evaluation: RiskEvaluation = await self._llm_structured(
            prompt=self._build_risk_prompt(telemetry, forecast, options, risk_score),
            schema=RiskEvaluation,
            system_prompt=(
                "You are a data-center risk analysis engineer. Evaluate the "
                "operational risk, blast radius, and SLA impact of proposed "
                "remediation options. Return ONLY the JSON object."
            ),
        )

        # Overlay deterministic fields where LLM may be vague.
        evaluation.risk_score = risk_score
        evaluation.selected_option_id = selected_option_id
        evaluation.gate_decision = gate_decision

        envelope.risk_evaluation = evaluation
        summary = (
            f"Risk evaluation for {telemetry.resource_type.value} in "
            f"{telemetry.rack_id}/{telemetry.tenant_id}: risk_score "
            f"{risk_score:.2f}, gate_decision {gate_decision.value}."
        )

        envelope = self._advance(
            envelope,
            PipelinePhase.HUMAN_VERIFICATION,
            summary,
        )
        return {
            "current_phase": envelope.token.current_phase.value,
            "hop_count": envelope.token.hop_count,
            "awaiting_human_verification": True,
        }

    def _compute_risk_score(
        self,
        telemetry,
        forecast,
        options,
    ) -> float:
        score = 0.0
        # Utilization proximity to hard limit.
        util = telemetry.current_utilization_pct / 100.0
        score += 0.4 * util
        # Lead time urgency (shorter = higher risk).
        lead_weeks = forecast.lead_time_weeks
        if lead_weeks < 2:
            score += 0.3
        elif lead_weeks < 4:
            score += 0.2
        elif lead_weeks < 8:
            score += 0.1
        # Forecast confidence (lower confidence = higher risk).
        score += 0.2 * (1.0 - forecast.forecast_confidence_score)
        # Regime change increases uncertainty/risk.
        if forecast.regime_change_detected:
            score += 0.1
        return min(1.0, score)

    def _build_risk_prompt(
        self,
        telemetry,
        forecast,
        options,
        risk_score: float,
    ) -> str:
        opt_summary = "no options"
        if options:
            o = options[0]
            opt_summary = (
                f"{o.title}: {o.recommended_action} "
                f"(post-action {o.simulated_post_action_utilization_pct}%, "
                f"+{o.projected_lead_time_extension_weeks} weeks lead time)"
            )

        return (
            f"Resource: {telemetry.resource_type.value}\n"
            f"Rack: {telemetry.rack_id}\n"
            f"Tenant: {telemetry.tenant_id}\n"
            f"Current utilization: {telemetry.current_utilization_pct}%\n"
            f"Lead time (weeks): {forecast.lead_time_weeks}\n"
            f"Forecast confidence: {forecast.forecast_confidence_score}\n"
            f"Regime change: {forecast.regime_change_detected}\n"
            f"Computed risk score: {risk_score:.2f}\n"
            f"Proposed remediation: {opt_summary}\n"
            "\nAssess blast radius, SLA impact, and confidence. Output the "
            "structured RiskEvaluation JSON."
        )
