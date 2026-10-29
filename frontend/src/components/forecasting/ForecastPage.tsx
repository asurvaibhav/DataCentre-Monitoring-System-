import { CustomTelemetry } from "@/components/CustomTelemetry";
// Forecasting page: choose a rack/tenant/resource series, inspect the latest
// window, and read the projected time-to-exhaustion against the safety margin.

import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "@/components/common/MetricCard";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { useTelemetry } from "@/hooks/useTelemetry";
import { useAO02Store } from "@/store/ao02Store";
import { fmtDate, fmtPct, fmtWeeks, phaseLabel } from "@/lib/format";
import {
  CRAC_UNITS,
  RACK_IDS,
  RESOURCE_SPEC,
  resourcesForNode,
  tenantsForResource,
} from "@/lib/resourceSpec";
import type {
  IncidentTokenDTO,
  ResourceType,
  SeverityStatus,
  TelemetryWindow,
} from "@/types/ao02";
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

function tokenTagStatus(token: IncidentTokenDTO): SeverityStatus {
  if (token.currentPhase === "07_RESOLVED") return "HEALTHY";
  if (token.currentPhase === "08_REJECTED_BY_OPERATOR") return "CRITICAL";
  if (token.awaitingHumanVerification) return "WARNING";
  return token.utilizationPct >= 95
    ? "CRITICAL"
    : token.utilizationPct >= 85
      ? "WARNING"
      : "HEALTHY";
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
    <div className="mt-8">
      <CustomTelemetry />
      <section className="panel section-pad" aria-label="Series selector">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
          <label className="field-label">
            Rack / Cooling unit
            <select
              value={rackId}
              onChange={(event) => handleNodeChange(event.target.value)}
              className="field min-w-[170px]"
            >
              {NODE_OPTIONS.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Resource
            <select
              value={resourceType}
              onChange={(event) => handleResourceChange(event.target.value as ResourceType)}
              className="field min-w-[170px]"
            >
              {availableResources.map((resource) => (
                <option key={resource} value={resource}>
                  {resource.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Tenant
            <select
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              className="field min-w-[140px]"
            >
              {availableTenants.map((tenant) => (
                <option key={tenant} value={tenant}>
                  {tenant === "FACILITY" ? "Facility-wide" : tenant}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="btn"
          >
            {loading ? "Loading…" : "Load window ↗"}
          </button>

          <div className="mono ml-auto space-y-1 text-[9px] uppercase tracking-wide text-brand-muted">
            <p>
              Hard limit{" "}
              <span className="text-brand-ink">
                {spec.hardLimit.toFixed(1)} {spec.unit}
              </span>
            </p>
            <p>
              Safety margin{" "}
              <span className="text-brand-ink">{fmtPct(spec.safetyMarginPct, 0)}</span>
            </p>
          </div>
        </div>
      </section>

      <div className="stat-strip mt-7">
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
          value={
            leadTimeIsEstimate
              ? leadTimeWeeks
                ? `~${fmtWeeks(leadTimeWeeks)}`
                : "stable"
              : fmtWeeks(leadTimeWeeks)
          }
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
          value={seriesToken ? fmtPct(seriesToken.forecastConfidenceScore * 100, 0) : "—"}
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

      <div className="mt-7">
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
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <section className="panel section-pad">
          <div className="section-head">
            <div>
              <p className="eyebrow">LINKED INCIDENT</p>
              <h2 className="mono text-[13px] font-normal">
                {seriesToken ? seriesToken.tokenId : "No token attached"}
              </h2>
            </div>
            {seriesToken && (
              <SeverityBadge
                status={tokenTagStatus(seriesToken)}
                label={phaseLabel(seriesToken.currentPhase)}
              />
            )}
          </div>

          {seriesToken ? (
            <dl className="text-xs">
              <div className="flex justify-between gap-4 border-b border-brand-line-soft/60 py-2">
                <dt className="text-brand-muted">Priority / hops</dt>
                <dd className="mono tabular-nums">
                  {seriesToken.priorityNumber} · {seriesToken.hopCount}/
                  {seriesToken.maxAllowedHops}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-brand-line-soft/60 py-2">
                <dt className="text-brand-muted">Tenant</dt>
                <dd className="mono">{seriesToken.tenantId}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-brand-line-soft/60 py-2">
                <dt className="text-brand-muted">Observed utilization</dt>
                <dd className="mono tabular-nums">{fmtPct(seriesToken.utilizationPct)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-brand-line-soft/60 py-2">
                <dt className="text-brand-muted">Agent lead time</dt>
                <dd className="mono tabular-nums">{fmtWeeks(seriesToken.leadTimeWeeks)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-brand-muted">Projected exhaustion</dt>
                <dd className="mono tabular-nums">
                  {fmtDate(seriesToken.predictedExhaustionDate)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs leading-relaxed text-brand-muted">
              No incident token for this series. The projection above is a linear estimate
              from the telemetry window.
            </p>
          )}

          {seriesToken && (
            <button
              type="button"
              className="btn btn-primary mt-4"
              onClick={() => {
                actions.selectToken(seriesToken.tokenId);
                onNavigate?.("hitl");
              }}
            >
              Open in HITL console ↗
            </button>
          )}
        </section>

        <section className="panel section-pad">
          <div className="section-head">
            <div>
              <p className="eyebrow">WINDOW EVIDENCE</p>
              <h2>Telemetry window</h2>
            </div>
            {activeWindow && <span className="pending">{activeWindow.count} points</span>}
          </div>

          {activeWindow ? (
            <dl className="text-xs">
              <div className="flex justify-between gap-4 border-b border-brand-line-soft/60 py-2">
                <dt className="text-brand-muted">Window start</dt>
                <dd className="mono tabular-nums">{fmtDate(activeWindow.windowStart)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-brand-line-soft/60 py-2">
                <dt className="text-brand-muted">Window end</dt>
                <dd className="mono tabular-nums">{fmtDate(activeWindow.windowEnd)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-brand-line-soft/60 py-2">
                <dt className="text-brand-muted">Unit</dt>
                <dd className="mono">{spec.unit}</dd>
              </div>
              {seriesToken?.rawSeriesSha256 && (
                <div className="flex justify-between gap-4 border-b border-brand-line-soft/60 py-2">
                  <dt className="text-brand-muted">Series hash</dt>
                  <dd className="mono truncate text-[10px] text-brand-muted">
                    {seriesToken.rawSeriesSha256.slice(0, 24)}…
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-brand-muted">Lineage</dt>
                <dd className="mono text-[10px]">raw_series_sha256</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs leading-relaxed text-brand-muted">
              Load a window to inspect its evidence.
            </p>
          )}

          {seriesToken?.regimeChangeDetected && (
            <p className="notice mt-4">
              Regime change — {seriesToken.regimeChangeDescription ?? "detected"}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
