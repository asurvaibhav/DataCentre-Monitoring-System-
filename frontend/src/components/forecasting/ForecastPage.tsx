// frontend/src/components/forecasting/ForecastPage.tsx
// Forecasting & Attribution Workbench page.

import { useAO02Store } from "@/store/ao02Store";
import { useState } from "react";
import { ForecastChart } from "./ForecastChart";

const RESOURCES = [
  { label: "Storage", value: "STORAGE" },
  { label: "Power", value: "POWER" },
  { label: "Thermal/Cooling", value: "THERMAL_COOLING" },
  { label: "Network", value: "NETWORK" },
  { label: "VM Compute", value: "VM_COMPUTE" },
  { label: "Software License", value: "SOFTWARE_LICENSE" },
];

export function ForecastPage() {
  const { state } = useAO02Store();
  const [selection, setSelection] = useState<{ rackId: string; tenantId: string; resourceType: string }>({
    rackId: "R-04",
    tenantId: "T1",
    resourceType: "STORAGE",
  });

  const tokens = state.tokens;
  const relevant = tokens.find(
    (t) => t.rackId === selection.rackId && t.resourceType === selection.resourceType
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white mb-4">Forecasting & Attribution Workbench</h2>
          <ForecastChart
            rackId={selection.rackId}
            tenantId={selection.tenantId}
            resourceType={selection.resourceType}
          />
        </div>
        <div className="w-full lg:w-72 space-y-4">
          <div className="p-4 rounded-xl border border-brand-surface bg-brand-surface/50">
            <h3 className="text-xs font-medium text-gray-400 uppercase mb-3">Resource Selector</h3>
            <div className="space-y-2">
              {RESOURCES.map((r) => (
                <button
                  key={r.value}
                  onClick={() =>
                    setSelection((s) => ({ ...s, resourceType: r.value }))
                  }
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    selection.resourceType === r.value
                      ? "bg-brand-accent/20 text-brand-accent border border-brand-accent/50"
                      : "text-gray-400 hover:text-white hover:bg-brand-surface/30"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {relevant && (
            <div className="p-4 rounded-xl border border-brand-surface bg-brand-surface/50">
              <h3 className="text-xs font-medium text-gray-400 uppercase mb-3">Forecast Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Lead Time</span>
                  <span className="text-white font-mono">{relevant.leadTimeWeeks?.toFixed(1) ?? "--"} weeks</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Utilization</span>
                  <span className="text-white font-mono">{relevant.utilizationPct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Phase</span>
                  <span className="text-xs font-medium text-brand-accent capitalize">{relevant.currentPhase.replace(/_/g, " ").replace(/\d\d_/, "")}</span>
                </div>
              </div>
            </div>
          )}
          {relevant && relevant.utilizationPct >= 90 && (
            <div className="p-4 rounded-xl border border-brand-critical/30 bg-brand-critical/10">
              <h3 className="text-xs font-semibold text-brand-critical uppercase mb-2">⚠ Exhaustion Risk</h3>
              <p className="text-sm text-gray-300">
                {relevant.rackId} is projected to exhaust capacity. Review the RCA and remediation options in the HITL Console.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
