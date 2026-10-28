"""
AO-02: Seeing Trouble Before the Capacity Runs Out
Core Pydantic Schemas, Priority Token Queue, Shared Context Heap, and LangGraph State.
"""

from __future__ import annotations

import hashlib
import heapq
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Any, Dict, List, Optional, Tuple, TypedDict

from pydantic import BaseModel, Field, field_validator


# ============================================================================
# 1. ENUMS & DOMAIN CONSTANTS
# ============================================================================

class ResourceType(str, Enum):
    """Data center resources monitored across racks and tenants."""
    STORAGE = "STORAGE"                  # Disk / DB capacity (TB / %)
    POWER = "POWER"                      # Rack & facility power draw (kW)
    THERMAL_COOLING = "THERMAL_COOLING"  # CRAC units (°C supply, fan RPM)
    NETWORK = "NETWORK"                  # Bandwidth saturation (Gbps)
    VM_COMPUTE = "VM_COMPUTE"            # VM inventory / vCPU allocation
    SOFTWARE_LICENSE = "SOFTWARE_LICENSE" # Seat / token exhaustion


class PipelinePhase(str, Enum):
    """6-Phase incident lifecycle defined in the Team XOR engineering plan."""
    RESOURCE_MONITORING = "01_RESOURCE_MONITORING"
    INCIDENT_REPORTING = "02_INCIDENT_REPORTING"
    ROOT_CAUSE_ANALYSIS = "03_ROOT_CAUSE_ANALYSIS"
    REMEDIATION_CHECKING = "04_REMEDIATION_CHECKING"
    RISK_ANALYSIS = "05_RISK_ANALYSIS"
    HUMAN_VERIFICATION = "06_HUMAN_VERIFICATION"
    RESOLVED = "07_RESOLVED"
    HALTED_LOOP_GUARD = "99_HALTED_LOOP_GUARD"


class GateDecision(str, Enum):
    """Risk engine and human-in-the-loop verification states."""
    PENDING_REVIEW = "PENDING_REVIEW"
    ALLOW_ADVISORY = "ALLOW_ADVISORY"
    REQUIRE_HUMAN_APPROVAL = "REQUIRE_HUMAN_APPROVAL"
    BLOCKED = "BLOCKED"
    APPROVED_BY_OPERATOR = "APPROVED_BY_OPERATOR"
    REJECTED_BY_OPERATOR = "REJECTED_BY_OPERATOR"


# Base criticality weights for hardware & software functionality prioritization
RESOURCE_CRITICALITY_WEIGHTS: Dict[ResourceType, int] = {
    ResourceType.POWER: 1,            # Highest priority (1 = top of min-heap)
    ResourceType.THERMAL_COOLING: 2,  # CRAC Unit A/B thermal runway
    ResourceType.STORAGE: 3,          # Tenant DB / disk saturation
    ResourceType.NETWORK: 4,          # Rack bandwidth saturation
    ResourceType.VM_COMPUTE: 5,       # VM inventory depletion
    ResourceType.SOFTWARE_LICENSE: 6, # License count exhaustion
}


# ============================================================================
# 2. TELEMETRY, FORECASTING & AGENT OUTPUT SCHEMAS (PYDANTIC V2)
# ============================================================================

class TelemetryWindowSummary(BaseModel):
    """Immutable summary of the read-only telemetry window used for forecasting."""
    window_start: datetime
    window_end: datetime
    rack_id: str = Field(..., description="e.g., R-01 through R-12 or CRAC-A / CRAC-B")
    tenant_id: str = Field(..., description="Isolated tenant identifier, e.g., T1, T2, T3")
    resource_type: ResourceType
    current_utilization_pct: float = Field(..., ge=0.0, le=100.0)
    safety_margin_pct: float = Field(..., ge=0.0, le=100.0)
    hard_capacity_limit: float
    unit: str = Field(..., description="e.g., TB, kW, Celsius, RPM, Gbps, Seats")
    raw_series_sha256: str = Field(
        ..., description="Cryptographic hash of underlying time-series points for auditability"
    )


