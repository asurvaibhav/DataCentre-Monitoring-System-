// frontend/src/components/rack-map/RackMapPage.tsx
// Page that assembles rack map from store data.

import { useAO02Store } from "@/store/ao02Store";
import { IsometricRackMap } from "./IsometricRackMap";
import { MetricCard } from "@/components/common/MetricCard";
import { SeverityBadge } from "@/components/common/SeverityBadge";

const RACK_IDS = ["R-01", "R-02", "R-03", "R-04", "R-05", "R-06", "R-07", "R-08", "R-09", "R-10", "R-11", "R-12"];

export function RackMapPage() {
  const { state } = useAO02Store();
  const { tokens } = state;

  // Build spatial nodes from tokens (Step 4 baseline)
  const racks: any[] = RACK_IDS.map((rackId) => {
    const rackTokens = tokens.filter((t) => t.rackId === rackId);
    const critical = rackTokens.some((t) => t.utilizationPct >= 90);
    const warning = rackTokens.some((t) => t.utilizationPct >= 75);
    const status = critical ? "CRITICAL" : warning ? "WARNING" : "HEALTHY";
    const active = rackTokens[0];
    return {
      rackId,
      gridPosition: { row: 0, col: 0 },
      status,
      activeBadge: active?.resourceType,
      powerLoadKw: critical ? 78 : warning ? 55 : 40,
      maxPowerKw: 80,
      activeTokenIds: rackTokens.map((t) => t.tokenId),
    };
  });

  const cooling: any[] = [
    {
      unitId: "CRAC Unit A (North)",
      supplyTempCelsius: 13.2,
      fanSpeedRpm: 1422,
      status: "HEALTHY" as const,
    },
    {
      unitId: "CRAC Unit B (South)",
      supplyTempCelsius: 15.1,
      fanSpeedRpm: 1380,
      status: "WARNING" as const,
    },
  ];

  const avgUtil = tokens.length > 0 ? tokens.reduce((a, b) => a + b.utilizationPct, 0) / tokens.length : 0;
  const criticalCount = tokens.filter((t) => t.utilizationPct >= 90).length;
  const warningCount = tokens.filter((t) => t.utilizationPct >= 75 && t.utilizationPct < 90).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white mb-4">Spatial Data Center Floor</h2>
          <IsometricRackMap racks={racks} cooling={cooling} />
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-brand-critical" />
              Critical: {criticalCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-brand-warn" />
              Warning: {warningCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-brand-ok" />
              Healthy
            </span>
          </div>
        </div>
        <div className="w-full lg:w-64 space-y-4">
          <MetricCard title="Avg Utilization" value={`${avgUtil.toFixed(0)}%`} subtext="Across active tokens" />
          <MetricCard title="Critical Alerts" value={criticalCount} subtext="Immediate attention" trend="up" />
          <MetricCard title="Warnings" value={warningCount} subtext="Monitor closely" />
          <div className="p-4 rounded-xl border border-brand-surface bg-brand-surface/50">
            <h3 className="text-xs font-medium text-gray-400 uppercase mb-3">Active Bottlenecks</h3>
            {tokens.slice(0, 6).map((t) => (
              <div key={t.tokenId} className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm text-gray-300 truncate">
                  {t.rackId} • {t.resourceType} • {t.tenantId}
                </span>
                <SeverityBadge
                  status={t.utilizationPct >= 90 ? "CRITICAL" : t.utilizationPct >= 75 ? "WARNING" : "HEALTHY"}
                />
              </div>
            ))}
            {tokens.length === 0 && <p className="text-xs text-gray-500 italic">No active tokens</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
