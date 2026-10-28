// SVG time-series forecast: history, least-squares projection, confidence
// cone, and the resource safety-margin threshold. No chart library required.

import { useMemo, useState } from "react";
import type { TelemetryWindow } from "@/types/ao02";
import { fmtDate, fmtPct } from "@/lib/format";

interface ForecastChartProps {
  window: TelemetryWindow | null;
  loading: boolean;
  error: string | null;
  safetyMarginPct: number;
  hardCapacityLimit: number;
  unit: string;
  leadTimeWeeks: number;
  confidenceScore: number;
  regimeChangeDescription: string | null;
  onRetry: () => void;
}

const WIDTH = 760;
const HEIGHT = 320;
const PADDING = { top: 24, right: 24, bottom: 34, left: 52 };
const PROJECTION_DAYS = 14;

interface Sample {
  t: number;
  value: number;
}

function linearFit(samples: Sample[]): { slope: number; intercept: number; residualStd: number } {
  const n = samples.length;
  if (n < 2) return { slope: 0, intercept: samples[0]?.value ?? 0, residualStd: 0 };

  const meanX = samples.reduce((sum, s) => sum + s.t, 0) / n;
  const meanY = samples.reduce((sum, s) => sum + s.value, 0) / n;
  let num = 0;
  let den = 0;
  for (const s of samples) {
    num += (s.t - meanX) * (s.value - meanY);
    den += (s.t - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const residuals = samples.map((s) => s.value - (slope * s.t + intercept));
  const residualStd = Math.sqrt(
    residuals.reduce((sum, r) => sum + r * r, 0) / Math.max(n - 2, 1),
  );

  return { slope, intercept, residualStd };
}

export function ForecastChart({
  window,
  loading,
  error,
  safetyMarginPct,
  hardCapacityLimit,
  unit,
  leadTimeWeeks,
  confidenceScore,
  regimeChangeDescription,
  onRetry,
}: ForecastChartProps) {
  const [hoverX, setHoverX] = useState<number | null>(null);

  const model = useMemo(() => {
    const points = window?.points ?? [];
    if (points.length < 2) return null;

    const samples: Sample[] = points.map((point) => ({
      t: new Date(point.timestamp).getTime(),
      value: point.value,
    }));

    const first = samples[0].t;
    const last = samples[samples.length - 1].t;
    const span = Math.max(last - first, 1);
    const step = span / Math.max(samples.length - 1, 1);
    const projectionSteps = Math.max(
      8,
      Math.round((PROJECTION_DAYS * 24 * 60 * 60 * 1000) / step),
    );

    const horizonT = last + projectionSteps * step;
    const normalized = samples.map((s) => ({ t: (s.t - first) / span, value: s.value }));
    const fit = linearFit(normalized);

    const history = samples.map((s) => ({ t: s.t, value: s.value }));
    const projected = Array.from({ length: projectionSteps + 1 }, (_, i) => {
      const ratio = 1 + (i / projectionSteps) * (PROJECTION_DAYS * 86_400_000) / span;
      return {
        t: last + (i / projectionSteps) * (horizonT - last),
        value: fit.slope * ratio + fit.intercept,
        spread:
          fit.residualStd *
          1.96 *
          Math.sqrt(1 + (i / projectionSteps) * 1.5),
      };
    });

    const threshold = hardCapacityLimit > 0 ? (hardCapacityLimit * safetyMarginPct) / 100 : null;
    const allValues = [
      ...history.map((h) => h.value),
      ...projected.map((p) => p.value + p.spread),
      ...(threshold !== null ? [threshold] : []),
    ];

    const yMin = Math.max(0, Math.min(...allValues) * 0.92);
    const yMax = Math.max(...allValues) * 1.04 || 1;

    return { history, projected, threshold, first, horizonT, yMin, yMax, last };
  }, [window, hardCapacityLimit, safetyMarginPct]);

  if (loading) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-brand-surface bg-brand-surface/20">
        <div className="text-center">
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-brand-accent border-t-transparent" />
          <p className="mt-3 text-xs text-slate-500">Loading telemetry window…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[360px] flex-col items-center justify-center rounded-xl border border-brand-surface bg-brand-surface/20">
        <p className="max-w-sm text-center text-xs text-slate-400">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-brand-accent/40 px-3 py-1.5 text-xs text-brand-accent hover:bg-brand-accent/10"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!window || window.count === 0 || !model) {
    return (
      <div className="flex h-[360px] flex-col items-center justify-center rounded-xl border border-brand-surface bg-brand-surface/20">
        <p className="text-sm text-slate-400">No telemetry for this series.</p>
        <p className="mt-1 text-xs text-slate-500">
          Try another rack, tenant, or resource combination.
        </p>
      </div>
    );
  }

  const plotW = WIDTH - PADDING.left - PADDING.right;
  const plotH = HEIGHT - PADDING.top - PADDING.bottom;
  const { history, projected, threshold, first, horizonT, yMin, yMax } = model;

  const x = (t: number) => PADDING.left + ((t - first) / Math.max(horizonT - first, 1)) * plotW;
  const y = (value: number) =>
    PADDING.top + plotH - ((value - yMin) / Math.max(yMax - yMin, 1e-6)) * plotH;

  const historyPath = history
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.t).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(" ");

  const projectionPath = [
    `M${x(history[history.length - 1].t).toFixed(1)},${y(history[history.length - 1].value).toFixed(1)}`,
    ...projected.map((point) => `L${x(point.t).toFixed(1)},${y(point.value).toFixed(1)}`),
  ].join(" ");

  const upper = projected
    .map((point) => `${x(point.t).toFixed(1)},${y(point.value + point.spread).toFixed(1)}`)
    .join(" L");
  const lower = [...projected]
    .reverse()
    .map((point) => `${x(point.t).toFixed(1)},${y(point.value - point.spread).toFixed(1)}`)
    .join(" L");

  const latest = history[history.length - 1];
  const thresholdY = threshold !== null ? y(threshold) : null;
  const gridValues = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);

  const hoverPoint =
    hoverX === null
      ? null
      : history.reduce((closest, point) =>
          Math.abs(x(point.t) - hoverX) < Math.abs(x(closest.t) - hoverX) ? point : closest,
        );

  return (
    <div className="rounded-xl border border-brand-surface bg-brand-surface/20">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-surface px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {window.resourceType.replace(/_/g, " ")} · {window.rackId} / {window.tenantId}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {window.count} hourly points · {fmtDate(window.windowStart)} → {fmtDate(window.windowEnd)}
          </p>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-white">
            {latest.value.toFixed(1)}
          </span>
          <span className="text-xs text-slate-400">{unit || window.points[0]?.unit}</span>
        </div>
      </div>

      <div className="px-2 py-3">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img">
          <defs>
            <linearGradient id="historyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* grid + y labels */}
          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={y(value)}
                y2={y(value)}
                stroke="#334155"
                strokeDasharray="3 4"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 8}
                y={y(value) + 3}
                textAnchor="end"
                fontSize={10}
                fill="#64748b"
              >
                {value.toFixed(0)}
              </text>
            </g>
          ))}

          {/* safety margin threshold */}
          {thresholdY !== null && (
            <g>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={thresholdY}
                y2={thresholdY}
                stroke="#f59e0b"
                strokeWidth={1.2}
                strokeDasharray="6 4"
              />
              <text
                x={WIDTH - PADDING.right}
                y={thresholdY - 5}
                textAnchor="end"
                fontSize={10}
                fill="#f59e0b"
              >
                safety margin {fmtPct(safetyMarginPct, 0)}
              </text>
            </g>
          )}

          {/* history area */}
          <path
            d={`${historyPath} L${x(latest.t)},${PADDING.top + plotH} L${x(history[0].t)},${
              PADDING.top + plotH
            } Z`}
            fill="url(#historyFill)"
          />

          {/* confidence cone */}
          <path
            d={`M${upper} L${lower} Z`}
            fill="#38bdf8"
            fillOpacity={0.12}
            stroke="none"
          />

          {/* projection */}
          <path
            d={projectionPath}
            fill="none"
            stroke="#a78bfa"
            strokeWidth={1.8}
            strokeDasharray="6 4"
          />

          {/* history line */}
          <path d={historyPath} fill="none" stroke="#38bdf8" strokeWidth={2} />

          {/* now marker */}
          <line
            x1={x(latest.t)}
            x2={x(latest.t)}
            y1={PADDING.top}
            y2={PADDING.top + plotH}
            stroke="#475569"
            strokeWidth={1}
          />
          <circle cx={x(latest.t)} cy={y(latest.value)} r={3.5} fill="#38bdf8" stroke="#0f172a" strokeWidth={2} />

          {/* hover */}
          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onMouseMove={(event) => {
              const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / rect.width;
              setHoverX(PADDING.left + ratio * plotW);
            }}
            onMouseLeave={() => setHoverX(null)}
          />
          {hoverPoint && hoverX !== null && (
            <g>
              <line
                x1={x(hoverPoint.t)}
                x2={x(hoverPoint.t)}
                y1={PADDING.top}
                y2={PADDING.top + plotH}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <circle cx={x(hoverPoint.t)} cy={y(hoverPoint.value)} r={3} fill="#e2e8f0" />
              <text
                x={Math.min(Math.max(x(hoverPoint.t), PADDING.left + 40), WIDTH - PADDING.right - 40)}
                y={PADDING.top + 10}
                textAnchor="middle"
                fontSize={10}
                fill="#e2e8f0"
              >
                {new Date(hoverPoint.t).toLocaleDateString(undefined, {
                  month: "short",
                  day: "2-digit",
                })}{" "}
                · {hoverPoint.value.toFixed(1)}
              </text>
            </g>
          )}

          {/* x axis */}
          <line
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={PADDING.top + plotH}
            y2={PADDING.top + plotH}
            stroke="#475569"
          />
          <text x={PADDING.left} y={HEIGHT - 10} fontSize={10} fill="#64748b">
            {fmtDate(new Date(history[0].t).toISOString())}
          </text>
          <text
            x={WIDTH - PADDING.right}
            y={HEIGHT - 10}
            textAnchor="end"
            fontSize={10}
            fill="#64748b"
          >
            +{PROJECTION_DAYS}d projection
          </text>
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-brand-surface px-4 py-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-brand-accent" /> observed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t border-dashed border-violet-400" /> projected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded bg-brand-accent/20" /> 95% confidence
        </span>
        <span className="ml-auto tabular-nums">
          lead time {leadTimeWeeks >= 999 ? "stable" : `${leadTimeWeeks.toFixed(1)}w`} · confidence{" "}
          {fmtPct(confidenceScore * 100, 0)}
        </span>
      </div>

      {regimeChangeDescription && (
        <div className="border-t border-brand-warn/20 bg-brand-warn/5 px-4 py-2 text-[11px] text-brand-warn">
          Regime change detected — {regimeChangeDescription}
        </div>
      )}
    </div>
  );
}