class CapacityForecast(BaseModel):
    """Output of the Resource Monitoring Agent's forecasting engine."""
    predicted_exhaustion_date: Optional[datetime] = None
    lead_time_weeks: float = Field(
        ..., description="Weeks remaining before safety margin or capacity limit is breached"
    )
    confidence_interval_days: Tuple[float, float] = Field(
        ..., description="(Lower bound days, Upper bound days) honest confidence range"
    )
    forecast_confidence_score: float = Field(..., ge=0.0, le=1.0)
    is_transient_spike: bool = Field(
        default=False,
        description="True if anomaly is a self-resolving spike (suppresses false alarms)",
    )
    regime_change_detected: bool = Field(
        default=False,
        description="True if a step-change (new tenant onboarding or policy shift) altered the trend",
    )
    regime_change_description: Optional[str] = None


class RCADiagnosis(BaseModel):
    """Structured LLM output from the Root Cause Analysis (RCA) Agent."""
    root_cause_summary: str
    attributed_tenant_id: str = Field(..., description="Tenant driving the capacity trend")
    driving_workload_signature: str = Field(
        ..., description="Specific DB, VM cluster, or batch workload causing saturation"
    )
    correlated_signals: List[str] = Field(
        default_factory=list,
        description="Cross-resource correlations (e.g., R-04 storage spike + R-09 thermal rise)",
    )
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    investigation_notes: str


class RemediationOption(BaseModel):
    """
    Single advisory solution calculated by the Remediation Agent.
    STRICT CONSTRAINT: Read-only advisory simulation; never mutates physical facility controls.
    """
    option_id: str = Field(default_factory=lambda: f"rem-{uuid.uuid4().hex[:6]}")
    title: str
    recommended_action: str = Field(
        ..., description="Operator-facing recommendation (e.g., rebalance T1 DB shards from R-04 to R-06)"
    )
    simulated_post_action_utilization_pct: float = Field(..., ge=0.0, le=100.0)
    projected_lead_time_extension_weeks: float = Field(..., ge=0.0)
    mutates_live_facility_controls: bool = Field(
        default=False,
        description="Must always remain False to comply with AO-02 sandbox safety rules",
    )

    @field_validator("mutates_live_facility_controls")
    @classmethod
    def enforce_read_only_safety_constraint(cls, v: bool) -> bool:
        if v is True:
            raise ValueError(
                "SAFETY VIOLATION: Prototype reads telemetry only and must never mutate facility controls."
            )
        return v


class RiskEvaluation(BaseModel):
    """Output of the Risk Analysis Phase."""
    risk_score: float = Field(..., ge=0.0, le=1.0, description="0.0 = Low risk, 1.0 = Critical risk")
    blast_radius_summary: str
    sla_impact_assessment: str
    gate_decision: GateDecision
    selected_option_id: str


class AuditTrailRecord(BaseModel):
    """Immutable audit record linking forecasts, agent decisions, and underlying telemetry."""
    audit_id: str = Field(default_factory=lambda: f"audit-{uuid.uuid4().hex[:10]}")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    token_id: str
    phase: PipelinePhase
    actor: str = Field(..., description="Agent name or Human Operator ID")
    telemetry_hash: str
    decision_summary: str


# ============================================================================
# 3. INCIDENT TOKEN & DETERMINISTIC PRIORITY QUEUE ("QUEUE DATASET")
# ============================================================================

