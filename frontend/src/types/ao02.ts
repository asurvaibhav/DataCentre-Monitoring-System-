// frontend/src/types/ao02.ts
// Decoupled TypeScript contract between the React + Vite frontend and the
// FastAPI + LangGraph backend. Backend-agnostic: visual theme / color palette
// swaps require zero changes to this file or the data logic that consumes it.

export type ResourceType =
  | "STORAGE"
  | "POWER"
  | "THERMAL_COOLING"
  | "NETWORK"
  | "VM_COMPUTE"
  | "SOFTWARE_LICENSE";

export type SeverityStatus = "HEALTHY" | "WARNING" | "CRITICAL";

export interface RackSpatialNode {
  rackId: string; // e.g., "R-01" to "R-12"
  gridPosition: { row: number; col: number };
  status: SeverityStatus;
  activeBadge?: ResourceType; // e.g., "NETWORK" on R-02, "STORAGE" on R-04, "COOLING" on R-09
  powerLoadKw: number;
  maxPowerKw: number;
  activeTokenIds: string[];
}

export interface CoolingUnitNode {
  unitId: string; // "CRAC Unit A (North)" | "CRAC Unit B (South)"
  supplyTempCelsius: number; // e.g., 13.2°C or 13.5°C
  fanSpeedRpm: number; // e.g., 1422 RPM
  status: SeverityStatus;
}

export interface QueuedIncidentTokenDTO {
  tokenId: string; // e.g., "T1", "T2", "T3"
  priorityNumber: number;
  rackId: string;
  tenantId: string;
  resourceType: ResourceType;
  currentPhase: string;
  utilizationPct: number;
  leadTimeWeeks: number;
  hopCount: number;
  maxAllowedHops?: number;
}
