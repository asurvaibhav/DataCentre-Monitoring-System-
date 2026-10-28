// Small presentation helpers. Pure functions only — no data fetching.

export function fmtPct(value: number | null | undefined, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(digits)}%`
    : "—";
}

export function fmtNumber(
  value: number | null | undefined,
  digits = 1,
  unit = "",
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}${unit}`;
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
