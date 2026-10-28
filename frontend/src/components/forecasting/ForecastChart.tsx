// frontend/src/components/forecasting/ForecastChart.tsx
// SVG-based time-series forecast chart with confidence cone.
// Decoupled: consumes forecast window data from store; colors from Tailwind tokens.

import { useEffect } from "react";
import { useTelemetry } from "@/hooks/useTelemetry";

interface ForecastChartProps {
  rackId: string;
  tenantId: string;
  resourceType: string;
}

interface TelemetryPoint {
  timestamp: string;
  value: number;
  unit: string;
}

export function ForecastChart({ rackId, tenantId, resourceType }: ForecastChartProps) {
  const { window, loading, error, fetchWindow } = useTelemetry();

  useEffect(() => {
    if (!window) {
      fetchWindow({ rack_id: rackId, tenant_id: tenantId, resource_type: resourceType as any });
    }
  }, [rackId, tenantId, resourceType, window, fetchWindow]);

  if (loading) {
    return (
      <div className="h-80 flex flex-col items-center justify-center rounded-xl border border-brand-surface bg-brand-surface/30">
        <div className="animate-pulse h-4 w-24 rounded bg-gray-700" />
        <p className="mt-2 text-xs text-gray-500">Loading forecast...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-80 flex flex-col items-center justify-center rounded-xl border border-brand-surface bg-brand-surface/30">
        <p className="text-xs text-gray-500">{error}</p>
        <button
          onClick={() => fetchWindow({ rack_id: rackId, tenant_id: tenantId, resource_type: resourceType as any })}
          className="mt-2 text-xs text-brand-accent underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const points: TelemetryPoint[] = window?.points || [];
  if (points.length === 0) {
    return (
      <div className="h-80 flex flex-col items-center justify-center rounded-xl border border-brand-surface bg-brand-surface/30">
        <p className="text-xs text-gray-500">No telemetry data for {rackId}/{tenantId}</p>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const width = 560;
  const height = 280;
  const padding = { top: 30, right: 40, bottom: 40, left: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const xScale = (i: number) => padding.left + (i / Math.max(points.length - 1, 1)) * plotW;
  const yScale = (val: number) => padding.top + plotH - ((val - minVal) / range) * plotH;

  // Line path
  const line = points
    .map((p: TelemetryPoint, i: number) => `${xScale(i)},${yScale(p.value)}`)
    .join(" ");

  // Confidence band
  const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length;
  const std =
    Math.sqrt(
      values.reduce((a: number, b: number) => a + Math.pow(b - mean, 2), 0) / values.length
    ) || 0;
  const bandUpper = points
    .map((_p: TelemetryPoint, i: number) => `${xScale(i)},${yScale(Math.min(mean + std, maxVal))}`)
    .join(" ");
  const bandLower = points
    .map((_p: TelemetryPoint, i: number) => `${xScale(i)},${yScale(Math.max(mean - std, minVal))}`)
    .join(" ");

  const latest = points[points.length - 1];
  const latestX = xScale(points.length - 1);
  const latestY = yScale(latest.value);

  return (
    <div className="h-80 rounded-xl border border-brand-surface bg-brand-surface/50">
      <div className="p-4 border-b border-brand-surface">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">{resourceType}</h3>
          <span className="text-xs text-gray-400">{rackId} • {tenantId}</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-lg font-bold text-white">{latest.value.toFixed(1)}</span>
          <span className="text-xs text-gray-400">{points[0].unit}</span>
        </div>
      </div>
      <div className="p-4">
        <svg width={width} height={height} className="block">
          {/* Confidence band */}
          <path
            d={`M${bandUpper} L${bandLower.split(" ").reverse().join(" ")}`}
            fill="rgba(96, 165, 250, 0.15)"
            stroke="none"
          />
          {/* Area under line */}
          <path
            d={`M${padding.left},${padding.top + plotH} L${line} L${xScale(points.length - 1)},${padding.top + plotH} Z`}
            fill="rgba(56, 189, 248, 0.1)"
            stroke="none"
          />
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padding.top + plotH - frac * plotH;
            return (
              <line
                key={frac}
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#334155"
                strokeWidth={1}
                strokeDasharray="2,2"
              />
            );
          })}
          {/* Forecast line */}
          <path d={line} stroke="#38bdf8" strokeWidth={2} fill="none" />
          {/* Latest point */}
          <circle cx={latestX} cy={latestY} r={4} fill="#38bdf8" stroke="white" strokeWidth={2} />
          {/* Latest marker line */}
          <line
            x1={latestX}
            x2={latestX}
            y1={padding.top}
            y2={padding.top + plotH}
            stroke="#38bdf8"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
          {/* Axes */}
          <line x1={padding.left} x2={width - padding.right} y1={padding.top + plotH} y2={padding.top + plotH} stroke="#475569" strokeWidth={1} />
          <line x1={padding.left} x2={padding.left} y1={padding.top} y2={padding.top + plotH} stroke="#475569" strokeWidth={1} />
          {/* Labels */}
          <text x={padding.left} y={padding.top + plotH + 25} fill="#64748b" fontSize={10} textAnchor="start">
            {points[0].timestamp.slice(0, 10)}
          </text>
          <text x={width - padding.right} y={padding.top + plotH + 25} fill="#64748b" fontSize={10} textAnchor="end">
            {points[points.length - 1].timestamp.slice(0, 10)}
          </text>
          <text x={padding.left - 8} y={padding.top + 5} fill="#64748b" fontSize={10} textAnchor="end">
            {maxVal.toFixed(0)}
          </text>
          <text x={padding.left - 8} y={padding.top + plotH + 5} fill="#64748b" fontSize={10} textAnchor="end">
            {minVal.toFixed(0)}
          </text>
        </svg>
      </div>
      <div className="px-4 pt-2 flex items-center gap-2 text-xs text-gray-400">
        <span className="w-3 h-3 rounded-full bg-brand-accent" />
        <span>Utilization</span>
        <span className="w-3 h-3 rounded-full bg-blue-400/20" />
        <span>Confidence band</span>
      </div>
    </div>
  );
}
