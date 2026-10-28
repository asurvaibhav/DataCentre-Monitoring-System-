// 2.5D isometric data-center floor: racks R-01..R-12 plus CRAC units.
// Pure presentation: receives facility telemetry from the page component.

import type { CoolingUnitNode, RackSpatialNode } from "@/types/ao02";
import { fmtPct } from "@/lib/format";

interface IsometricRackMapProps {
  racks: RackSpatialNode[];
  cooling: CoolingUnitNode[];
  onSelectToken?: (tokenId: string) => void;
}

const RACK_LAYOUT: Record<string, { row: number; col: number }> = {
  "R-01": { row: 0, col: 0 },
  "R-02": { row: 0, col: 1 },
  "R-03": { row: 0, col: 2 },
  "R-04": { row: 1, col: 0 },
  "R-05": { row: 1, col: 1 },
  "R-06": { row: 1, col: 2 },
  "R-07": { row: 2, col: 0 },
  "R-08": { row: 2, col: 1 },
  "R-09": { row: 2, col: 2 },
  "R-10": { row: 3, col: 0 },
  "R-11": { row: 3, col: 1 },
  "R-12": { row: 3, col: 2 },
};

const OFFSET_X = 300;
const OFFSET_Y = 30;
const ROW_STEP = 52;
const COL_STEP = 86;

const STATUS_COLOR: Record<string, string> = {
  HEALTHY: "#22c55e",
  WARNING: "#f59e0b",
  CRITICAL: "#ef4444",
};

function position(row: number, col: number) {
  return {
    left: (col - row) * COL_STEP + OFFSET_X,
    top: (col + row) * ROW_STEP + OFFSET_Y,
  };
}

export function IsometricRackMap({ racks, cooling, onSelectToken }: IsometricRackMapProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-brand-surface bg-brand-dark/40">
      <div
        className="relative h-[520px] min-w-[760px]"
        role="img"
        aria-label="Isometric data center floor plan"
      >
      {/* Floor grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.12]">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute left-0 h-px w-full bg-slate-400"
            style={{ top: 20 + i * 55 }}
          />
        ))}
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute top-0 h-full w-px bg-slate-400"
            style={{ left: 20 + i * 75 }}
          />
        ))}
      </div>

      {/* Racks */}
      {racks.map((rack) => {
        const layout = RACK_LAYOUT[rack.rackId];
        if (!layout) return null;
        const color = STATUS_COLOR[rack.status] ?? STATUS_COLOR.HEALTHY;
        const topIncident = rack.incidents[0];

        return (
          <button
            key={rack.rackId}
            type="button"
            title={`${rack.rackId} — worst utilization ${fmtPct(
              rack.worstUtilizationPct,
            )}; power ${rack.powerLoadKw.toFixed(1)} kW / ${rack.maxPowerKw} kW; ${
              rack.incidentCount
            } open incident(s)`}
            onClick={() => topIncident && onSelectToken?.(topIncident.tokenId)}
            className="group absolute w-[74px] cursor-pointer text-left focus:outline-none"
            style={position(layout.row, layout.col)}
          >
            {/* Rack top face */}
            <div className="mx-auto h-3 w-[64px] rounded-t-sm border border-slate-600/60 bg-slate-800" />

            {/* Rack front face */}
            <div
              className="relative h-[86px] w-[74px] rounded-sm border bg-slate-900 shadow-lg transition-transform duration-150 group-hover:-translate-y-0.5"
              style={{ borderColor: `${color}99` }}
            >
              <div className="flex h-full flex-col gap-1 p-1.5">
                {/* utilization bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, Math.min(100, rack.worstUtilizationPct))}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>

                {/* vent slats */}
                <div className="flex flex-1 flex-col justify-center gap-[3px] opacity-40">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-px w-full bg-slate-500" />
                  ))}
                </div>

                <span className="text-[9px] font-semibold tracking-wide text-slate-300">
                  {rack.rackId}
                </span>
              </div>

              {/* incident count badge */}
              {rack.incidentCount > 0 && (
                <span
                  className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border border-brand-dark px-1 text-[10px] font-bold text-brand-dark"
                  style={{ backgroundColor: color }}
                >
                  {rack.incidentCount}
                </span>
              )}
            </div>

            {/* Worst-resource badge */}
            {topIncident && (
              <span className="mt-1 block w-[74px] truncate text-center text-[9px] uppercase tracking-wide text-slate-400">
                {topIncident.resourceType.replace(/_/g, " ")}
              </span>
            )}

            {/* Status dot */}
            <span
              className="absolute -left-1.5 top-2 h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
          </button>
        );
      })}

      {/* Cooling units */}
      {cooling.map((unit, index) => {
        const layout = index === 0 ? { row: 0, col: 3 } : { row: 2, col: 3 };
        const color = STATUS_COLOR[unit.status] ?? STATUS_COLOR.HEALTHY;

        return (
          <div
            key={unit.unitId}
            className="absolute w-[84px]"
            style={position(layout.row, layout.col)}
            title={`${unit.label} — supply ${unit.supplyTempCelsius.toFixed(
              1,
            )}°C / ${unit.maxTempCelsius}°C; fan ${unit.fanSpeedRpm} RPM`}
          >
            <div className="mx-auto h-3 w-[70px] rounded-t-sm border border-slate-600/60 bg-slate-700" />
            <div
              className="h-[86px] w-[84px] rounded-sm border bg-slate-800/90 p-2 shadow-lg"
              style={{ borderColor: `${color}80` }}
            >
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate text-[9px] font-semibold uppercase tracking-wide text-slate-300">
                    {unit.label.match(/CRAC Unit [AB]/)?.[0] ?? unit.unitId}
                  </span>
                </div>
                <div className="flex flex-wrap gap-[2px] opacity-50">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <span key={i} className="h-2 w-px bg-slate-400" />
                  ))}
                </div>
                <div className="text-[9px] leading-tight text-slate-400">
                  <div className="tabular-nums text-slate-200">
                    {unit.supplyTempCelsius.toFixed(1)}°C
                  </div>
                  <div className="tabular-nums">{unit.fanSpeedRpm} RPM</div>
                </div>
              </div>
            </div>
            {unit.incidentCount > 0 && (
              <span className="mt-1 block text-center text-[9px] font-semibold text-brand-warn">
                {unit.incidentCount} alert(s)
              </span>
            )}
          </div>
        );
      })}

      {/* Floor label */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-700">
        Data Center Floor
      </div>
      </div>
    </div>
  );
}
