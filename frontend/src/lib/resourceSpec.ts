// Resource limits mirrored from the backend telemetry spec. Presentation-only:
// used to draw thresholds when a series has no incident token attached yet.

import type { ResourceType } from "@/types/ao02";

export interface ResourceSpec {
  hardLimit: number;
  safetyMarginPct: number;
  unit: string;
}

export const RESOURCE_SPEC: Record<ResourceType, ResourceSpec> = {
  POWER: { hardLimit: 80, safetyMarginPct: 90, unit: "kW" },
  STORAGE: { hardLimit: 100, safetyMarginPct: 85, unit: "%" },
  NETWORK: { hardLimit: 10, safetyMarginPct: 80, unit: "Gbps" },
  VM_COMPUTE: { hardLimit: 500, safetyMarginPct: 80, unit: "VMs" },
  THERMAL_COOLING: { hardLimit: 27, safetyMarginPct: 88, unit: "°C" },
  SOFTWARE_LICENSE: { hardLimit: 1000, safetyMarginPct: 85, unit: "Seats" },
};

export const TENANT_IDS = ["T1", "T2", "T3"] as const;

export const RACK_IDS = Array.from({ length: 12 }, (_, i) => `R-${String(i + 1).padStart(2, "0")}`);

export const CRAC_UNITS = [
  { id: "CRAC-A-North", label: "CRAC A (North)" },
  { id: "CRAC-B-South", label: "CRAC B (South)" },
] as const;

export function resourcesForNode(nodeId: string): ResourceType[] {
  if (nodeId.startsWith("CRAC")) return ["THERMAL_COOLING"];
  return ["POWER", "NETWORK", "STORAGE", "VM_COMPUTE"];
}

export function tenantsForResource(resourceType: ResourceType): string[] {
  if (resourceType === "STORAGE" || resourceType === "VM_COMPUTE") {
    return [...TENANT_IDS];
  }
  return ["FACILITY"];
}
