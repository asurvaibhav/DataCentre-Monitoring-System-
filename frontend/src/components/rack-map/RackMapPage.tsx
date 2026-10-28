// Facility explorer: technical floor plan, live rack inspector and incidents.

import { useMemo, useState } from "react";

import { MetricCard } from "@/components/common/MetricCard";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { useFacility } from "@/hooks/useFacility";
import { fmtDateTime, fmtPct, phaseLabel, severityFromUtilization } from "@/lib/format";
import { RESOURCE_SPEC } from "@/lib/resourceSpec";
import { useAO02Store } from "@/store/ao02Store";
import type { ResourceType, SeverityStatus } from "@/types/ao02";
import { IsometricRackMap } from "./IsometricRackMap";

interface RackMapPageProps {
  onNavigate?: (page: "rack-map" | "queue" | "forecast" | "hitl") => void;
}

const STATUS_TAG: Record<SeverityStatus, string> = {
  HEALTHY: "tag-ok",
  WARNING: "tag-warn",
  CRITICAL: "tag-critical",
};

const STATUS_COLOR: Record<SeverityStatus, string> = {
  HEALTHY: "#34765f",
  WARNING: "#8a5a2b",
  CRITICAL: "#a33a2f",
};

function shortCoolingLabel(label: string): string {
  return label.replace(/\s*\(.*\)/, "");
}

