// frontend/src/components/common/SeverityBadge.tsx
// Decoupled severity badge using semantic CSS tokens.

import type { SeverityStatus } from "@/types/ao02";

interface SeverityBadgeProps {
  status: SeverityStatus;
  label?: string;
}

const STATUS_CONFIG: Record<SeverityStatus, { bg: string; dot: string; text: string }> = {
  HEALTHY: { bg: "bg-brand-ok/10", dot: "bg-brand-ok", text: "text-brand-ok" },
  WARNING: { bg: "bg-brand-warn/10", dot: "bg-brand-warn", text: "text-brand-warn" },
  CRITICAL: { bg: "bg-brand-critical/10", dot: "bg-brand-critical", text: "text-brand-critical" },
};

export function SeverityBadge({ status, label }: SeverityBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} border border-brand-surface/50`}
    >
      <span className="w-1.5 h-1.5 rounded-full {config.dot}" />
      {label || status}
    </span>
  );
}
