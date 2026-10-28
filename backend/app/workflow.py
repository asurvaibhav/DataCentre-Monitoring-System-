"""
AO-02 LangGraph workflow — 6-phase multi-agent pipeline with real agents.

Wires ResourceMonitoringAgent, RCAAgent, RemediationAgent, and RiskAgent
around the Priority Token Queue and Shared Context Heap. Compiles with
interrupt_before=["human_verification"] for live human-in-the-loop pause.

Dequeuing is handled outside the graph (in the API endpoint) so the caller
controls which token enters the pipeline.
"""

from __future__ import annotations

from typing import Any, Optional

import asyncio

from langgraph.graph import END, StateGraph

from app.agents.monitoring_agent import ResourceMonitoringAgent
from app.agents.rca_agent import RCAAgent
from app.agents.remediation_agent import RemediationAgent
from app.agents.risk_agent import RiskAgent
from app.core.ao02_state_and_graph import (
    AO02AgentState,
    HeapIncidentEnvelope,
    PipelinePhase,
    SharedContextHeap,
)
from app.core.llm_provider import LLMProvider
from app.services.streaming import broadcast_queue_update, broadcast_token_transition


def _broadcast_transition(
    token_id: str,
    phase: str,
    hop_count: int,
    summary: str,
    awaiting_human: bool = False,
    should_halt: bool = False,
    halt_reason: str | None = None,
) -> None:
    """Fire-and-forget broadcast of a token phase transition to WebSocket clients."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(
                broadcast_token_transition(
                    token_id=token_id,
                    phase=phase,
                    hop_count=hop_count,
                    summary=summary,
                    awaiting_human=awaiting_human,
                    should_halt=should_halt,
                    halt_reason=halt_reason,
                )
            )
        else:
            asyncio.run(
                broadcast_token_transition(
                    token_id=token_id,
                    phase=phase,
                    hop_count=hop_count,
                    summary=summary,
                    awaiting_human=awaiting_human,
                    should_halt=should_halt,
                    halt_reason=halt_reason,
                )
            )
    except Exception:  # noqa: BLE001 - streaming must not break the pipeline
        pass


class AO02Workflow:
    """Builds and compiles the AO-02 LangGraph state machine."""

    def __init__(
        self,
        heap: SharedContextHeap,
        llm: Optional[LLMProvider] = None,
    ) -> None:
        self.heap = heap
        self.llm = llm

        # Instantiate agents.
        self.monitoring = ResourceMonitoringAgent(heap, llm)
        self.rca = RCAAgent(heap, llm)
        self.remediation = RemediationAgent(heap, llm)
        self.risk = RiskAgent(heap, llm)

    # ------------------------------------------------------------------
    # Nodes
    # ------------------------------------------------------------------

    def _monitoring_node(self, state: AO02AgentState) -> AO02AgentState:
        result = asyncio.run(self.monitoring.run(state["active_token_id"]))
        token_id = state["active_token_id"]
        _broadcast_transition(
            token_id=token_id,
            phase=result["current_phase"],
            hop_count=result["hop_count"],
            summary=(
                "Monitoring phase complete"
                + (f"; {result.get('halt_reason', '')}" if result.get("halt_reason") else "")
            ),
            awaiting_human=False,
            should_halt=result.get("should_halt", False),
            halt_reason=result.get("halt_reason"),
        )
        return {
            **state,
            "current_phase": result["current_phase"],
            "hop_count": result["hop_count"],
            "should_halt": result.get("should_halt", False),
            "halt_reason": result.get("halt_reason"),
        }

    def _incident_reporting_node(self, state: AO02AgentState) -> AO02AgentState:
        envelope: HeapIncidentEnvelope = self.heap.get_envelope_for_agent(
            state["active_token_id"]
        )
        envelope.token.increment_hop(PipelinePhase.ROOT_CAUSE_ANALYSIS)
        self.heap.put_envelope(
            envelope,
            actor="IncidentReportingGate",
            summary=(
                f"Dispatched Priority-{envelope.token.priority_number} token to RCA Agent."
            ),
        )
        _broadcast_transition(
            token_id=state["active_token_id"],
            phase=envelope.token.current_phase.value,
            hop_count=envelope.token.hop_count,
            summary=f"Priority-{envelope.token.priority_number} dispatched to RCA.",
        )
        asyncio.run(broadcast_queue_update())
        return {
            **state,
            "current_phase": envelope.token.current_phase.value,
            "hop_count": envelope.token.hop_count,
        }

    def _rca_node(self, state: AO02AgentState) -> AO02AgentState:
        result = asyncio.run(self.rca.run(state["active_token_id"]))
        envelope: HeapIncidentEnvelope = self.heap.get_envelope_for_agent(
            state["active_token_id"]
        )
        _broadcast_transition(
            token_id=state["active_token_id"],
            phase=result["current_phase"],
            hop_count=result["hop_count"],
            summary=(
                f"RCA complete: attributed to {envelope.rca.attributed_tenant_id if envelope.rca else 'unknown'}"
            ),
        )
        asyncio.run(broadcast_queue_update())
        return {
            **state,
            "current_phase": result["current_phase"],
            "hop_count": result["hop_count"],
        }

    def _remediation_node(self, state: AO02AgentState) -> AO02AgentState:
        result = asyncio.run(self.remediation.run(state["active_token_id"]))
        envelope: HeapIncidentEnvelope = self.heap.get_envelope_for_agent(
            state["active_token_id"]
        )
        _broadcast_transition(
            token_id=state["active_token_id"],
            phase=result["current_phase"],
            hop_count=result["hop_count"],
            summary=(
                f"Remediation: {len(envelope.remediation_options)} option(s) generated"
            ),
        )
        asyncio.run(broadcast_queue_update())
        return {
            **state,
            "current_phase": result["current_phase"],
            "hop_count": result["hop_count"],
        }

    def _risk_node(self, state: AO02AgentState) -> AO02AgentState:
        result = asyncio.run(self.risk.run(state["active_token_id"]))
        envelope: HeapIncidentEnvelope = self.heap.get_envelope_for_agent(
            state["active_token_id"]
        )
        risk = envelope.risk_evaluation
        _broadcast_transition(
            token_id=state["active_token_id"],
            phase=result["current_phase"],
            hop_count=result["hop_count"],
            summary=(
                f"Risk score {risk.risk_score:.2f}, gate {risk.gate_decision.value}"
                if risk
                else "Risk evaluation complete"
            ),
            awaiting_human=result.get("awaiting_human_verification", False),
        )
        asyncio.run(broadcast_queue_update())
        return {
            **state,
            "current_phase": result["current_phase"],
            "hop_count": result["hop_count"],
            "awaiting_human_verification": result.get(
                "awaiting_human_verification", False
            ),
        }

    def _human_verification_node(self, state: AO02AgentState) -> AO02AgentState:
        envelope: HeapIncidentEnvelope = self.heap.get_envelope_for_agent(
            state["active_token_id"]
        )
        envelope.token.current_phase = PipelinePhase.RESOLVED
        self.heap.put_envelope(
            envelope,
            actor="HumanOperatorGate",
            summary="Human-in-the-loop verification gate reached.",
        )
        _broadcast_transition(
            token_id=state["active_token_id"],
            phase=PipelinePhase.RESOLVED.value,
            hop_count=envelope.token.hop_count,
            summary="Human-in-the-loop verification gate reached.",
            awaiting_human=False,
        )
        asyncio.run(broadcast_queue_update())
        return {
            **state,
            "current_phase": PipelinePhase.RESOLVED.value,
            "awaiting_human_verification": False,
        }

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------

    def _route_after_monitoring(self, state: AO02AgentState) -> str:
        if state.get("should_halt"):
            return END
        return "incident_reporting"

    # ------------------------------------------------------------------
    # Build
    # ------------------------------------------------------------------

    def build(self):
        workflow = StateGraph(AO02AgentState)

        workflow.add_node("monitoring", self._monitoring_node)
        workflow.add_node("incident_reporting", self._incident_reporting_node)
        workflow.add_node("rca_agent", self._rca_node)
        workflow.add_node("remediation_agent", self._remediation_node)
        workflow.add_node("risk_analysis", self._risk_node)
        workflow.add_node("human_verification", self._human_verification_node)

        workflow.set_entry_point("monitoring")
        workflow.add_conditional_edges(
            "monitoring", self._route_after_monitoring
        )
        workflow.add_edge("incident_reporting", "rca_agent")
        workflow.add_edge("rca_agent", "remediation_agent")
        workflow.add_edge("remediation_agent", "risk_analysis")
        workflow.add_edge("risk_analysis", "human_verification")
        workflow.add_edge("human_verification", END)

        return workflow.compile(
            interrupt_before=["human_verification"],
            checkpointer=None,
        )


def build_ao02_workflow(heap: SharedContextHeap, llm: Optional[LLMProvider] = None):
    """Convenience function to build and compile the AO-02 workflow."""
    return AO02Workflow(heap, llm).build()
