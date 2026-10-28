// Semantic severity badge. Colours come from Tailwind design tokens only.

import type { SeverityStatus } from "@/types/ao02";

const STATUS_STYLES: Record<
  SeverityStatus,
  { wrapper: string; dot: string }
> = {
  HEALTHY: {
    wrapper: "bg-brand-ok/10 text-brand-ok border-brand-ok/30",
    dot: "bg-brand-ok",
  },
  WARNING: {
    wrapper: "bg-brand-warn/10 text-brand-warn border-brand-warn/30",
    dot: "bg-brand-warn",
  },
  CRITICAL: {
    wrapper: "bg-brand-critical/10 text-brand-critical border-brand-critical/30",
    dot: "bg-brand-critical",
  },
};

interface SeverityBadgeProps {
  status: SeverityStatus;
  label?: string;
  className?: string;
}

export function SeverityBadge({ status, label, className = "" }: SeverityBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.HEALTHY;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.wrapper} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {label ?? status}
    </span>
  );
}
