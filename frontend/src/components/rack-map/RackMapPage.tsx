// Facility overview page: live rack/cooling telemetry plus active incidents.

import { useAO02Store } from "@/store/ao02Store";
import { useFacility } from "@/hooks/useFacility";
import { fmtPct, phaseLabel } from "@/lib/format";
import { IsometricRackMap } from "./IsometricRackMap";
import { MetricCard } from "@/components/common/MetricCard";
import { SeverityBadge } from "@/components/common/SeverityBadge";

interface RackMapPageProps {
  onNavigate?: (page: "rack-map" | "queue" | "forecast" | "hitl") => void;
}

export function RackMapPage({ onNavigate }: RackMapPageProps) {
  const { facility, loading } = useFacility();
  const { state, actions } = useAO02Store();

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="h-[520px] animate-pulse rounded-xl border border-brand-surface bg-brand-surface/30" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-brand-surface bg-brand-surface/30"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!facility) {
    return (
      <div className="rounded-xl border border-brand-surface bg-brand-surface/30 p-10 text-center">
        <p className="text-sm text-slate-400">Facility telemetry is unavailable.</p>
        <button
          type="button"
          onClick={() => actions.refreshAll()}
          className="mt-3 text-xs font-medium text-brand-accent underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const rackStatus = facility.racks.reduce(
    (acc, rack) => {
      acc[rack.status] += 1;
      return acc;
    },
    { HEALTHY: 0, WARNING: 0, CRITICAL: 0 } as Record<string, number>,
  );

  const openIncidents =
    facility.racks.reduce((sum, rack) => sum + rack.incidentCount, 0) +
    facility.cooling.reduce((sum, unit) => sum + unit.incidentCount, 0);
  const avgPower =
    facility.racks.reduce((sum, rack) => sum + rack.powerPct, 0) /
    Math.max(facility.racks.length, 1);
  const hottestCooling = facility.cooling.reduce(
    (worst, unit) => (unit.utilizationPct > worst ? unit.utilizationPct : worst),
    0,
  );

  const incidents = facility.racks
    .flatMap((rack) => rack.incidents.map((incident) => ({ ...incident, rackId: rack.rackId })))
    .slice(0, 10);

  const tokenFor = (tokenId: string) =>
    state.tokens.find((token) => token.tokenId === tokenId) ??
    state.pending.find((token) => token.tokenId === tokenId) ??
    null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <section className="space-y-4">
        <div className="rounded-xl border border-brand-surface bg-brand-surface/20 p-3">
          <IsometricRackMap
            racks={facility.racks}
            cooling={facility.cooling}
            onSelectToken={(tokenId) => {
              actions.selectToken(tokenId);
              onNavigate?.("hitl");
            }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-critical" />
              Critical {rackStatus.CRITICAL}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-warn" />
              Warning {rackStatus.WARNING}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-ok" />
              Healthy {rackStatus.HEALTHY}
            </span>
            <span className="ml-auto">Click a rack to open its incident</span>
          </div>
        </div>

        <div className="rounded-xl border border-brand-surface bg-brand-surface/20">
          <div className="flex items-center justify-between border-b border-brand-surface px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Active incidents</h2>
            <button
              type="button"
              onClick={() => onNavigate?.("queue")}
              className="text-xs font-medium text-brand-accent hover:underline"
            >
              View queue →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-brand-surface/60">
                  <th className="px-4 py-2 font-medium">Rack</th>
                  <th className="px-4 py-2 font-medium">Resource</th>
                  <th className="px-4 py-2 font-medium">Tenant</th>
                  <th className="px-4 py-2 font-medium">Utilization</th>
                  <th className="px-4 py-2 font-medium">Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-surface/40">
                {incidents.map((incident) => {
                  const token = tokenFor(incident.tokenId);
                  return (
                    <tr
                      key={incident.tokenId}
                      className="cursor-pointer hover:bg-brand-surface/40"
                      onClick={() => {
                        actions.selectToken(incident.tokenId);
                        onNavigate?.("hitl");
                      }}
                    >
                      <td className="px-4 py-2 font-medium text-slate-200">{incident.rackId}</td>
                      <td className="px-4 py-2 text-slate-300">
                        {incident.resourceType.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-2 text-slate-400">{incident.tenantId}</td>
                      <td className="px-4 py-2 tabular-nums text-slate-300">
                        {fmtPct(token?.utilizationPct ?? 0)}
                      </td>
                      <td className="px-4 py-2">
                        <SeverityBadge
                          status={
                            token && token.utilizationPct >= 95
                              ? "CRITICAL"
                              : token && token.utilizationPct >= 85
                                ? "WARNING"
                                : "HEALTHY"
                          }
                          label={phaseLabel(incident.phase)}
                        />
                      </td>
                    </tr>
                  );
                })}
                {incidents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      No open incidents. The facility is within safety margins.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <aside className="space-y-3">
        <MetricCard
          title="Open incidents"
          value={openIncidents}
          subtext="Tokens in queue or awaiting HITL"
          tone={openIncidents > 20 ? "critical" : openIncidents > 0 ? "warn" : "ok"}
        />
        <MetricCard
          title="Avg power utilization"
          value={fmtPct(avgPower, 0)}
          subtext="Facility-wide rack draw"
          tone={avgPower >= 90 ? "critical" : avgPower >= 80 ? "warn" : "ok"}
        />
        <MetricCard
          title="Cooling headroom"
          value={fmtPct(100 - hottestCooling, 0)}
          subtext="Worst CRAC supply temperature"
          tone={hottestCooling >= 90 ? "critical" : hottestCooling >= 80 ? "warn" : "ok"}
        />
        <MetricCard
          title="Facility coverage"
          value={`${facility.racks.length} racks · ${facility.cooling.length} CRAC`}
          subtext="Read-only telemetry"
          tone="accent"
        />

        <div className="rounded-xl border border-brand-surface bg-brand-surface/30 p-4">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Cooling units
          </h3>
          <ul className="mt-2 space-y-2 text-xs">
            {facility.cooling.map((unit) => (
              <li key={unit.unitId} className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-300">{unit.label}</span>
                <span className="shrink-0 tabular-nums text-slate-400">
                  {unit.supplyTempCelsius.toFixed(1)}°C · {unit.fanSpeedRpm} RPM
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