export function RackMapPage({ onNavigate }: RackMapPageProps) {
  const { facility, loading } = useFacility();
  const { state, actions } = useAO02Store();
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const activeTokens = useMemo(
    () => [...state.tokens, ...state.pending],
    [state.tokens, state.pending],
  );

  if (loading) {
    return (
      <p className="loading" role="status">
        Loading facility telemetry…
      </p>
    );
  }

  if (!facility) {
    return (
      <section className="error-panel" role="alert">
        <p className="eyebrow">TELEMETRY UNAVAILABLE</p>
        <h2 className="mt-3 text-[25px] font-medium">Could not load the facility</h2>
        <p className="mt-3 max-w-md text-xs leading-relaxed text-brand-muted">
          The backend did not return a facility overview. Start the service, then retry the
          connection.
        </p>
        <button type="button" onClick={() => actions.refreshAll()} className="btn mt-4">
          Retry connection ↗
        </button>
      </section>
    );
  }

  const selectedRack = facility.racks.find((rack) => rack.rackId === selected) ?? null;
  const selectedIncident = selectedRack?.incidents[0] ?? null;

  const tokenFor = (tokenId: string) =>
    state.tokens.find((token) => token.tokenId === tokenId) ??
    state.pending.find((token) => token.tokenId === tokenId) ??
    state.history.find((token) => token.tokenId === tokenId) ??
    null;

  const openIncidents =
    facility.racks.reduce((sum, rack) => sum + rack.incidentCount, 0) +
    facility.cooling.reduce((sum, unit) => sum + unit.incidentCount, 0);

  const avgPower =
    facility.racks.reduce((sum, rack) => sum + rack.powerPct, 0) /
    Math.max(facility.racks.length, 1);

  const hottestCooling = facility.cooling.reduce(
    (worst, unit) => Math.max(worst, unit.utilizationPct),
    0,
  );

  const incidentRows = [
    ...facility.racks.flatMap((rack) =>
      rack.incidents.map((incident) => ({
        ...incident,
        node: rack.rackId,
        nodeStatus: rack.status,
      })),
    ),
    ...facility.cooling.flatMap((unit) =>
      unit.incidents.map((incident) => ({
        ...incident,
        node: unit.label,
        nodeStatus: unit.status,
      })),
    ),
  ];
  const visibleIncidents = incidentRows.slice(0, 12);

  const resourceCoverage = (Object.keys(RESOURCE_SPEC) as ResourceType[]).map((resource) => {
    const matches = activeTokens.filter((token) => token.resourceType === resource);
    const facilityCount = incidentRows.filter(
      (incident) => incident.resourceType === resource,
    ).length;
    const peak = matches.reduce((worst, token) => Math.max(worst, token.utilizationPct), 0);
    return {
      resource,
      count: Math.max(matches.length, facilityCount),
      peak,
    };
  });

  const openIncident = (tokenId: string) => {
    actions.selectToken(tokenId);
    onNavigate?.("hitl");
  };

  return (
    <div>
      <section className="workspace" aria-label="Facility explorer">
        <div className="drawing-caption">
          <span>FIG. 01</span> ISOMETRIC FACILITY PLAN <span>/ NOT TO SCALE</span>
        </div>

        <IsometricRackMap
          racks={facility.racks}
          cooling={facility.cooling}
          selected={selected}
          onSelect={(rackId) =>
            setSelected((current) => (current === rackId ? null : rackId))
          }
          zoom={zoom}
        />

        <aside className="inspector" aria-label="Rack inspector">
          {selectedRack ? (
            <>
              <p className="eyebrow">RACK INSPECTION</p>
              <h2>{selectedRack.rackId}</h2>
              <p>
                {selectedIncident
                  ? `${selectedIncident.resourceType.replace(/_/g, " ")} · tenant ${
                      selectedIncident.tenantId
                    } · ${selectedRack.incidentCount} open ${
                      selectedRack.incidentCount === 1 ? "incident" : "incidents"
                    }.`
                  : `No open incidents. Worst resource utilization ${fmtPct(
                      selectedRack.worstUtilizationPct,
                    )}.`}
              </p>
              <dl>
                <div>
                  <dt>Worst utilization</dt>
                  <dd>{fmtPct(selectedRack.worstUtilizationPct)}</dd>
                </div>
                <div>
                  <dt>Power draw</dt>
                  <dd>
                    {selectedRack.powerLoadKw.toFixed(1)} / {selectedRack.maxPowerKw} kW
                  </dd>
                </div>
                <div>
                  <dt>Rack network</dt>
                  <dd>{fmtPct(selectedRack.networkPct)}</dd>
                </div>
                <div>
                  <dt>Open incidents</dt>
                  <dd>{selectedRack.incidentCount}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`tag ${STATUS_TAG[selectedRack.status]}`}>
                      <span className="tag-dot" aria-hidden="true" />
                      {selectedRack.status}
                    </span>
                  </dd>
                </div>
              </dl>

              {selectedIncident && (
                <div className="inspector-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={() => openIncident(selectedIncident.tokenId)}
                  >
                    Open incident ↗
                  </button>
                </div>
              )}

              <button
                type="button"
                className="text-button mt-2"
                onClick={() => setSelected(null)}
              >
                ← Back to facility
              </button>
              <div className="inspector-note">
                <span aria-hidden="true">◇</span> Live telemetry · read-only
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">FACILITY OVERVIEW</p>
              <h2>The facility</h2>
              <p>
                Twelve racks, two cooling units, and one live incident overlay. Select a rack
                to inspect its readings.
              </p>
              <dl>
                <div>
                  <dt>Rack positions</dt>
                  <dd>{String(facility.racks.length).padStart(2, "0")}</dd>
                </div>
                <div>
                  <dt>Cooling units</dt>
                  <dd>{String(facility.cooling.length).padStart(2, "0")}</dd>
                </div>
                <div>
                  <dt>Active incidents</dt>
                  <dd>{openIncidents}</dd>
                </div>
                <div>
                  <dt>Operating mode</dt>
                  <dd>Read-only</dd>
                </div>
              </dl>

              <div className="inspector-cooling" aria-label="Cooling readings">
                {facility.cooling.map((unit) => (
                  <div key={unit.unitId}>
                    <span>{shortCoolingLabel(unit.label)}</span>
                    <span className="tabular-nums">
                      {unit.supplyTempCelsius.toFixed(1)}°C · {unit.fanSpeedRpm} RPM
                    </span>
                  </div>
                ))}
              </div>

              <div className="inspector-note">
                <span aria-hidden="true">◇</span> Generated {fmtDateTime(facility.generatedAt)}
              </div>
            </>
          )}
        </aside>

        <div className="view-controls" aria-label="View controls">
          <span>VIEW</span>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= 0.8}
            onClick={() => setZoom((value) => Math.max(0.8, +(value - 0.1).toFixed(1)))}
          >
            −
          </button>
          <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= 1.3}
            onClick={() => setZoom((value) => Math.min(1.3, +(value + 0.1).toFixed(1)))}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setSelected(null);
            }}
          >
            Reset view ↗
          </button>
        </div>
      </section>

      <div className="rack-selector" aria-label="Select a rack">
        <span className="eyebrow">INSPECT A RACK</span>
        {facility.racks.map((rack) => (
          <button
            key={rack.rackId}
            type="button"
            aria-pressed={selected === rack.rackId}
            onClick={() =>
              setSelected((current) => (current === rack.rackId ? null : rack.rackId))
            }
          >
            {rack.rackId}
          </button>
        ))}
      </div>

      <section className="resource-strip" aria-label="Live resource coverage">
        {resourceCoverage.map((item, index) => (
          <div key={item.resource}>
            <span className="resource-number">{String(index + 1).padStart(2, "0")}</span>
            <h3>{item.resource.replace(/_/g, " ").toLowerCase()}</h3>
            <span className="pending">
              {item.count > 0
                ? `${item.count} open${item.peak > 0 ? ` · peak ${fmtPct(item.peak, 0)}` : ""}`
                : "within margin"}
            </span>
          </div>
        ))}
      </section>

      <div className="stat-strip mt-2">
        <MetricCard
          title="Open incidents"
          value={openIncidents}
          subtext={`${state.tokens.length} queued · ${state.pending.length} awaiting`}
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
          subtext={`Worst CRAC at ${fmtPct(hottestCooling, 0)}`}
          tone={hottestCooling >= 90 ? "critical" : hottestCooling >= 80 ? "warn" : "ok"}
        />
        <MetricCard
          title="Facility coverage"
          value={`${facility.racks.length} / ${String(facility.cooling.length).padStart(2, "0")}`}
          subtext="Racks / cooling units"
          tone="accent"
        />
      </div>

      <section className="section-block" aria-label="Active incidents">
        <div className="section-head">
          <div>
            <p className="eyebrow">
              ACTIVE INCIDENTS / {String(incidentRows.length).padStart(2, "0")}
            </p>
            <h2>Incident overlay</h2>
          </div>
          <button type="button" className="btn" onClick={() => onNavigate?.("queue")}>
            View queue ↗
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>Node</th>
                <th>Resource</th>
                <th>Tenant</th>
                <th>Utilization</th>
                <th>Phase</th>
                <th aria-label="Open incident" />
              </tr>
            </thead>
            <tbody>
              {visibleIncidents.map((incident) => {
                const token = tokenFor(incident.tokenId);
                const severity = token
                  ? severityFromUtilization(token.utilizationPct)
                  : incident.nodeStatus;
                const utilization = token?.utilizationPct;

                return (
                  <tr
                    key={incident.tokenId}
                    data-clickable="true"
                    onClick={() => openIncident(incident.tokenId)}
                  >
                    <td className="mono">{incident.node}</td>
                    <td className="text-brand-muted">
                      {incident.resourceType.replace(/_/g, " ")}
                    </td>
                    <td className="mono">{incident.tenantId}</td>
                    <td>
                      <div className="util">
                        <span className="util-track">
                          <span
                            className="util-fill"
                            style={{
                              width: `${Math.max(0, Math.min(100, utilization ?? 0))}%`,
                              background: STATUS_COLOR[severity],
                            }}
                          />
                        </span>
                        <span className="mono tabular-nums">{fmtPct(utilization)}</span>
                      </div>
                    </td>
                    <td>
                      <SeverityBadge status={severity} label={phaseLabel(incident.phase)} />
                    </td>
                    <td className="text-right">
                      <span className="link">Open ↗</span>
                    </td>
                  </tr>
                );
              })}
              {visibleIncidents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-brand-muted">
                    No open incidents. The facility is within safety margins.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {incidentRows.length > visibleIncidents.length && (
          <p className="pending mt-3">
            Showing {visibleIncidents.length} of {incidentRows.length} · open the queue for the
            full record
          </p>
        )}
      </section>
    </div>
  );
}
