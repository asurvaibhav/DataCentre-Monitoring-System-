/**
 * Decoupled REST API client for AO-02.
 *
 * The FastAPI backend speaks snake_case; every response is normalised to the
 * camelCase DTOs in `src/types/ao02.ts` right here. Presentation components
 * therefore never deal with transport details or field-name drift.
 */

import type {
  AuditEntry,
  FacilityOverview,
  IncidentEnvelopeDTO,
  IncidentTokenDTO,
  RCAFinding,
  RemediationOption,
  ResourceType,
  RiskEvaluation,
  TelemetryPoint,
  TelemetryWindow,
} from "@/types/ao02";

export const API_BASE = (
  import.meta.env.VITE_API_BASE ?? "http://localhost:8000"
).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

const num = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const nullableNum = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const pick = (raw: Record<string, unknown>, snake: string, camel: string): unknown =>
  raw[snake] ?? raw[camel];

function normalizeToken(raw: unknown): IncidentTokenDTO {
  const r = (raw ?? {}) as Record<string, unknown>;
  const interval = pick(r, "confidence_interval_days", "confidenceIntervalDays");

  return {
    tokenId: str(pick(r, "token_id", "tokenId")),
    priorityNumber: num(pick(r, "priority_number", "priorityNumber")),
    priorityReason: str(pick(r, "priority_reason", "priorityReason")),
    rackId: str(pick(r, "rack_id", "rackId"), "—"),
    tenantId: str(pick(r, "tenant_id", "tenantId"), "—"),
    resourceType: str(pick(r, "resource_type", "resourceType"), "POWER") as ResourceType,
    currentPhase: str(pick(r, "current_phase", "currentPhase"), "01_RESOURCE_MONITORING"),
    hopCount: num(pick(r, "hop_count", "hopCount")),
    maxAllowedHops: num(pick(r, "max_allowed_hops", "maxAllowedHops"), 8),
    createdAt: str(pick(r, "created_at", "createdAt")),

    utilizationPct: num(pick(r, "utilization_pct", "utilizationPct")),
    safetyMarginPct: num(pick(r, "safety_margin_pct", "safetyMarginPct"), 85),
    hardCapacityLimit: num(pick(r, "hard_capacity_limit", "hardCapacityLimit")),
    unit: str(pick(r, "unit", "unit")),
    windowStart: (pick(r, "window_start", "windowStart") as string) ?? null,
    windowEnd: (pick(r, "window_end", "windowEnd") as string) ?? null,
    rawSeriesSha256: (pick(r, "raw_series_sha256", "rawSeriesSha256") as string) ?? null,

    leadTimeWeeks: num(pick(r, "lead_time_weeks", "leadTimeWeeks")),
    forecastConfidenceScore: num(pick(r, "forecast_confidence_score", "forecastConfidenceScore")),
    confidenceIntervalDays:
      Array.isArray(interval) && interval.length === 2
        ? [num(interval[0]), num(interval[1])]
        : null,
    predictedExhaustionDate:
      (pick(r, "predicted_exhaustion_date", "predictedExhaustionDate") as string) ?? null,
    isTransientSpike: bool(pick(r, "is_transient_spike", "isTransientSpike")),
    regimeChangeDetected: bool(pick(r, "regime_change_detected", "regimeChangeDetected")),
    regimeChangeDescription:
      (pick(r, "regime_change_description", "regimeChangeDescription") as string) ?? null,

    awaitingHumanVerification: bool(
      pick(r, "awaiting_human_verification", "awaitingHumanVerification"),
    ),
    riskScore: nullableNum(pick(r, "risk_score", "riskScore")),
    gateDecision: (pick(r, "gate_decision", "gateDecision") as string) ?? null,
    humanApproved:
      typeof pick(r, "human_approved", "humanApproved") === "boolean"
        ? (pick(r, "human_approved", "humanApproved") as boolean)
        : null,
  };
}

