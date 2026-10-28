// frontend/src/types/ao02.ts
// Decoupled TypeScript contract between the React + Vite frontend and the
// FastAPI + LangGraph backend. All backend field names are normalised in
// src/services/api.ts, so components only ever see camelCase DTOs.

export type ResourceType =
  | "STORAGE"
  | "POWER"
  | "THERMAL_COOLING"
  | "NETWORK"
  | "VM_COMPUTE"
  | "SOFTWARE_LICENSE";

export type SeverityStatus = "HEALTHY" | "WARNING" | "CRITICAL";

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  STORAGE: "Storage",
  POWER: "Power",
  THERMAL_COOLING: "Thermal / Cooling",
  NETWORK: "Network",
  VM_COMPUTE: "VM Compute",
  SOFTWARE_LICENSE: "Software License",
};

export const PHASE_LABELS: Record<string, string> = {
  "01_RESOURCE_MONITORING": "Monitoring",
  "02_INCIDENT_REPORTING": "Incident Reporting",
  "03_ROOT_CAUSE_ANALYSIS": "Root Cause Analysis",
  "04_REMEDIATION_CHECKING": "Remediation",
  "05_RISK_ANALYSIS": "Risk Analysis",
  "06_HUMAN_VERIFICATION": "Human Verification",
  "07_RESOLVED": "Resolved",
  "08_REJECTED_BY_OPERATOR": "Rejected",
  "99_HALTED_LOOP_GUARD": "Halted (Loop Guard)",
};

export const PHASE_ORDER = [
  "01_RESOURCE_MONITORING",
  "02_INCIDENT_REPORTING",
  "03_ROOT_CAUSE_ANALYSIS",
  "04_REMEDIATION_CHECKING",
  "05_RISK_ANALYSIS",
  "06_HUMAN_VERIFICATION",
  "07_RESOLVED",
];

/** A queued or processed IncidentToken, enriched with its heap telemetry. */
export interface IncidentTokenDTO {
  tokenId: string;
  priorityNumber: number;
  rackId: string;
  tenantId: string;
  resourceType: ResourceType;
  currentPhase: string;
  hopCount: number;
  maxAllowedHops: number;
  createdAt: string;

  // Telemetry window summary (from the Shared Context Heap)
  utilizationPct: number;
  safetyMarginPct: number;
  hardCapacityLimit: number;
  unit: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  rawSeriesSha256?: string | null;

  // Forecast
  leadTimeWeeks: number;
  forecastConfidenceScore: number;
  confidenceIntervalDays: [number, number] | null;
  predictedExhaustionDate: string | null;
  isTransientSpike: boolean;
  regimeChangeDetected: boolean;
  regimeChangeDescription: string | null;

  // Gate / human decision
  awaitingHumanVerification: boolean;
  riskScore: number | null;
  gateDecision: string | null;
  humanApproved: boolean | null;
}

export interface RCAFinding {
  rootCauseSummary: string;
  attributedTenantId: string;
  drivingWorkloadSignature: string;
  correlatedSignals: string[];
  confidenceScore: number;
  investigationNotes: string;
}

export interface RemediationOption {
  optionId: string;
  title: string;
  recommendedAction: string;
  simulatedPostActionUtilizationPct: number;
  projectedLeadTimeExtensionWeeks: number;
  mutatesLiveFacilityControls: boolean;
}

export interface RiskEvaluation {
  riskScore: number;
  blastRadiusSummary: string;
  slaImpactAssessment: string;
  gateDecision: string;
  selectedOptionId: string;
}

export interface AuditEntry {
  auditId: string;
  timestamp: string;
  tokenId: string;
  phase: string;
  actor: string;
  telemetryHash: string;
  decisionSummary: string;
}

export interface IncidentEnvelopeDTO {
  token: IncidentTokenDTO;
  telemetry: {
    windowStart: string;
    windowEnd: string;
    rackId: string;
    tenantId: string;
    resourceType: ResourceType;
    currentUtilizationPct: number;
    safetyMarginPct: number;
    hardCapacityLimit: number;
    unit: string;
    rawSeriesSha256: string;
  };
  forecast: {
    predictedExhaustionDate: string | null;
    leadTimeWeeks: number;
    confidenceIntervalDays: [number, number];
    forecastConfidenceScore: number;
    isTransientSpike: boolean;
    regimeChangeDetected: boolean;
    regimeChangeDescription: string | null;
  };
  rca: RCAFinding | null;
  remediationOptions: RemediationOption[];
  riskEvaluation: RiskEvaluation | null;
  humanApproved: boolean | null;
  operatorNotes: string | null;
  auditTrail: AuditEntry[];
}

export interface TelemetryPoint {
  timestamp: string;
  rackId: string;
  tenantId: string;
  resourceType: ResourceType;
  value: number;
  unit: string;
}

export interface TelemetryWindow {
  count: number;
  rackId: string;
  tenantId: string;
  resourceType: ResourceType;
  windowStart: string;
  windowEnd: string;
  points: TelemetryPoint[];
}

export interface RackIncidentRef {
  tokenId: string;
  resourceType: ResourceType;
  tenantId: string;
  phase: string;
}

export interface RackSpatialNode {
  rackId: string;
  status: SeverityStatus;
  powerLoadKw: number;
  maxPowerKw: number;
  powerPct: number;
  networkPct: number;
  worstUtilizationPct: number;
  incidentCount: number;
  incidents: RackIncidentRef[];
}

export interface CoolingUnitNode {
  unitId: string;
  label: string;
  supplyTempCelsius: number;
  maxTempCelsius: number;
  fanSpeedRpm: number;
  utilizationPct: number;
  status: SeverityStatus;
  incidentCount: number;
  incidents: RackIncidentRef[];
}

export interface FacilityOverview {
  generatedAt: string;
  racks: RackSpatialNode[];
  cooling: CoolingUnitNode[];
}
