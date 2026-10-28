// 2.5D isometric facility plan, adapted from the XOR technical drawing.
// Pure presentation: live readings arrive from the facility hook.

import type { CoolingUnitNode, RackSpatialNode, SeverityStatus } from "@/types/ao02";
import { fmtPct } from "@/lib/format";

interface IsometricRackMapProps {
  racks: RackSpatialNode[];
  cooling: CoolingUnitNode[];
  selected: string | null;
  onSelect: (rackId: string) => void;
  zoom: number;
}

const STATUS_CLASS: Record<SeverityStatus, string> = {
  HEALTHY: "rack-healthy",
  WARNING: "rack-warning",
  CRITICAL: "rack-critical",
};

const STATUS_COLOR: Record<SeverityStatus, string> = {
  HEALTHY: "#6f776b",
  WARNING: "#8a5a2b",
  CRITICAL: "#a33a2f",
};

function rackPosition(rackId: string, index: number): { x: number; y: number } {
  const number = Number(rackId.replace(/\D/g, "")) || index + 1;
  const slot = Math.max(0, number - 1);
  const row = Math.floor(slot / 3);
  const col = slot % 3;
  return {
    x: 300 + col * 115 - row * 77,
    y: 211 + col * 66 + row * 44,
  };
}

function shortCoolingLabel(unit: CoolingUnitNode): string {
  return unit.label.replace(/\s*\(.*\)/, "") || unit.unitId;
}

export function IsometricRackMap({
  racks,
  cooling,
  selected,
  onSelect,
  zoom,
}: IsometricRackMapProps) {
  return (
    <svg
      className="facility-scene"
      viewBox="0 0 960 590"
      role="group"
      aria-label="Isometric facility plan with twelve selectable racks and two cooling units"
    >
      <defs>
        <pattern id="floor-grid-ao02" width="66" height="38" patternUnits="userSpaceOnUse">
          <path d="M0 19 33 0 66 19 33 38Z" fill="none" stroke="var(--line)" strokeWidth=".65" />
        </pattern>
      </defs>

      <g transform={`translate(${460 * (1 - zoom)} ${300 * (1 - zoom)}) scale(${zoom})`}>
        <path d="M70 292 405 99 864 365 530 558Z" fill="url(#floor-grid-ao02)" stroke="var(--line)" />
        <path
          d="M69 312 529 579 864 386"
          fill="none"
          stroke="var(--line)"
          strokeDasharray="3 5"
        />
        <text x="355" y="565" className="diagram-label">
          SOUTH / SERVICE AISLE
        </text>

        {cooling[0] && (
          <g className="cooling-unit" transform="translate(330 120)">
            <path d="M0 0 110 64 145 44 35 -20Z M0 0V-38L35 -58 145 6V44 M0 -38 110 26 145 6 M110 26V64" />
            <circle
              cx="-2"
              cy="-79"
              r="2.1"
              className="status-dot"
              style={{ color: STATUS_COLOR[cooling[0].status] }}
            />
            <text x="5" y="-75">
              {shortCoolingLabel(cooling[0])}
            </text>
            <text x="5" y="-64" className="cooling-reading">
              {cooling[0].supplyTempCelsius.toFixed(1)}°C · {cooling[0].fanSpeedRpm} RPM
            </text>
          </g>
        )}

        {racks.map((rack, index) => {
          const position = rackPosition(rack.rackId, index);
          const isSelected = selected === rack.rackId;
          const statusClass = STATUS_CLASS[rack.status] ?? "rack-healthy";

          return (
            <g
              key={rack.rackId}
              transform={`translate(${position.x} ${position.y})`}
              className={`rack ${statusClass} ${isSelected ? "selected" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${rack.rackId}; worst utilization ${fmtPct(
                rack.worstUtilizationPct,
              )}; ${rack.incidentCount} open incidents`}
              aria-pressed={isSelected}
              onClick={() => onSelect(rack.rackId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(rack.rackId);
                }
              }}
            >
              <title>
                {rack.rackId} · {fmtPct(rack.worstUtilizationPct)} ·{" "}
                {rack.powerLoadKw.toFixed(1)}/{rack.maxPowerKw} kW · {rack.incidentCount} incidents
              </title>
              <path className="rack-footprint" d="M-7 4 38 30 77 7 32 -19Z" />
              <g className="rack-body">
                <path className="rack-side" d="M37 -88 70 -107V8L37 27Z" />
                <path className="rack-face" d="M0 -110 37 -88V27L0 5Z" />
                <path className="rack-top" d="M0 -110 33 -129 70 -107 37 -88Z" />
                {Array.from({ length: 7 }, (_, slot) => (
                  <g key={slot} transform={`translate(5 ${-96 + slot * 13})`}>
                    <path d="M0 0 26 15V24L0 9Z" fill="none" />
                    <path d="M4 6 17 13" />
                    <circle cx="22" cy="17" r="1" fill="currentColor" stroke="none" />
                  </g>
                ))}
                <path d="M44 -78 62 -89M44 -69 62 -80M44 -60 62 -71" fill="none" />
                <circle cx="8" cy="-148" r="2.2" className="status-dot" />
                <text x="15" y="-145" className="rack-name">
                  {rack.rackId}
                </text>
                <text x="15" y="-134" className="rack-reading">
                  {fmtPct(rack.worstUtilizationPct, 0)}
                </text>
              </g>
            </g>
          );
        })}

        {cooling[1] && (
          <g className="cooling-unit" transform="translate(640 486)">
            <path d="M0 0 74 43 110 22 36 -21Z M0 0V-36L36 -57 110 -14V22 M0 -36 74 7 110 -14 M74 7V43" />
            <circle
              cx="-20"
              cy="67"
              r="2.1"
              className="status-dot"
              style={{ color: STATUS_COLOR[cooling[1].status] }}
            />
            <text x="-12" y="71">
              {shortCoolingLabel(cooling[1])}
            </text>
            <text x="-12" y="82" className="cooling-reading">
              {cooling[1].supplyTempCelsius.toFixed(1)}°C · {cooling[1].fanSpeedRpm} RPM
            </text>
          </g>
        )}
      </g>

      <g className="orientation" transform="translate(70 480)">
        <path d="M0 35V0L-5 9M0 0 5 9M0 35 25 50M0 35 -25 50" fill="none" />
        <text x="-4" y="-10">
          N
        </text>
      </g>
    </svg>
  );
}
