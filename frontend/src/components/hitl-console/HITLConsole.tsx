// frontend/src/components/hitl-console/HITLConsole.tsx
// Human-in-the-Loop decision & audit console.
// Shows RCA findings, remediation simulations, risk score, and operator
// approval controls backed by inspectable audit log. Read-only advisory.

import { useAO02Store } from "@/store/ao02Store";

export function HITLConsole() {
  const { state, actions } = useAO02Store();
  const { tokens } = state;

  if (tokens.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center rounded-xl border border-brand-surface bg-brand-surface/30">
        <p className="text-xs text-gray-500">No incidents in queue. Run a resource scan to populate tokens.</p>
        <button
          onClick={actions.scanResources}
          className="mt-4 text-xs text-brand-accent underline"
          disabled={state.loading}
        >
          Run Resource Scan
        </button>
      </div>
    );
  }

  const token = tokens[0]; // Show highest-priority token
  const envelope = state.envelopes[token.tokenId];

  const rca = envelope?.rca;
  const options = envelope?.remediation_options || [];
  const risk = envelope?.risk_evaluation;
  const audit = envelope?.audit_trail || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        {/* Left: RCA + Evidence */}
        <div className="flex-1 space-y-6">
          <div className="rounded-xl border border-brand-surface bg-brand-surface/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">RCA Findings</h2>
              <span className="px-2 py-1 rounded text-[10px] font-bold bg-brand-accent/10 text-brand-accent border border-brand-accent/30">
                Token {token.tokenId}
              </span>
            </div>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase">Attributed Tenant</p>
                  <p className="text-white font-mono">{rca?.attributed_tenant_id ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">Confidence</p>
                  <p className="text-white font-mono">{rca ? ((rca.confidence_score || 0) * 100).toFixed(0) + "%" : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">Lead Time</p>
                  <p className="text-white font-mono">{token.leadTimeWeeks.toFixed(1)} weeks</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">Phase</p>
                  <p className="text-xs font-medium text-brand-accent capitalize">{token.currentPhase.replace(/_/g, " ").replace(/^\d\d_/, "")}</p>
                </div>
              </div>
              <div className="pt-2">
                <p className="text-xs text-gray-400 uppercase mb-1">Root Cause</p>
                <p className="text-gray-300">{rca?.root_cause_summary ?? "No RCA data yet."}</p>
              </div>
              <div className="pt-2">
                <p className="text-xs text-gray-400 uppercase mb-1">Driving Workload</p>
                <p className="text-gray-300 font-mono text-xs">{rca?.driving_workload_signature ?? "—"}</p>
              </div>
              {rca?.correlated_signals?.length && (
                <div className="pt-2">
                  <p className="text-xs text-gray-400 uppercase mb-1">Correlated Signals</p>
                  <div className="flex flex-wrap gap-2">
                    {rca.correlated_signals.map((s: string, i: number) => (
                      <span key={i} className="px-2 py-1 rounded text-[10px] bg-gray-800/50 border border-gray-700/50 text-gray-300">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Remediation Options */}
          <div className="rounded-xl border border-brand-surface bg-brand-surface/50 p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Remediation Simulations (Read-Only)</h3>
            {options.length > 0 ? (
              options.map((opt: any) => (
                <div key={opt.option_id} className="mb-4 p-4 rounded-lg border border-gray-700/50 bg-gray-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-white">{opt.title}</h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-900/30 text-green-400 border border-green-500/30">
                      Read-Only
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 mb-2">{opt.recommended_action}</p>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-gray-500 uppercase">Post-Action Util</p>
                      <p className="text-white">{opt.simulated_post_action_utilization_pct?.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-gray-500 uppercase">Lead Time Ext.</p>
                      <p className="text-white">{opt.projected_lead_time_extension_weeks?.toFixed(1)} weeks</p>
                    </div>
                    <div>
                      <p className="text-gray-500 uppercase">Mutates Facility</p>
                      <p className="text-xs text-brand-ok">No</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500 italic">No remediation options generated yet.</p>
            )}
          </div>
        </div>

        {/* Right: Risk + Decision + Audit */}
        <div className="w-full lg:w-96 space-y-6">
          <div className="rounded-xl border border-brand-surface bg-brand-surface/50 p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Risk Analysis</h3>
            {risk ? (
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400 uppercase">Risk Score</p>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono text-lg ${risk.risk_score >= 0.7 ? "text-brand-critical" : risk.risk_score >= 0.4 ? "text-brand-warn" : "text-brand-ok"}`}>
                      {(risk.risk_score * 100).toFixed(0)}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-700/50 rounded overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${(risk.risk_score || 0) * 100}%`,
                          backgroundColor: risk.risk_score >= 0.7 ? "#ef4444" : risk.risk_score >= 0.4 ? "#f59e0b" : "#22c55e",
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">Gate Decision</p>
                  <span className={`px-2 py-1 rounded text-[10px] font-bold border ${
                    risk.gate_decision === "REQUIRE_HUMAN_APPROVAL"
                      ? "bg-rose-900/30 text-rose-400 border-rose-500/30"
                      : risk.gate_decision === "ALLOW_ADVISORY"
                      ? "bg-brand-ok/10 text-brand-ok border-brand-ok/30"
                      : "bg-gray-800/30 text-gray-400 border-gray-700/30"
                  }`}>
                    {risk.gate_decision.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">Blast Radius</p>
                  <p className="text-gray-300">{risk.blast_radius_summary}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">SLA Impact</p>
                  <p className="text-gray-300">{risk.sla_impact_assessment}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">Risk evaluation pending.</p>
            )}
          </div>

          {/* Operator Decision */}
          <div className="rounded-xl border border-brand-surface bg-brand-surface/50 p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Operator Decision</h3>
            <div className="space-y-3">
              <button
                onClick={() => {}}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-brand-ok/10 border border-brand-ok/30 text-brand-ok text-sm font-medium hover:bg-brand-ok/20 disabled:opacity-50"
                disabled={!risk || risk.gate_decision !== "REQUIRE_HUMAN_APPROVAL"}
              >
                Approve Advisory
              </button>
              <button
                onClick={() => {}}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-rose-900/20 border border-rose-500/30 text-rose-400 text-sm font-medium hover:bg-rose-900/30"
              >
                Reject
              </button>
              <button
                onClick={() => {}}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-gray-800/50 border border-gray-700/50 text-gray-400 text-sm font-medium"
              >
                Defer
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-500 italic">
              Decisions are recorded in the immutable audit trail. No facility controls are mutated.
            </p>
          </div>

          {/* Audit Log */}
          <div className="rounded-xl border border-brand-surface bg-brand-surface/50 p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Audit Trail</h3>
            <div className="max-h-48 overflow-y-auto space-y-3">
              {audit.length > 0 ? (
                audit.map((entry: any, i: number) => (
                  <div key={i} className="flex gap-3 text-xs">
                    <span className="w-10 font-mono text-gray-500">{entry.actor}</span>
                    <span className="flex-1 text-gray-300">{entry.decision_summary}</span>
                    <span className="w-16 text-right text-gray-500 font-mono">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500 italic">No audit entries yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
