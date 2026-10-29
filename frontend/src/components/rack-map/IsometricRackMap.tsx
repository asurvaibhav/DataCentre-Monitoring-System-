// 2.5D isometric facility plan with animated cooling systems and pipeline networks.
// Pure presentation: live telemetry arrives from the facility hook.

import type { CoolingUnitNode, RackSpatialNode, SeverityStatus } from "@/types/ao02";
import { fmtPct } from "@/lib/format";

interface IsometricRackMapProps {
  racks: RackSpatialNode[];
  cooling: CoolingUnitNode[];
  selected: string | null;
  onSelect: (rackId: string) => void;
  onSelectCooling?: (unitId: string) => void;
  zoom: number;
}

const STATUS_CLASS: Record<SeverityStatus, string> = {
  HEALTHY: "rack-healthy",
  WARNING: "rack-warning",
  CRITICAL: "rack-critical",
};

const STATUS_COLOR: Record<SeverityStatus, string> = {
  HEALTHY: "#34765f",
  WARNING: "#8a5a2b",
  CRITICAL: "#a33a2f",
};

function rackPosition(rackId: string, index: number): { x: number; y: number } {
  const number = Number(rackId.replace(/\D/g, "")) || index + 1;
  const slot = Math.max(0, number - 1);
  const row = Math.floor(slot / 3);
  const col = slot % 3;
  return {
    x: 370 + col * 115 - row * 76,
    y: 185 + col * 66 + row * 44,
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
  onSelectCooling,
  zoom,
}: IsometricRackMapProps) {
  // SVG paints later siblings on top: draw the nearest floor positions last.
  const positionedRacks = racks
    .map((rack, index) => ({ rack, position: rackPosition(rack.rackId, index) }))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

  return (
    <svg
      className="facility-scene"
      viewBox="0 0 960 590"
      role="group"
      aria-label="Isometric facility plan with active cooling systems, pipelines and server racks"
    >
      <defs>
        <pattern id="floor-grid-ao02" width="66" height="38" patternUnits="userSpaceOnUse">
          <path d="M0 19 33 0 66 19 33 38Z" fill="none" stroke="var(--line)" strokeWidth=".65" />
        </pattern>
        <pattern id="perforated-tile" width="16" height="10" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="5" r="0.9" fill="#94a3b8" opacity="0.6" />
          <circle cx="12" cy="5" r="0.9" fill="#94a3b8" opacity="0.6" />
        </pattern>
      </defs>

      <g transform={`translate(${460 * (1 - zoom)} ${300 * (1 - zoom)}) scale(${zoom})`}>
        {/* Raised Floor Base Plane */}
        <path
          d="M70 292 405 99 864 365 530 558Z"
          fill="url(#floor-grid-ao02)"
          stroke="var(--line)"
        />

        {/* Cold Aisle Perforated Floor Zones */}
        {/* Aisle 1 (between Row 0 and Row 1) */}
        <path
          d="M 335 210 L 630 380 L 615 388 L 320 218 Z"
          fill="url(#perforated-tile)"
          stroke="#94a3b8"
          strokeWidth="0.5"
          opacity="0.8"
        />
        {/* Aisle 2 (between Row 2 and Row 3) */}
        <path
          d="M 183 298 L 478 468 L 463 476 L 168 306 Z"
          fill="url(#perforated-tile)"
          stroke="#94a3b8"
          strokeWidth="0.5"
          opacity="0.8"
        />

        {/* Floor Guidance Perimeter & Service Aisles */}
        <path
          d="M69 312 529 579 864 386"
          fill="none"
          stroke="var(--line)"
          strokeDasharray="3 5"
        />
        <text x="355" y="570" className="diagram-label">
          SOUTH / SERVICE CORRIDOR & CHW MAIN
        </text>
        <text x="680" y="380" className="diagram-label" transform="rotate(30 680 380)">
          EAST COOLING & CDU ZONE
        </text>

        {/* ================================================================= */}
        {/* COOLING PIPELINE NETWORK (CREATIVE 2.5D ISOMETRIC PIPING)         */}
        {/* ================================================================= */}

        {/* CHWS: Primary Chilled Water Supply Header Pipe (Cold Blue) */}
        <g className="pipeline-layer">
          {/* Main Supply Header from CRAC Unit A across North wall to CRAC Unit B */}
          <path
            d="M 310 100 L 440 25 L 750 205 L 710 228"
            className="pipe-chws-main"
          />
          <path
            d="M 310 100 L 440 25 L 750 205 L 710 228"
            className="pipe-chws-flow"
          />

          {/* Supply Trunk running South-East to CDU / Pumps */}
          <path
            d="M 750 205 L 750 310 L 670 356 L 670 430"
            className="pipe-chws-main"
          />
          <path
            d="M 750 205 L 750 310 L 670 356 L 670 430"
            className="pipe-chws-flow"
          />

          {/* Underfloor Supply Feeder 1 into Row 0 & Row 1 */}
          <path
            d="M 440 180 L 250 290 L 190 255"
            className="pipe-branch"
          />
          {/* Underfloor Supply Feeder 2 into Row 2 & Row 3 */}
          <path
            d="M 540 240 L 350 350 L 240 414"
            className="pipe-branch"
          />

          {/* CHWR: Return Water Pipeline (Warm Teal / Return Loop) */}
          <path
            d="M 330 90 L 450 20 L 765 200 L 765 320 L 685 365 L 685 435"
            className="pipe-chwr-main"
          />
          <path
            d="M 330 90 L 450 20 L 765 200 L 765 320 L 685 365 L 685 435"
            className="pipe-chwr-flow"
          />

          {/* Pipeline Technical Labels & Flow Tags */}
          <g transform="translate(560 115)">
            <rect x="0" y="0" width="105" height="15" rx="3" fill="#1e293b" opacity="0.85" />
            <text x="6" y="11" fill="#63b3ed" fontSize="8" fontFamily="var(--font-mono)">
              CHWS · 6.4°C · 4.2 BAR
            </text>
          </g>
          <g transform="translate(685 295)">
            <rect x="0" y="0" width="105" height="15" rx="3" fill="#1e293b" opacity="0.85" />
            <text x="6" y="11" fill="#81e6d9" fontSize="8" fontFamily="var(--font-mono)">
              CHWR · 13.8°C · 185 GPM
            </text>
          </g>

          {/* Manual / Auto Isolation Valves with Turn-Wheels */}
          <g transform="translate(670 356)">
            <circle cx="0" cy="0" r="4.5" fill="#c05621" stroke="#fff" strokeWidth="0.8" />
            <line x1="-3" y1="0" x2="3" y2="0" stroke="#fff" strokeWidth="1" />
            <line x1="0" y1="-3" x2="0" y2="3" stroke="#fff" strokeWidth="1" />
          </g>
          <g transform="translate(750 250)">
            <circle cx="0" cy="0" r="4.5" fill="#c05621" stroke="#fff" strokeWidth="0.8" />
            <line x1="-3" y1="0" x2="3" y2="0" stroke="#fff" strokeWidth="1" />
            <line x1="0" y1="-3" x2="0" y2="3" stroke="#fff" strokeWidth="1" />
          </g>
        </g>

        {/* ================================================================= */}
        {/* CDU / CHILLED WATER DISTRIBUTION UNIT & DUAL PUMP STATION         */}
        {/* (Fills the previously empty South-East quadrant!)                 */}
        {/* ================================================================= */}
        <g
          className="cooling-distribution-hub"
          transform="translate(610 425)"
          role="group"
          aria-label="Chilled Water Distribution Hub and Circulation Pumps"
        >
          {/* Base Platform */}
          <path
            d="M 0 0 L 95 55 L 140 29 L 45 -26 Z"
            fill="#cbd5e1"
            stroke="#64748b"
            strokeWidth="0.8"
          />

          {/* CDU Main Housing Enclosure */}
          <g transform="translate(15 0)">
            {/* Top */}
            <path d="M 0 -35 L 45 -61 L 95 -32 L 50 -6 Z" fill="#f8fafc" stroke="#475569" />
            {/* Front */}
            <path d="M 0 0 L 50 28 V -6 L 0 -35 Z" fill="#e2e8f0" stroke="#475569" />
            {/* Side */}
            <path d="M 50 28 L 95 -2 V -32 L 50 -6 Z" fill="#cbd5e1" stroke="#475569" />

            {/* Front Panel Ventilation Slots */}
            <line x1="12" y1="-20" x2="38" y2="-5" stroke="#94a3b8" strokeWidth="1" />
            <line x1="12" y1="-14" x2="38" y2="1" stroke="#94a3b8" strokeWidth="1" />
            <line x1="12" y1="-8" x2="38" y2="7" stroke="#94a3b8" strokeWidth="1" />

            {/* Status Indicator */}
            <circle cx="42" cy="-22" r="2.5" className="pipe-pump-active" />
            <text x="-5" y="-48" fill="#1e293b" fontSize="9" fontFamily="var(--font-mono)" fontWeight="600">
              CDU-01
            </text>
            <text x="-5" y="-38" fill="#64748b" fontSize="8" fontFamily="var(--font-mono)">
              4.2 BAR · 185 GPM
            </text>
          </g>

          {/* Dual Centrifugal Circulation Pumps (PUMP-A & PUMP-B) */}
          <g transform="translate(85 20)">
            {/* Pump A */}
            <ellipse cx="12" cy="0" rx="9" ry="5" fill="#334155" stroke="#1e293b" />
            <rect x="7" y="-12" width="10" height="12" rx="2" fill="#475569" stroke="#1e293b" />
            <circle cx="12" cy="-6" r="1.5" className="pipe-pump-active" />

            {/* Pump B */}
            <ellipse cx="34" cy="-12" rx="9" ry="5" fill="#334155" stroke="#1e293b" />
            <rect x="29" y="-24" width="10" height="12" rx="2" fill="#475569" stroke="#1e293b" />
            <circle cx="34" cy="-18" r="1.5" className="pipe-pump-active" />

            <text x="0" y="16" fill="#475569" fontSize="7.5" fontFamily="var(--font-mono)">
              PUMP A/B · 1750 RPM
            </text>
          </g>

          {/* Pressurized Buffer Tank (TK-01) */}
          <g transform="translate(-15 -10)">
            <ellipse cx="0" cy="0" rx="10" ry="6" fill="#94a3b8" stroke="#475569" />
            <path d="M -10 0 V -30 C -10 -35 10 -35 10 -30 V 0 Z" fill="#cbd5e1" stroke="#475569" />
            <ellipse cx="0" cy="-30" rx="10" ry="6" fill="#e2e8f0" stroke="#475569" />
            <line x1="0" y1="-24" x2="0" y2="-6" stroke="#0284c7" strokeWidth="2" strokeDasharray="2 2" className="tank-level" />
            <text x="-65" y="-20" fill="#475569" fontSize="7" fontFamily="var(--font-mono)">
              TK-01 EXPANSION
            </text>
          </g>
        </g>

        {/* ================================================================= */}
        {/* CRAC UNIT A (NORTH SERVICE BAY)                                   */}
        {/* ================================================================= */}
        {cooling[0] && (
          <g
            className="cooling-unit cursor-pointer"
            transform="translate(330 115)"
            onClick={() => onSelectCooling?.(cooling[0].unitId)}
          >
            <path d="M0 0 110 64 145 44 35 -20Z M0 0V-38L35 -58 145 6V44 M0 -38 110 26 145 6 M110 26V64" />
            {/* Cooling Intake Grille & Louvers */}
            <line x1="20" y1="-10" x2="90" y2="30" stroke="#a0aec0" strokeWidth="1" />
            <line x1="20" y1="-2" x2="90" y2="38" stroke="#a0aec0" strokeWidth="1" />
            <line x1="20" y1="6" x2="90" y2="46" stroke="#a0aec0" strokeWidth="1" />

            <circle
              cx="182"
              cy="-74"
              r="2.5"
              className="status-dot"
              style={{ color: STATUS_COLOR[cooling[0].status] }}
            />
            <text x="190" y="-70" fontWeight="600">
              {shortCoolingLabel(cooling[0])}
            </text>
            <text x="190" y="-59" className="cooling-reading">
              {cooling[0].supplyTempCelsius.toFixed(1)}°C · {cooling[0].fanSpeedRpm} RPM · PRIMARY
            </text>
          </g>
        )}

        {/* ================================================================= */}
        {/* CRAC UNIT B (EAST CORRIDOR - PROPERLY ALIGNED SIGHTLINE)           */}
        {/* ================================================================= */}
        {cooling[1] && (
          <g
            className="cooling-unit cursor-pointer"
            transform="translate(635 235)"
            onClick={() => onSelectCooling?.(cooling[1].unitId)}
          >
            <path d="M0 0 110 64 145 44 35 -20Z M0 0V-38L35 -58 145 6V44 M0 -38 110 26 145 6 M110 26V64" />
            {/* Cooling Intake Grille & Louvers */}
            <line x1="20" y1="-10" x2="90" y2="30" stroke="#a0aec0" strokeWidth="1" />
            <line x1="20" y1="-2" x2="90" y2="38" stroke="#a0aec0" strokeWidth="1" />
            <line x1="20" y1="6" x2="90" y2="46" stroke="#a0aec0" strokeWidth="1" />

            {/* Clean, correctly-placed header typography aligned above unit */}
            <circle
              cx="112"
              cy="-84"
              r="2.5"
              className="status-dot"
              style={{ color: STATUS_COLOR[cooling[1].status] }}
            />
            <text x="120" y="-80" fontWeight="600">
              {shortCoolingLabel(cooling[1])}
            </text>
            <text x="120" y="-69" className="cooling-reading">
              {cooling[1].supplyTempCelsius.toFixed(1)}°C · {cooling[1].fanSpeedRpm} RPM · SECONDARY
            </text>
          </g>
        )}

        {/* Airflow stays on the floor plane and moves toward the cold aisles. */}
        <g className="cooling-airflow" fill="none" stroke="#5a9da5" strokeWidth="1.6" strokeDasharray="3 9" opacity="0.55" pointerEvents="none">
          <path d="M440 190 390 219 335 250" />
          <path d="M660 320 565 375 470 430" />
          <path d="M390 285 310 331 230 377" />
        </g>

        {/* Overhead Cable & Coolant Suspension Trays */}
        <g className="overhead-trays" opacity="0.65">
          {Array.from({ length: Math.ceil(racks.length / 3) }, (_, row) => {
            const position = rackPosition("", row * 3);
            return (
              <line
                key={row}
                x1={position.x + 33}
                y1={position.y - 129}
                x2={position.x + 263}
                y2={position.y + 3}
                stroke="#a0aec0"
                strokeWidth="1.2"
                strokeDasharray="4 3"
              />
            );
          })}
        </g>

        {/* ================================================================= */}
        {/* SERVER RACKS (12 ISOMETRIC RACKS WITH INTERACTION)                */}
        {/* ================================================================= */}
        {positionedRacks.map(({ rack, position }) => {
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
              <title>{`${rack.rackId} · ${fmtPct(rack.worstUtilizationPct)} · ${rack.powerLoadKw.toFixed(1)}/${rack.maxPowerKw} kW · ${rack.incidentCount} incidents`}</title>
              <path className="rack-footprint" d="M-7 4 38 30 77 7 32 -19Z" />
              <g className="rack-body">
                <path className="rack-side" d="M37 -88 70 -107V8L37 27Z" />
                <path className="rack-face" d="M0 -110 37 -88V27L0 5Z" />
                <path className="rack-top" d="M0 -110 33 -129 70 -107 37 -88Z" />
                {Array.from({ length: 7 }, (_, slot) => (
                  <g key={slot} transform={`translate(5 ${-96 + slot * 13})`}>
                    <path d="M0 0 26 15V24L0 9Z" fill="none" />
                    <path d="M4 6 17 13" />
                    <circle cx="22" cy="17" r="1.3" fill="currentColor" stroke="none" className="server-led" style={{ animationDelay: `${slot * -0.37 - position.y / 300}s` }} />
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
      </g>

      {/* Compass / Orientation Indicator */}
      <g className="orientation" transform="translate(70 480)">
        <path d="M0 35V0L-5 9M0 0 5 9M0 35 25 50M0 35 -25 50" fill="none" />
        <text x="-4" y="-10">
          N
        </text>
      </g>
    </svg>
  );
}
