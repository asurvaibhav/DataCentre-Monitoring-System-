// frontend/src/components/rack-map/IsometricRackMap.tsx
// 2.5D isometric data center floor view: Racks R-01..R-12 + CRAC A/B.
// Uses CSS transforms for isometric projection; severity dots + active badges.
// Decoupled: consumes rack nodes from the store; colors come from Tailwind tokens.

import type { RackSpatialNode, CoolingUnitNode } from "@/types/ao02";
import { SeverityBadge } from "@/components/common/SeverityBadge";

interface IsometricRackMapProps {
  racks: RackSpatialNode[];
  cooling: CoolingUnitNode[];
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

const ISO_OFFSET_X = 70;
const ISO_OFFSET_Y = 40;
const ROW_STEP_Y = 55;
const COL_STEP_X = 78;

function rackStyle(pos: { row: number; col: number }) {
  // Isometric projection: x = (col - row) * colStep + offsetX, y = (col + row) * rowStep + offsetY
  const x = (pos.col - pos.row) * COL_STEP_X + ISO_OFFSET_X;
  const y = (pos.col + pos.row) * ROW_STEP_Y + ISO_OFFSET_Y;
  return { transform: `translate(${x}px, ${y}px)` };
}

export function IsometricRackMap({ racks, cooling }: IsometricRackMapProps) {

  return (
    <div className="relative w-full h-[520px] bg-brand-dark/30 rounded-xl border border-brand-surface/50 overflow-hidden">
      {/* Floor grid */}
      <div className="absolute inset-0 opacity-20" style={{ pointerEvents: "none" }}>
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute left-0 top-0 w-full h-px border-y border-white/10"
            style={{ transform: `translateY(${i * 60}px)` }}
          />
        ))}
        {[...Array(4)].map((_, j) => (
          <div
            key={j}
            className="absolute left-0 top-0 h-full w-px border-x border-white/10"
            style={{ transform: `translateX(${j * 90}px)` }}
          />
        ))}
      </div>

      {/* Racks */}
      {racks.map((rack) => {
        const pos = RACK_LAYOUT[rack.rackId];
        if (!pos) return null;
        return (
          <div
            key={rack.rackId}
            className="absolute group cursor-pointer"
            style={rackStyle(pos)}
          >
            {/* Rack top (isometric) */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-20 h-6 bg-brand-dark border border-gray-600/60 rounded-t overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-black/80" />
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.03) 75%, transparent 75%, transparent), linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0.03) 75%, transparent 75%, transparent)" }} />
            </div>
            {/* Rack front face */}
            <div
              className={`w-16 h-24 bg-gray-900 border border-gray-700 rounded overflow-hidden shadow-lg transition-all duration-200 group-hover:shadow-brand-accent/20 ${rack.status === "CRITICAL" ? "ring-2 ring-brand-critical" : rack.status === "WARNING" ? "ring-1 ring-brand-warn" : "ring-0"}`}
            >
              {/* Power load bar */}
              <div className="h-1 bg-gray-800/50">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min(100, (rack.powerLoadKw / rack.maxPowerKw) * 100)}%`,
                    backgroundColor:
                      rack.status === "CRITICAL"
                        ? "#ef4444"
                        : rack.status === "WARNING"
                        ? "#f59e0b"
                        : "#22c55e",
                  }}
                />
              </div>
              {/* Vent lines */}
              <div className="flex-1 flex items-center justify-center opacity-20">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="w-px h-2 bg-white" />
                  ))}
                </div>
              </div>
            </div>

            {/* Status label */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap z-10">
              <SeverityBadge status={rack.status as any} label={rack.rackId} />
            </div>

            {/* Active badge (bottleneck) */}
            {rack.activeBadge && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 mt-[-2px] z-20">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-900 border border-gray-600 text-gray-200 shadow-md uppercase tracking-tighter">
                  {rack.activeBadge}
                </span>
              </div>
            )}

            {/* Severity dot */}
            <div
              className={`absolute top-0 left-1/2 -translate-x-1/2 mt-[-10px] w-3 h-3 rounded-full shadow ${
                rack.status === "CRITICAL"
                  ? "bg-brand-critical"
                  : rack.status === "WARNING"
                  ? "bg-brand-warn"
                  : "bg-brand-ok"
              }`}
            />
          </div>
        );
      })}

      {/* CRAC Units */}
      {cooling.map((crac) => {
        const pos = crac.unitId.includes("North") ? { row: 0, col: 3 } : { row: 2, col: 3 };
        return (
          <div
            key={crac.unitId}
            className="absolute group cursor-pointer"
            style={rackStyle(pos)}
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-20 h-6 bg-brand-dark border border-gray-600/60 rounded-t overflow-hidden" />
            <div className="w-16 h-24 bg-gray-800 border border-gray-600 rounded shadow-lg group-hover:shadow-brand-accent/30 transition-all">
              <div className="h-1 bg-gray-700" />
              <div className="flex-1 flex items-center justify-center opacity-30">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="w-px h-2 bg-white" />
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap z-10">
              <SeverityBadge status={crac.status as any} label={crac.unitId} />
            </div>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 whitespace-nowrap">
              {crac.supplyTempCelsius.toFixed(1)}°C • {crac.fanSpeedRpm.toLocaleString()} RPM
            </div>
          </div>
        );
      })}

      {/* Center facility label */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-600 uppercase tracking-widest opacity-40">
        Data Center Floor
      </div>
    </div>
  );
}
