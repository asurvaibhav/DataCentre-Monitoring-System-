// Semantic severity tag. Colours come from the design tokens only.

import type { SeverityStatus } from "@/types/ao02";

const STATUS_CLASS: Record<SeverityStatus, string> = {
  HEALTHY: "tag-ok",
  WARNING: "tag-warn",
  CRITICAL: "tag-critical",
};

interface SeverityBadgeProps {
  status: SeverityStatus;
  label?: string;
  className?: string;
}

export function SeverityBadge({ status, label, className = "" }: SeverityBadgeProps) {
  const tone = STATUS_CLASS[status] ?? STATUS_CLASS.HEALTHY;
  return (
    <span className={`tag ${tone} ${className}`}>
      <span className="tag-dot" aria-hidden="true" />
      {label ?? status}
    </span>
  );
}