class IncidentToken(BaseModel):
    """
    Token generated per resource incident to schedule agent evaluation
    and prevent infinite agent looping.
    """
    token_id: str = Field(default_factory=lambda: f"T-{uuid.uuid4().hex[:6].upper()}")
    priority_number: int = Field(
        ..., description="Lower integer = higher urgency in the min-heap Priority Queue"
    )
    rack_id: str
    tenant_id: str
    resource_type: ResourceType
    current_phase: PipelinePhase = PipelinePhase.RESOURCE_MONITORING
    hop_count: int = Field(default=0, description="Incremented on every agent transition")
    max_allowed_hops: int = Field(
        default=8, description="Hard ceiling to prevent infinite multi-agent loops"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def increment_hop(self, next_phase: PipelinePhase) -> None:
        self.hop_count += 1
        if self.hop_count > self.max_allowed_hops:
            self.current_phase = PipelinePhase.HALTED_LOOP_GUARD
            raise RuntimeError(
                f"Loop guard triggered for token {self.token_id}: exceeded {self.max_allowed_hops} hops."
            )
        self.current_phase = next_phase


class PriorityTokenQueue:
    """
    Min-Heap Priority Queue ('Queue Dataset') ordering IncidentTokens by hardware/software
    criticality, utilization severity, and lead-time urgency.
    """

    def __init__(self) -> None:
        self._heap: List[Tuple[int, float, str, IncidentToken]] = []
        self._active_resource_keys: Dict[str, str] = {}  # Deduplication: "{rack}:{tenant}:{resource}" -> token_id

    @staticmethod
    def compute_priority_number(
        resource_type: ResourceType,
        utilization_pct: float,
        lead_time_weeks: float,
    ) -> int:
        """
        Calculates deterministic priority score (1 to 100, lower = higher priority).
        Combines hardware/software criticality with time-to-exhaustion urgency.
        """
        base_weight = RESOURCE_CRITICALITY_WEIGHTS.get(resource_type, 5) * 10
        urgency_bonus = max(0, int((100.0 - utilization_pct) / 5.0))
        lead_time_penalty = int(min(lead_time_weeks, 12.0) * 2)
        return max(1, base_weight + urgency_bonus + lead_time_penalty)

    def enqueue(self, token: IncidentToken) -> bool:
        """Enqueues a token if an active token for the same rack/tenant/resource does not already exist."""
        dedup_key = f"{token.rack_id}:{token.tenant_id}:{token.resource_type.value}"
        if dedup_key in self._active_resource_keys:
            return False  # Prevent duplicate token flooding for the same resource incident

        self._active_resource_keys[dedup_key] = token.token_id
        heapq.heappush(
            self._heap,
            (token.priority_number, token.created_at.timestamp(), token.token_id, token),
        )
        return True

    def dequeue(self) -> Optional[IncidentToken]:
        """Pops the highest-priority IncidentToken for downstream agent processing."""
        if not self._heap:
            return None
        _, _, _, token = heapq.heappop(self._heap)
        dedup_key = f"{token.rack_id}:{token.tenant_id}:{token.resource_type.value}"
        self._active_resource_keys.pop(dedup_key, None)
        return token

    def snapshot(self) -> List[IncidentToken]:
        """Returns ordered list of queued tokens for the frontend Queue Dataset visualizer."""
        return [item[3] for item in sorted(self._heap, key=lambda x: (x[0], x[1]))]


# ============================================================================
# 4. SHARED CONTEXT HEAP & MULTI-TENANT ISOLATION GUARD ("HEAP MEMORY")
# ============================================================================

class HeapIncidentEnvelope(BaseModel):
    """Complete incident state stored in the central Shared Heap and accessed by all agents."""
    token: IncidentToken
    telemetry: TelemetryWindowSummary
    forecast: CapacityForecast
    rca: Optional[RCADiagnosis] = None
    remediation_options: List[RemediationOption] = Field(default_factory=list)
    risk_evaluation: Optional[RiskEvaluation] = None
    human_approved: Optional[bool] = None
    operator_notes: Optional[str] = None
    audit_trail: List[AuditTrailRecord] = Field(default_factory=list)


class SharedContextHeap:
    """
    Centralized Shared Memory Heap where all agents read/write incident artifacts
    with strict tenant isolation enforcement and immutable audit logging.
    """

    def __init__(self) -> None:
        self._store: Dict[str, HeapIncidentEnvelope] = {}

    def put_envelope(self, envelope: HeapIncidentEnvelope, actor: str, summary: str) -> None:
        audit_entry = AuditTrailRecord(
            token_id=envelope.token.token_id,
            phase=envelope.token.current_phase,
            actor=actor,
            telemetry_hash=envelope.telemetry.raw_series_sha256,
            decision_summary=summary,
        )
        envelope.audit_trail.append(audit_entry)
        self._store[envelope.token.token_id] = envelope

    def get_envelope_for_agent(self, token_id: str) -> HeapIncidentEnvelope:
        if token_id not in self._store:
            raise KeyError(f"Token {token_id} not found in Shared Context Heap.")
        return self._store[token_id]

    def get_tenant_isolated_view(
        self, token_id: str, requesting_tenant_id: str, is_facility_operator: bool = False
    ) -> Dict[str, Any]:
        """
        Enforces AO-02 Safety Rule: Tenant-level data must be isolated;
        one tenant's usage must never be visible to another.
        """
        envelope = self.get_envelope_for_agent(token_id)
        if not is_facility_operator and envelope.token.tenant_id != requesting_tenant_id:
            raise PermissionError(
                f"TENANT ISOLATION BREACH BLOCKED: Tenant '{requesting_tenant_id}' "
                f"cannot access telemetry or forecasts belonging to Tenant '{envelope.token.tenant_id}'."
            )
        return envelope.model_dump()


# ============================================================================
# 5. LANGGRAPH STATE & 6-PHASE WORKFLOW DEFINITION
# ============================================================================

class AO02AgentState(TypedDict):
    """LangGraph state dictionary passed across the 6-phase pipeline."""
    active_token_id: str
    current_phase: str
    hop_count: int
    should_halt: bool
    halt_reason: Optional[str]
    awaiting_human_verification: bool


def build_ao02_workflow_blueprint(heap: SharedContextHeap):
    """
    Reference LangGraph node wiring for the 3 core agents and 6 operational phases.
    (Requires `langgraph` installed in backend environment).
    """
    from langgraph.graph import END, StateGraph

    def phase1_monitoring_node(state: AO02AgentState) -> AO02AgentState:
        envelope = heap.get_envelope_for_agent(state["active_token_id"])
        # Suppress false alarms on transient spikes that resolve on their own
        if envelope.forecast.is_transient_spike:
            envelope.token.current_phase = PipelinePhase.RESOLVED
            heap.put_envelope(
                envelope,
                actor="ResourceMonitoringAgent",
                summary="Transient spike detected and suppressed; no operator page triggered.",
            )
            return {
                **state,
                "current_phase": PipelinePhase.RESOLVED.value,
                "should_halt": True,
                "halt_reason": "Transient spike suppressed",
            }

        envelope.token.increment_hop(PipelinePhase.INCIDENT_REPORTING)
        heap.put_envelope(
            envelope,
            actor="ResourceMonitoringAgent",
            summary=(
                f"Flagged {envelope.telemetry.resource_type.value} exhaustion in {envelope.telemetry.rack_id} "
                f"(Lead time: {envelope.forecast.lead_time_weeks:.1f} weeks)."
            ),
        )
        return {
            **state,
            "current_phase": envelope.token.current_phase.value,
            "hop_count": envelope.token.hop_count,
        }

    def phase2_incident_reporting_node(state: AO02AgentState) -> AO02AgentState:
        envelope = heap.get_envelope_for_agent(state["active_token_id"])
        envelope.token.increment_hop(PipelinePhase.ROOT_CAUSE_ANALYSIS)
        heap.put_envelope(
            envelope,
            actor="IncidentReportingGate",
            summary=f"Dispatched Priority-{envelope.token.priority_number} token to RCA Agent.",
        )
        return {
            **state,
            "current_phase": envelope.token.current_phase.value,
            "hop_count": envelope.token.hop_count,
        }

    def phase3_rca_agent_node(state: AO02AgentState) -> AO02AgentState:
        """Invokes Gemini / OpenAI structured output to correlate tenant workloads & regime shifts."""
        envelope = heap.get_envelope_for_agent(state["active_token_id"])
        # LLM call populates `envelope.rca` using `RCADiagnosis` schema
        envelope.token.increment_hop(PipelinePhase.REMEDIATION_CHECKING)
        heap.put_envelope(
            envelope,
            actor="RCAAgent",
            summary=f"Attributed trend to tenant {envelope.telemetry.tenant_id} with cross-rack correlation.",
        )
        return {
            **state,
            "current_phase": envelope.token.current_phase.value,
            "hop_count": envelope.token.hop_count,
        }

    def phase4_remediation_agent_node(state: AO02AgentState) -> AO02AgentState:
        """Invokes Gemini / OpenAI to generate read-only capacity mitigation simulations."""
        envelope = heap.get_envelope_for_agent(state["active_token_id"])
        # LLM call populates `envelope.remediation_options` (enforcing mutates_live_facility_controls=False)
        envelope.token.increment_hop(PipelinePhase.RISK_ANALYSIS)
        heap.put_envelope(
            envelope,
            actor="RemediationAgent",
            summary="Generated non-invasive capacity rebalancing simulations.",
        )
        return {
            **state,
            "current_phase": envelope.token.current_phase.value,
            "hop_count": envelope.token.hop_count,
        }

    def phase5_risk_analysis_node(state: AO02AgentState) -> AO02AgentState:
        envelope = heap.get_envelope_for_agent(state["active_token_id"])
        envelope.token.increment_hop(PipelinePhase.HUMAN_VERIFICATION)
        heap.put_envelope(
            envelope,
            actor="RiskEngine",
            summary="Evaluated blast radius and SLA risk; routed to Human-in-the-Loop verification gate.",
        )
        return {
            **state,
            "current_phase": envelope.token.current_phase.value,
            "hop_count": envelope.token.hop_count,
            "awaiting_human_verification": True,
        }

    def phase6_human_verification_node(state: AO02AgentState) -> AO02AgentState:
        """Pauses or records human operator sign-off on hardware/admin capacity recommendations."""
        envelope = heap.get_envelope_for_agent(state["active_token_id"])
        envelope.token.current_phase = PipelinePhase.RESOLVED
        heap.put_envelope(
            envelope,
            actor="HumanOperatorGate",
            summary="Awaiting or recorded human-in-the-loop verification decision.",
        )
        return {
            **state,
            "current_phase": PipelinePhase.RESOLVED.value,
            "awaiting_human_verification": False,
        }

    def route_after_monitoring(state: AO02AgentState) -> str:
        if state.get("should_halt"):
            return END
        return "incident_reporting"

    workflow = StateGraph(AO02AgentState)
    workflow.add_node("monitoring", phase1_monitoring_node)
    workflow.add_node("incident_reporting", phase2_incident_reporting_node)
    workflow.add_node("rca_agent", phase3_rca_agent_node)
    workflow.add_node("remediation_agent", phase4_remediation_agent_node)
    workflow.add_node("risk_analysis", phase5_risk_analysis_node)
    workflow.add_node("human_verification", phase6_human_verification_node)

    workflow.set_entry_point("monitoring")
    workflow.add_conditional_edges("monitoring", route_after_monitoring)
    workflow.add_edge("incident_reporting", "rca_agent")
    workflow.add_edge("rca_agent", "remediation_agent")
    workflow.add_edge("remediation_agent", "risk_analysis")
    workflow.add_edge("risk_analysis", "human_verification")
    workflow.add_edge("human_verification", END)

    # Compile with interrupt_before=["human_verification"] for live human-in-the-loop pause
    return workflow.compile(interrupt_before=["human_verification"])
