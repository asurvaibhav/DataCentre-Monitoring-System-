// Compact metric card with optional semantic tone.

interface MetricCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  tone?: "neutral" | "ok" | "warn" | "critical" | "accent";
}

const TONE_TEXT: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  neutral: "text-white",
  ok: "text-brand-ok",
  warn: "text-brand-warn",
  critical: "text-brand-critical",
  accent: "text-brand-accent",
};

export function MetricCard({ title, value, subtext, tone = "neutral" }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-brand-surface bg-brand-surface/40 p-4">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
        {value}
      </p>
      {subtext && <p className="mt-0.5 text-xs text-slate-500">{subtext}</p>}
    </div>
  );
}
