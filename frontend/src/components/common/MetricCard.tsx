// frontend/src/components/common/MetricCard.tsx
// Decoupled metric card using semantic CSS tokens.

interface MetricCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
}

export function MetricCard({ title, value, subtext, trend }: MetricCardProps) {
  return (
    <div className="p-4 rounded-xl border border-brand-surface bg-brand-surface/50">
      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</h3>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-white">{value}</span>
        {subtext && <span className="text-sm text-gray-500">{subtext}</span>}
      </div>
      {trend && (
        <span
          className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
            trend === "up" ? "text-brand-warn" : trend === "down" ? "text-brand-ok" : "text-gray-500"
          }`}
        >
          {trend === "up" ? "▲" : trend === "down" ? "▼" : "—"} {trend}
        </span>
      )}
    </div>
  );
}
