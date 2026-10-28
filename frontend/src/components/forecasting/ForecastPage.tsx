// Forecasting page: choose a rack/tenant/resource series, inspect the latest
// window, and read the projected time-to-exhaustion against the safety margin.

import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "@/components/common/MetricCard";
import { useTelemetry } from "@/hooks/useTelemetry";
import { useAO02Store } from "@/store/ao02Store";
import { fmtDate, fmtPct, fmtWeeks } from "@/lib/format";
import {
  CRAC_UNITS,
  RACK_IDS,
  RESOURCE_SPEC,
  resourcesForNode,
  tenantsForResource,
} from "@/lib/resourceSpec";
import type { IncidentTokenDTO, ResourceType, TelemetryWindow } from "@/types/ao02";
import { ForecastChart } from "./ForecastChart";

interface ForecastPageProps {
  onNavigate?: (page: "rack-map" | "queue" | "forecast" | "hitl") => void;
}

const NODE_OPTIONS = [
  ...RACK_IDS.map((rack) => ({ id: rack, label: rack })),
  ...CRAC_UNITS.map((unit) => ({ id: unit.id, label: unit.label })),
];

function weeksToThreshold(window: TelemetryWindow | null, threshold: number): number | null {
  const points = window?.points ?? [];
  if (points.length < 24) return null;

  const recent = points.slice(-168);
  const latest = recent[recent.length - 1].value;
  if (latest >= threshold) return 0;

  const n = recent.length;
  const xs = recent.map((point) => new Date(point.timestamp).getTime() / 3_600_000);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = recent.reduce((sum, point) => sum + point.value, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - meanX) * (recent[i].value - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;

  const slopePerHour = num / den;
  if (slopePerHour <= 0.0005) return null;

  return (threshold - latest) / slopePerHour / 168;
}

function findSeriesToken(
  tokens: IncidentTokenDTO[],
  pending: IncidentTokenDTO[],
  history: IncidentTokenDTO[],
  rackId: string,
  tenantId: string,
  resourceType: ResourceType,
): IncidentTokenDTO | null {
  return (
    [...pending, ...tokens, ...history].find(
      (token) =>
        token.rackId === rackId &&
        token.tenantId === tenantId &&
        token.resourceType === resourceType,
    ) ?? null
  );
}

export function ForecastPage({ onNavigate }: ForecastPageProps) {
  const { state, actions } = useAO02Store();
  const { window, loading, error, loadTelemetry } = useTelemetry();

  const [rackId, setRackId] = useState("R-04");
  const [tenantId, setTenantId] = useState("T1");
  const [resourceType, setResourceType] = useState<ResourceType>("STORAGE");

  const availableResources = resourcesForNode(rackId);
  const availableTenants = tenantsForResource(resourceType);
  const spec = RESOURCE_SPEC[resourceType];
  const threshold = (spec.hardLimit * spec.safetyMarginPct) / 100;

  const seriesToken = useMemo(
    () =>
      findSeriesToken(
        state.tokens,
        state.pending,
        state.history,
        rackId,
        tenantId,
        resourceType,
      ),
    [state.tokens, state.pending, state.history, rackId, tenantId, resourceType],
  );

  const windowKey = `${rackId}:${tenantId}:${resourceType}`;
  const activeWindow = window && state.telemetryKey === windowKey ? window : null;
  const latest = activeWindow?.points.at(-1)?.value ?? null;

  const estimatedWeeks = useMemo(
    () => weeksToThreshold(activeWindow, threshold),
    [activeWindow, threshold],
  );

  const leadTimeWeeks = seriesToken ? seriesToken.leadTimeWeeks : estimatedWeeks ?? 0;
  const leadTimeIsEstimate = !seriesToken;
  const projectedDate =
    seriesToken?.predictedExhaustionDate ??
    (estimatedWeeks !== null && estimatedWeeks < 999
      ? new Date(Date.now() + estimatedWeeks * 7 * 86_400_000).toISOString()
      : null);

  const handleNodeChange = (nextNode: string) => {
    setRackId(nextNode);
    const nextResources = resourcesForNode(nextNode);
    const nextResource = nextResources.includes(resourceType)
      ? resourceType
      : nextResources[0];
    setResourceType(nextResource);
    const nextTenants = tenantsForResource(nextResource);
    setTenantId(nextTenants.includes(tenantId) ? tenantId : nextTenants[0]);
  };

  const handleResourceChange = (nextResource: ResourceType) => {
    setResourceType(nextResource);
    const nextTenants = tenantsForResource(nextResource);
    setTenantId(nextTenants.includes(tenantId) ? tenantId : nextTenants[0]);
  };

  const refresh = () => {
    void loadTelemetry({ rackId, tenantId, resourceType, lookbackHours: 336 });
  };

  // Always load the selected series (selection changes refetch automatically).
  useEffect(() => {
    void loadTelemetry({ rackId, tenantId, resourceType, lookbackHours: 336 });
  }, [rackId, tenantId, resourceType, loadTelemetry]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-surface bg-brand-surface/20 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Rack / Cooling unit
            <select
              value={rackId}
              onChange={(event) => handleNodeChange(event.target.value)}
              className="min-w-[170px] rounded-lg border border-brand-surface bg-brand-dark px-3 py-2 text-sm text-slate-200 focus:border-brand-accent focus:outline-none"
            >
              {NODE_OPTIONS.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Resource
            <select
              value={resourceType}
              onChange={(event) => handleResourceChange(event.target.value as ResourceType)}
              className="min-w-[170px] rounded-lg border border-brand-surface bg-brand-dark px-3 py-2 text-sm text-slate-200 focus:border-brand-accent focus:outline-none"
            >
              {availableResources.map((resource) => (
                <option key={resource} value={resource}>
                  {resource.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Tenant
            <select
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              className="min-w-[140px] rounded-lg border border-brand-surface bg-brand-dark px-3 py-2 text-sm text-slate-200 focus:border-brand-accent focus:outline-none"
            >
              {availableTenants.map((tenant) => (
                <option key={tenant} value={tenant}>
                  {tenant === "FACILITY" ? "Facility-wide" : tenant}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-lg border border-brand-surface bg-brand-surface/40 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-brand-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load window"}
            </button>
            <div className="text-[11px] leading-tight text-slate-500">
              <p>
                Hard limit{" "}
                <span className="font-medium tabular-nums text-slate-300">
                  {spec.hardLimit.toFixed(1)} {spec.unit}
                </span>
              </p>
              <p>
                Margin{" "}
                <span className="font-medium tabular-nums text-slate-300">
                  {fmtPct(spec.safetyMarginPct, 0)}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Current utilization"
          value={latest === null ? "—" : `${latest.toFixed(1)} ${spec.unit}`}
          subtext={activeWindow ? `${activeWindow.count} hourly points` : "No window loaded"}
          tone={
            latest === null
              ? "neutral"
              : latest >= spec.hardLimit * 0.95
                ? "critical"
                : latest >= threshold
                  ? "warn"
                  : "ok"
          }
        />
        <MetricCard
          title="Time to exhaustion"
          value={leadTimeIsEstimate ? (leadTimeWeeks ? `~${fmtWeeks(leadTimeWeeks)}` : "stable") : fmtWeeks(leadTimeWeeks)}
          subtext={leadTimeIsEstimate ? "Linear estimate from window" : "Agent forecast"}
          tone={
            leadTimeWeeks > 0 && leadTimeWeeks < 2
              ? "critical"
              : leadTimeWeeks > 0 && leadTimeWeeks < 6
                ? "warn"
                : "ok"
          }
        />
        <MetricCard
          title="Forecast confidence"
          value={
            seriesToken ? fmtPct(seriesToken.forecastConfidenceScore * 100, 0) : "—"
          }
          subtext={
            seriesToken?.confidenceIntervalDays
              ? `±${Math.round(
                  (seriesToken.confidenceIntervalDays[1] -
                    seriesToken.confidenceIntervalDays[0]) /
                    2,
                )} days`
              : "No agent forecast for this series"
          }
          tone={seriesToken ? "accent" : "neutral"}
        />
        <MetricCard
          title="Projected exhaustion"
          value={projectedDate ? fmtDate(projectedDate) : "Stable"}
          subtext={
            seriesToken?.isTransientSpike
              ? "Transient spike — suppressed"
              : seriesToken
                ? "Agent prediction"
                : "No breach forecast"
          }
          tone={projectedDate ? "warn" : "ok"}
        />
      </div>

      <ForecastChart
        window={activeWindow}
        loading={loading}
        error={error && !activeWindow ? error : null}
        safetyMarginPct={seriesToken?.safetyMarginPct ?? spec.safetyMarginPct}
        hardCapacityLimit={seriesToken?.hardCapacityLimit ?? spec.hardLimit}
        unit={seriesToken?.unit ?? spec.unit}
        leadTimeWeeks={leadTimeWeeks}
        confidenceScore={seriesToken?.forecastConfidenceScore ?? 0}
        regimeChangeDescription={seriesToken?.regimeChangeDescription ?? null}
        onRetry={refresh}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-brand-surface bg-brand-surface/20 p-4">
          <h2 className="text-sm font-semibold text-white">Linked incident</h2>
          {seriesToken ? (
            <div className="mt-3 space-y-2 text-xs text-slate-400">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-slate-200">{seriesToken.tokenId}</span>
                <span className="rounded-full bg-brand-surface px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                  {seriesToken.currentPhase.replace(/^\d\d_/, "").replace(/_/g, " ")}
                </span>
              </div>
              <p>
                Priority {seriesToken.priorityNumber} · {seriesToken.hopCount}/
                {seriesToken.maxAllowedHops} hops · tenant {seriesToken.tenantId}
              </p>
              <p>
                Observed{" "}
                <span className="tabular-nums text-slate-200">
                  {fmtPct(seriesToken.utilizationPct)}
                </span>{" "}
                of hard limit · lead time{" "}
                <span className="tabular-nums text-slate-200">
                  {fmtWeeks(seriesToken.leadTimeWeeks)}
                </span>
              </p>
              <button
                type="button"
                onClick={() => {
                  actions.selectToken(seriesToken.tokenId);
                  onNavigate?.("hitl");
                }}
                className="mt-1 rounded-lg border border-brand-accent/40 bg-brand-accent/10 px-3 py-1.5 text-xs font-medium text-brand-accent hover:bg-brand-accent/20"
              >
                Open in HITL console →
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              No incident token for this series. The projection above is a linear
              estimate from the telemetry window.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-brand-surface bg-brand-surface/20 p-4">
          <h2 className="text-sm font-semibold text-white">Window evidence</h2>
          {activeWindow ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <dt className="text-slate-500">Window start</dt>
              <dd className="tabular-nums text-slate-300">
                {fmtDate(activeWindow.windowStart)}
              </dd>
              <dt className="text-slate-500">Window end</dt>
              <dd className="tabular-nums text-slate-300">{fmtDate(activeWindow.windowEnd)}</dd>
              <dt className="text-slate-500">Unit</dt>
              <dd className="text-slate-300">{spec.unit}</dd>
              {seriesToken?.rawSeriesSha256 && (
                <>
                  <dt className="text-slate-500">Series hash</dt>
                  <dd className="truncate font-mono text-[10px] text-slate-400">
                    {seriesToken.rawSeriesSha256.slice(0, 24)}…
                  </dd>
                </>
              )}
              {seriesToken?.regimeChangeDetected && (
                <>
                  <dt className="text-brand-warn">Regime change</dt>
                  <dd className="text-brand-warn">
                    {seriesToken.regimeChangeDescription ?? "detected"}
                  </dd>
                </>
              )}
            </dl>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Load a window to inspect evidence.</p>
          )}
        </div>
      </div>
    </div>
  );
}
