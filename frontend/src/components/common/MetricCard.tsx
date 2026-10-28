// Compact technical stat used inside divided summary strips.

interface MetricCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  tone?: "neutral" | "ok" | "warn" | "critical" | "accent";
}

const TONE_TEXT: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  neutral: "text-brand-ink",
  ok: "text-brand-ok",
  warn: "text-brand-warn",
  critical: "text-brand-critical",
  accent: "text-brand-accent",
};

export function MetricCard({ title, value, subtext, tone = "neutral" }: MetricCardProps) {
  return (
    <div className="stat">
      <p className="stat-label">{title}</p>
      <p className={`stat-value tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      {subtext && <p className="stat-sub">{subtext}</p>}
    </div>
  );
}
