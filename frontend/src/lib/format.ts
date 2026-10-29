// Small presentation helpers. Pure functions only — no data fetching.

export function fmtPct(value: number | null | undefined, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(digits)}%`
    : "—";
}

export function fmtWeeks(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 999) return "stable";
  if (value < 1) return "< 1 week";
  return `${value.toFixed(1)} weeks`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

export function severityFromUtilization(pct: number): "HEALTHY" | "WARNING" | "CRITICAL" {
  if (pct >= 95) return "CRITICAL";
  if (pct >= 85) return "WARNING";
  return "HEALTHY";
}

export function phaseLabel(phase: string): string {
  return phase
    .replace(/^\d\d_/, "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function truncateHash(hash: string | null | undefined, head = 10, tail = 6): string {
  if (!hash) return "—";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

const ACTOR_LABELS: Record<string, string> = {
  ResourceMonitoringAgent: "Resource Monitoring Agent",
  IncidentReportingGate: "Incident Reporting",
  RCAAgent: "Root Cause Analysis Agent",
  RemediationAgent: "Remediation Agent",
  RiskAgent: "Risk Assessment Agent",
  RiskEngine: "Risk Assessment Agent",
  HumanOperatorGate: "Human Review",
};

export function actorLabel(actor: string): string {
  return ACTOR_LABELS[actor] ?? actor.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function auditSummaryLabel(summary: string): string {
  const labels: Record<string, string> = {
    THERMAL_COOLING: "thermal / cooling", VM_COMPUTE: "VM compute",
    SOFTWARE_LICENSE: "software licenses", REQUIRE_HUMAN_APPROVAL: "human approval required",
    ALLOW_ADVISORY: "advisory allowed", PENDING_REVIEW: "pending review",
    gate_decision: "review decision",
  };
  return summary.replace(/\b(?:THERMAL_COOLING|VM_COMPUTE|SOFTWARE_LICENSE|REQUIRE_HUMAN_APPROVAL|ALLOW_ADVISORY|PENDING_REVIEW|gate_decision)\b/g,
    value => labels[value]);
}
