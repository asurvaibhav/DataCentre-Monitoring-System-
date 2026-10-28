// Priority queue visualizer: queued tokens, tokens awaiting human verification,
// and recent history. Rows open the incident in the HITL console.

import { useMemo, useState } from "react";

import { SeverityBadge } from "@/components/common/SeverityBadge";
import { useAO02Store } from "@/store/ao02Store";
import { fmtDateTime, fmtPct, fmtWeeks, phaseLabel } from "@/lib/format";
import type { IncidentTokenDTO } from "@/types/ao02";

interface TokenQueueVisualizerProps {
  onNavigate?: (page: "rack-map" | "queue" | "forecast" | "hitl") => void;
}

type Tab = "queued" | "pending" | "history";

function severityFor(token: IncidentTokenDTO): "HEALTHY" | "WARNING" | "CRITICAL" {
  if (token.utilizationPct >= 95) return "CRITICAL";
  if (token.utilizationPct >= 85) return "WARNING";
  return "HEALTHY";
}

function UtilizationBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    clamped >= 95 ? "bg-brand-critical" : clamped >= 85 ? "bg-brand-warn" : "bg-brand-ok";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="tabular-nums text-slate-300">{fmtPct(value)}</span>
    </div>
  );
}

function TokenTable({
  tokens,
  emptyMessage,
  onSelect,
}: {
  tokens: IncidentTokenDTO[];
  emptyMessage: string;
  onSelect: (tokenId: string) => void;
}) {
  if (tokens.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs text-slate-500">{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-left text-xs">
        <thead className="text-slate-500">
          <tr className="border-b border-brand-surface/60">
            <th className="px-4 py-2 text-right font-medium">#</th>
            <th className="px-4 py-2 font-medium">Token</th>
            <th className="px-4 py-2 font-medium">Rack · Tenant</th>
            <th className="px-4 py-2 font-medium">Resource</th>
            <th className="px-4 py-2 font-medium">Utilization</th>
            <th className="px-4 py-2 font-medium">Lead time</th>
            <th className="px-4 py-2 font-medium">Confidence</th>
            <th className="px-4 py-2 font-medium">Hops</th>
            <th className="px-4 py-2 font-medium">Phase</th>
            <th className="px-4 py-2 font-medium">Flags</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-surface/40">
          {tokens.map((token) => (
            <tr
              key={token.tokenId}
              onClick={() => onSelect(token.tokenId)}
              className="cursor-pointer transition-colors hover:bg-brand-surface/40"
            >
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                {token.priorityNumber}
              </td>
              <td className="px-4 py-2.5">
                <div className="font-mono text-[11px] text-slate-200">{token.tokenId}</div>
                <div className="text-[10px] text-slate-500">{fmtDateTime(token.createdAt)}</div>
              </td>
              <td className="px-4 py-2.5">
                <div className="font-medium text-slate-200">{token.rackId}</div>
                <div className="text-[10px] text-slate-500">{token.tenantId}</div>
              </td>
              <td className="px-4 py-2.5 text-slate-300">
                {token.resourceType.replace(/_/g, " ")}
              </td>
              <td className="px-4 py-2.5">
                <UtilizationBar value={token.utilizationPct} />
              </td>
              <td className="px-4 py-2.5 tabular-nums text-slate-300">
                {fmtWeeks(token.leadTimeWeeks)}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-slate-300">
                {token.forecastConfidenceScore > 0
                  ? fmtPct(token.forecastConfidenceScore * 100, 0)
                  : "—"}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-slate-400">
                {token.hopCount}/{token.maxAllowedHops}
              </td>
              <td className="px-4 py-2.5">
                <SeverityBadge
                  status={
                    token.awaitingHumanVerification
                      ? "WARNING"
                      : token.currentPhase === "07_RESOLVED"
                        ? "HEALTHY"
                        : token.currentPhase === "08_REJECTED_BY_OPERATOR"
                          ? "CRITICAL"
                          : severityFor(token)
                  }
                  label={phaseLabel(token.currentPhase)}
                />
              </td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {token.isTransientSpike && (
                    <span className="rounded bg-brand-warn/10 px-1.5 py-0.5 text-[10px] text-brand-warn">
                      spike
                    </span>
                  )}
                  {token.regimeChangeDetected && (
                    <span className="rounded bg-violet-400/10 px-1.5 py-0.5 text-[10px] text-violet-300">
                      regime
                    </span>
                  )}
                  {token.humanApproved === true && (
                    <span className="rounded bg-brand-ok/10 px-1.5 py-0.5 text-[10px] text-brand-ok">
                      approved
                    </span>
                  )}
                  {token.humanApproved === false && (
                    <span className="rounded bg-brand-critical/10 px-1.5 py-0.5 text-[10px] text-brand-critical">
                      rejected
                    </span>
                  )}
                  {!token.isTransientSpike &&
                    !token.regimeChangeDetected &&
                    token.humanApproved === null && (
                      <span className="text-[10px] text-slate-600">—</span>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TokenQueueVisualizer({ onNavigate }: TokenQueueVisualizerProps) {
  const { state, actions } = useAO02Store();
  const [tab, setTab] = useState<Tab>("queued");

  const queued = useMemo(
    () => [...state.tokens].sort((a, b) => a.priorityNumber - b.priorityNumber),
    [state.tokens],
  );
  const pending = useMemo(
    () => [...state.pending].sort((a, b) => a.priorityNumber - b.priorityNumber),
    [state.pending],
  );

  const rows = tab === "queued" ? queued : tab === "pending" ? pending : state.history;

  const openToken = (tokenId: string) => {
    actions.selectToken(tokenId);
    onNavigate?.("hitl");
  };

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: "queued", label: "Queued", count: queued.length },
    { id: "pending", label: "Awaiting verification", count: pending.length },
    { id: "history", label: "History", count: state.history.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-surface bg-brand-surface/20 p-3">
        <button
          type="button"
          onClick={() => void actions.runPipeline()}
          disabled={state.loading.pipeline || queued.length === 0}
          className="rounded-lg border border-brand-accent/40 bg-brand-accent/10 px-3 py-2 text-xs font-medium text-brand-accent hover:bg-brand-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state.loading.pipeline ? "Running pipeline…" : "Run top-priority incident"}
        </button>
        <button
          type="button"
          onClick={() => void actions.scanResources()}
          disabled={state.loading.scan}
          className="rounded-lg border border-brand-surface bg-brand-surface/40 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-brand-surface/70 disabled:opacity-50"
        >
          {state.loading.scan ? "Scanning resources…" : "Scan resources"}
        </button>
        <button
          type="button"
          onClick={() => void actions.refreshAll()}
          disabled={state.loading.queue}
          className="rounded-lg border border-brand-surface bg-brand-surface/40 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-brand-surface/70 disabled:opacity-50"
        >
          Refresh
        </button>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
          <span>Priority 1 = highest</span>
          <span className="text-slate-700">·</span>
          <span>Max {queued[0]?.maxAllowedHops ?? 8} hops</span>
        </div>
      </div>

      <div className="rounded-xl border border-brand-surface bg-brand-surface/20">
        <div className="flex flex-wrap gap-1 border-b border-brand-surface px-3 pt-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-t-lg px-3 py-2 text-xs font-medium transition-colors ${
                tab === item.id
                  ? "border-b-2 border-brand-accent text-brand-accent"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {item.label}
              <span className="ml-2 rounded-full bg-brand-surface px-1.5 py-0.5 text-[10px] tabular-nums text-slate-300">
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <TokenTable
          tokens={rows}
          onSelect={openToken}
          emptyMessage={
            tab === "queued"
              ? "No tokens in the priority queue. Run a resource scan to detect breaches."
              : tab === "pending"
                ? "No incidents are waiting for operator verification."
                : "No processed incidents yet. Run a pipeline to create history."
          }
        />
      </div>

      {state.activity.length > 0 && (
        <div className="rounded-xl border border-brand-surface bg-brand-surface/20">
          <h2 className="border-b border-brand-surface px-4 py-3 text-sm font-semibold text-white">
            Agent activity
          </h2>
          <ul className="max-h-56 divide-y divide-brand-surface/40 overflow-y-auto text-xs">
            {state.activity.slice(0, 8).map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-2">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    entry.kind === "error"
                      ? "bg-brand-critical"
                      : entry.kind === "agent"
                        ? "bg-brand-accent"
                        : entry.kind === "human"
                          ? "bg-brand-ok"
                          : "bg-slate-500"
                  }`}
                />
                <span className="flex-1 text-slate-300">{entry.message}</span>
                <span className="shrink-0 tabular-nums text-[10px] text-slate-500">
                  {new Date(entry.at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