function normalizePoint(raw: unknown): TelemetryPoint {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    timestamp: str(r.timestamp),
    rackId: str(pick(r, "rack_id", "rackId")),
    tenantId: str(pick(r, "tenant_id", "tenantId")),
    resourceType: str(pick(r, "resource_type", "resourceType")) as ResourceType,
    value: num(r.value),
    unit: str(r.unit),
  };
}

function normalizeEnvelope(raw: unknown): IncidentEnvelopeDTO {
  const r = (raw ?? {}) as Record<string, unknown> & {
    telemetry?: Record<string, unknown>;
    forecast?: Record<string, unknown>;
    rca?: Record<string, unknown> | null;
    remediation_options?: Array<Record<string, unknown>>;
    risk_evaluation?: Record<string, unknown> | null;
    audit_trail?: Array<Record<string, unknown>>;
  };

  const t = r.telemetry ?? {};
  const f = r.forecast ?? {};

  const rca: RCAFinding | null = r.rca
    ? {
        rootCauseSummary: str(r.rca.root_cause_summary),
        attributedTenantId: str(r.rca.attributed_tenant_id),
        drivingWorkloadSignature: str(r.rca.driving_workload_signature),
        correlatedSignals: Array.isArray(r.rca.correlated_signals)
          ? (r.rca.correlated_signals as string[])
          : [],
        confidenceScore: num(r.rca.confidence_score),
        investigationNotes: str(r.rca.investigation_notes),
      }
    : null;

  const remediationOptions: RemediationOption[] = (r.remediation_options ?? []).map((o) => ({
    optionId: str(o.option_id),
    title: str(o.title),
    recommendedAction: str(o.recommended_action),
    simulatedPostActionUtilizationPct: num(o.simulated_post_action_utilization_pct),
    projectedLeadTimeExtensionWeeks: num(o.projected_lead_time_extension_weeks),
    mutatesLiveFacilityControls: bool(o.mutates_live_facility_controls),
  }));

  const riskEvaluation: RiskEvaluation | null = r.risk_evaluation
    ? {
        riskScore: num(r.risk_evaluation.risk_score),
        blastRadiusSummary: str(r.risk_evaluation.blast_radius_summary),
        slaImpactAssessment: str(r.risk_evaluation.sla_impact_assessment),
        gateDecision: str(r.risk_evaluation.gate_decision),
        selectedOptionId: str(r.risk_evaluation.selected_option_id),
      }
    : null;

  const auditTrail: AuditEntry[] = (r.audit_trail ?? []).map((entry) => ({
    auditId: str(entry.audit_id),
    timestamp: str(entry.timestamp),
    tokenId: str(entry.token_id),
    phase: str(entry.phase),
    actor: str(entry.actor),
    telemetryHash: str(entry.telemetry_hash),
    decisionSummary: str(entry.decision_summary),
  }));

  return {
    token: normalizeToken(r.token),
    telemetry: {
      windowStart: str(t.window_start),
      windowEnd: str(t.window_end),
      rackId: str(pick(t, "rack_id", "rackId")),
      tenantId: str(pick(t, "tenant_id", "tenantId")),
      resourceType: str(pick(t, "resource_type", "resourceType")) as ResourceType,
      currentUtilizationPct: num(pick(t, "current_utilization_pct", "currentUtilizationPct")),
      safetyMarginPct: num(pick(t, "safety_margin_pct", "safetyMarginPct")),
      hardCapacityLimit: num(pick(t, "hard_capacity_limit", "hardCapacityLimit")),
      unit: str(t.unit),
      rawSeriesSha256: str(pick(t, "raw_series_sha256", "rawSeriesSha256")),
    },
    forecast: {
      predictedExhaustionDate:
        (pick(f, "predicted_exhaustion_date", "predictedExhaustionDate") as string) ?? null,
      leadTimeWeeks: num(pick(f, "lead_time_weeks", "leadTimeWeeks")),
      confidenceIntervalDays: (() => {
        const ci = pick(f, "confidence_interval_days", "confidenceIntervalDays");
        return Array.isArray(ci) && ci.length === 2
          ? ([num(ci[0]), num(ci[1])] as [number, number])
          : ([0, 0] as [number, number]);
      })(),
      forecastConfidenceScore: num(
        pick(f, "forecast_confidence_score", "forecastConfidenceScore"),
      ),
      isTransientSpike: bool(pick(f, "is_transient_spike", "isTransientSpike")),
      regimeChangeDetected: bool(pick(f, "regime_change_detected", "regimeChangeDetected")),
      regimeChangeDescription:
        (pick(f, "regime_change_description", "regimeChangeDescription") as string) ?? null,
    },
    rca,
    remediationOptions,
    riskEvaluation,
    humanApproved:
      typeof pick(r, "human_approved", "humanApproved") === "boolean"
        ? (pick(r, "human_approved", "humanApproved") as boolean)
        : null,
    operatorNotes: (pick(r, "operator_notes", "operatorNotes") as string) ?? null,
    auditTrail,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      0,
      `Cannot reach the AO-02 backend at ${API_BASE}. Is it running?`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let detail = text || response.statusText;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      // keep raw text
    }
    throw new ApiError(response.status, detail || `HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

const OPERATOR_HEADERS = {
  "X-Tenant-Id": "FACILITY",
  "X-Facility-Operator": "true",
};

export const api = {
  uploadTelemetry: async (file: File, storageCapacityTb?: number) =>
    request<{ points: number; series: number; tokens_minted: number; warnings?: string[] }>(`/ingest/upload${storageCapacityTb ? `?storage_capacity_tb=${storageCapacityTb}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: await file.text(),
    }),
  health: () =>
    request<{
      status: string;
      service: string;
      branch: string;
      llm_provider: string;
      queued_tokens: number;
      heap_envelopes: number;
    }>("/health"),

  facilityOverview: async (): Promise<FacilityOverview> => {
    const raw = await request<{
      generated_at?: string;
      racks?: Array<Record<string, unknown>>;
      cooling?: Array<Record<string, unknown>>;
    }>("/facility/overview");

    return {
      generatedAt: str(raw.generated_at),
      racks: (raw.racks ?? []).map((r) => ({
        rackId: str(pick(r, "rack_id", "rackId")),
        status: str(r.status, "HEALTHY") as FacilityOverview["racks"][number]["status"],
        powerLoadKw: num(pick(r, "power_load_kw", "powerLoadKw")),
        maxPowerKw: num(pick(r, "max_power_kw", "maxPowerKw"), 80),
        powerPct: num(pick(r, "power_pct", "powerPct")),
        networkPct: num(pick(r, "network_pct", "networkPct")),
        worstUtilizationPct: num(pick(r, "worst_utilization_pct", "worstUtilizationPct")),
        incidentCount: num(pick(r, "incident_count", "incidentCount")),
        incidents: ((r.incidents as Array<Record<string, unknown>>) ?? []).map((i) => ({
          tokenId: str(pick(i, "token_id", "tokenId")),
          resourceType: str(pick(i, "resource_type", "resourceType")) as ResourceType,
          tenantId: str(pick(i, "tenant_id", "tenantId")),
          phase: str(i.phase),
        })),
      })),
      cooling: (raw.cooling ?? []).map((c) => ({
        unitId: str(pick(c, "unit_id", "unitId")),
        label: str(c.label, str(pick(c, "unit_id", "unitId"))),
        supplyTempCelsius: num(pick(c, "supply_temp_celsius", "supplyTempCelsius")),
        maxTempCelsius: num(pick(c, "max_temp_celsius", "maxTempCelsius"), 27),
        fanSpeedRpm: num(pick(c, "fan_speed_rpm", "fanSpeedRpm")),
        utilizationPct: num(pick(c, "utilization_pct", "utilizationPct")),
        status: str(c.status, "HEALTHY") as FacilityOverview["cooling"][number]["status"],
        incidentCount: num(pick(c, "incident_count", "incidentCount")),
        incidents: ((c.incidents as Array<Record<string, unknown>>) ?? []).map((i) => ({
          tokenId: str(pick(i, "token_id", "tokenId")),
          resourceType: str(pick(i, "resource_type", "resourceType")) as ResourceType,
          tenantId: str(pick(i, "tenant_id", "tenantId")),
          phase: str(i.phase),
        })),
      })),
    };
  },

  queueSnapshot: async (): Promise<IncidentTokenDTO[]> => {
    const raw = await request<{ tokens?: unknown[] }>("/queue/snapshot");
    return (raw.tokens ?? []).map(normalizeToken);
  },

  pendingTokens: async (): Promise<IncidentTokenDTO[]> => {
    const raw = await request<{ tokens?: unknown[] }>("/agents/pending");
    return (raw.tokens ?? []).map(normalizeToken);
  },

  history: async (limit = 25): Promise<IncidentTokenDTO[]> => {
    const raw = await request<unknown[]>(`/agents/history?limit=${limit}`);
    return raw.map(normalizeToken);
  },

  getWindow: async (params: {
    rackId: string;
    tenantId: string;
    resourceType: ResourceType;
    lookbackHours?: number;
  }): Promise<TelemetryWindow> => {
    const query = new URLSearchParams({
      rack_id: params.rackId,
      tenant_id: params.tenantId,
      resource_type: params.resourceType,
      lookback_hours: String(params.lookbackHours ?? 336),
    });
    const raw = await request<{
      count?: number;
      rack_id?: string;
      tenant_id?: string;
      resource_type?: string;
      window_start?: string;
      window_end?: string;
      points?: unknown[];
    }>(`/telemetry/window?${query.toString()}`);

    return {
      count: num(raw.count),
      rackId: str(raw.rack_id, params.rackId),
      tenantId: str(raw.tenant_id, params.tenantId),
      resourceType: str(raw.resource_type, params.resourceType) as ResourceType,
      windowStart: str(raw.window_start),
      windowEnd: str(raw.window_end),
      points: (raw.points ?? []).map(normalizePoint),
    };
  },

  getEnvelope: async (tokenId: string): Promise<IncidentEnvelopeDTO> => {
    const raw = await request<unknown>(`/heap/${encodeURIComponent(tokenId)}`, {
      headers: OPERATOR_HEADERS,
    });
    return normalizeEnvelope(raw);
  },

  runPipeline: (tokenId?: string, signal?: AbortSignal) =>
    request<{
      status: string;
      token_id?: string;
      final_phase?: string;
      awaiting_human_verification?: boolean;
      should_halt?: boolean;
      halt_reason?: string;
      error?: string;
      requeued?: boolean;
      message?: string;
      token?: unknown;
    }>('/agents/run', {
      method: "POST",
      body: JSON.stringify(tokenId ? { token_id: tokenId } : {}),
      signal,
    }),

  decide: (params: {
    tokenId: string;
    decision: "approve" | "reject" | "defer" | "resolve";
    notes?: string;
    operator?: string;
  }) =>
    request<{ status: string; decision: string; token: unknown; envelope: unknown }>(
      "/agents/decision",
      {
        method: "POST",
        body: JSON.stringify({
          token_id: params.tokenId,
          decision: params.decision,
          operator: params.operator ?? "operator@facility",
          notes: params.notes ?? "",
        }),
      },
    ),

  scanResources: (signal?: AbortSignal) =>
    request<{ status: string; tokens_minted: number }>('/ingest/scan', {
      method: 'POST',
      body: '{}',
      signal,
    }),

};

export const normalizers = { normalizeToken, normalizeEnvelope };
