// frontend/src/components/queue-visualizer/TokenQueueVisualizer.tsx
// Live priority queue visualizer showing IncidentTokens moving through
// the 6-phase pipeline. Decoupled from backend; colors from Tailwind tokens.

import { useAO02Store } from "@/store/ao02Store";

const PHASE_LABELS: Record<string, string> = {
  "01_RESOURCE_MONITORING": "Monitoring",
  "02_INCIDENT_REPORTING": "Incident Reporting",
  "03_ROOT_CAUSE_ANALYSIS": "RCA",
  "04_REMEDIATION_CHECKING": "Remediation",
  "05_RISK_ANALYSIS": "Risk Analysis",
  "06_HUMAN_VERIFICATION": "Human Verification",
  "07_RESOLVED": "Resolved",
  "99_HALTED_LOOP_GUARD": "Halted (Loop Guard)",
};

const PHASE_COLORS: Record<string, string> = {
  "01_RESOURCE_MONITORING": "text-brand-accent",
  "02_INCIDENT_REPORTING": "text-blue-400",
  "03_ROOT_CAUSE_ANALYSIS": "text-purple-400",
  "04_REMEDIATION_CHECKING": "text-emerald-400",
  "05_RISK_ANALYSIS": "text-amber-400",
  "06_HUMAN_VERIFICATION": "text-rose-400",
  "07_RESOLVED": "text-brand-ok",
  "99_HALTED_LOOP_GUARD": "text-gray-400",
};

export function TokenQueueVisualizer() {
  const { state, actions } = useAO02Store();
  const { tokens } = state;

  const ordered = [...tokens].sort((a, b) => a.priorityNumber - b.priorityNumber);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white mb-4">Live Priority Queue</h2>
          <p className="text-xs text-gray-500 mb-4">
            Tokens ordered by priority number (lower = higher urgency). Hop count enforces loop guard (max 8).
          </p>
          <div className="rounded-xl border border-brand-surface bg-brand-surface/50 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-brand-surface bg-brand-dark/30">
                  <th className="px-4 py-3 text-gray-400 font-semibold uppercase">Token</th>
                  <th className="px-4 py-3 text-gray-400 font-semibold uppercase">Priority</th>
                  <th className="px-4 py-3 text-gray-400 font-semibold uppercase">Rack / Tenant</th>
                  <th className="px-4 py-3 text-gray-400 font-semibold uppercase">Resource</th>
                  <th className="px-4 py-3 text-gray-400 font-semibold uppercase">Phase</th>
                  <th className="px-4 py-3 text-gray-400 font-semibold uppercase">Util</th>
                  <th className="px-4 py-3 text-gray-400 font-semibold uppercase">Lead Time</th>
                  <th className="px-4 py-3 text-gray-400 font-semibold uppercase">Hops</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-surface/30">
                {ordered.map((t) => (
                  <tr key={t.tokenId} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-brand-accent">{t.tokenId}</td>
                    <td className="px-4 py-3 font-bold">{`T${t.priorityNumber}`}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {t.rackId} / {t.tenantId}
                    </td>
                    <td className="px-4 py-3 text-gray-300 capitalize">{t.resourceType.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${PHASE_COLORS[t.currentPhase] ?? "text-gray-400"} border-current`}>
                        {PHASE_LABELS[t.currentPhase] ?? t.currentPhase}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{t.utilizationPct.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-gray-300 font-mono">{t.leadTimeWeeks.toFixed(1)} w</td>
                    <td className="px-4 py-3 text-gray-300 font-mono">{t.hopCount}/{t.maxAllowedHops ?? 8}</td>
                  </tr>
                ))}
                {ordered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No active tokens in queue
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="w-full lg:w-72 space-y-4">
          <div className="p-4 rounded-xl border border-brand-surface bg-brand-surface/50">
            <h3 className="text-xs font-medium text-gray-400 uppercase mb-3">Queue Controls</h3>
            <button
              onClick={actions.scanResources}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded bg-brand-accent/10 border border-brand-accent/50 text-brand-accent text-sm font-medium hover:bg-brand-accent/20 transition-colors disabled:opacity-50"
              disabled={state.loading}
            >
              {state.loading ? "Scanning..." : "Run Resource Scan"}
            </button>
          </div>
          <div className="p-4 rounded-xl border border-brand-surface bg-brand-surface/50">
            <h3 className="text-xs font-medium text-gray-400 uppercase mb-3">How It Works</h3>
            <ul className="text-xs text-gray-400 space-y-2 list-disc pl-4">
              <li>Monitoring agent mints IncidentToken on breach</li>
              <li>Token enqueued by priority number (min-heap)</li>
              <li>Hop count increments per agent transition</li>
              <li>Max 8 hops triggers loop guard halt</li>
              <li>Tenant isolation enforced per access</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
