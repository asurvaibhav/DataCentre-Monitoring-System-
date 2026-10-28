// frontend/src/services/api.ts
// Decoupled REST API client for AO-02 backend.
// All backend communication lives here so visual reskins need zero changes.

import type { QueuedIncidentTokenDTO, ResourceType } from "@/types/ao02";

const API_BASE = (import.meta as any).env.VITE_API_BASE || "http://localhost:8000";

export interface TelemetryPointDTO {
  timestamp: string;
  rack_id: string;
  tenant_id: string;
  resource_type: ResourceType;
  value: number;
  unit: string;
}

export interface TelemetryWindowDTO {
  count: number;
  rack_id: string;
  tenant_id: string;
  resource_type: string;
  window_start: string;
  window_end: string;
  points: TelemetryPointDTO[];
}

export interface HeapEnvelopeDTO {
  token: {
    token_id: string;
    priority_number: number;
    rack_id: string;
    tenant_id: string;
    resource_type: string;
    current_phase: string;
    hop_count: number;
    created_at: string;
  };
  telemetry: {
    rack_id: string;
    tenant_id: string;
    resource_type: string;
    current_utilization_pct: number;
    lead_time_weeks: number;
    forecast_confidence_score: number;
    is_transient_spike: boolean;
    regime_change_detected: boolean;
  };
  rca: any;
  remediation_options: any[];
  risk_evaluation: any;
  audit_trail: any[];
}

export interface AgentRunResult {
  status: string;
  token_id?: string;
  final_phase?: string;
  hop_count?: number;
  should_halt?: boolean;
  halt_reason?: string;
  awaiting_human_verification?: boolean;
  error?: string;
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}${text ? ": " + text : ""}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{ status: string; service: string; llm_provider: string }>("/health"),

  generateTelemetry: () =>
    request<{ status: string; points: number }>("/telemetry/generate", { method: "POST" }),

  listPoints: (params?: {
    rack_id?: string;
    tenant_id?: string;
    resource_type?: ResourceType;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.rack_id) qs.set("rack_id", params.rack_id);
    if (params?.tenant_id) qs.set("tenant_id", params.tenant_id);
    if (params?.resource_type) qs.set("resource_type", params.resource_type);
    if (params?.limit) qs.set("limit", String(params.limit));
    return request<{ count: number; returned: number; points: TelemetryPointDTO[] }>(
      `/telemetry/points?${qs.toString()}`
    );
  },

  getWindow: (params: {
    rack_id: string;
    tenant_id: string;
    resource_type: ResourceType;
    lookback_hours?: number;
  }) => {
    const qs = new URLSearchParams();
    qs.set("rack_id", params.rack_id);
    qs.set("tenant_id", params.tenant_id);
    qs.set("resource_type", params.resource_type);
    if (params.lookback_hours) qs.set("lookback_hours", String(params.lookback_hours));
    return request<TelemetryWindowDTO>(`/telemetry/window?${qs.toString()}`);
  },

  queueSnapshot: () =>
    request<{ count: number; tokens: QueuedIncidentTokenDTO[] }>("/queue/snapshot"),

  heapView: (tokenId: string, headers: Record<string, string>) =>
    request<HeapEnvelopeDTO>(`/heap/${tokenId}`, { headers }),

  runAgentPipeline: () => request<AgentRunResult>("/agents/run", { method: "POST" }),

  scanResources: () =>
    request<{ status: string; tokens_minted: number; tokens: any[] }>(
      "/ingest/scan",
      { method: "POST" }
    ),
};
