// Priority queue visualizer: queued tokens, human-verification pending, history.

import { useMemo, useState } from "react";

import { SeverityBadge } from "@/components/common/SeverityBadge";
import { fmtDateTime, fmtPct, fmtWeeks, phaseLabel, severityFromUtilization } from "@/lib/format";
import { useAO02Store } from "@/store/ao02Store";
import type { IncidentTokenDTO, SeverityStatus } from "@/types/ao02";

interface TokenQueueVisualizerProps {
  onNavigate?: (page: "rack-map" | "queue" | "forecast" | "hitl") => void;
}

type Tab = "queued" | "pending" | "history";

const SEVERITY_COLOR: Record<SeverityStatus, string> = {
  HEALTHY: "#34765f",
  WARNING: "#8a5a2b",
  CRITICAL: "#a33a2f",
};

const SEVERITY_TEXT: Record<SeverityStatus, string> = {
  HEALTHY: "text-brand-accent",
  WARNING: "text-brand-warn",
  CRITICAL: "text-brand-critical",
};

function Utilization({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const severity = severityFromUtilization(value);

  return (
    <div className="util">
      <span className="util-track">
        <span
          className="util-fill"
          style={{ width: `${clamped}%`, background: SEVERITY_COLOR[severity] }}
        />
      </span>
      <span className={`mono tabular-nums ${SEVERITY_TEXT[severity]}`}>{fmtPct(value)}</span>
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
    return <p className="empty pending">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table min-w-[1040px]">
        <thead>
          <tr>
            <th className="text-right">#</th>
            <th>Token</th>
            <th>Node · Tenant</th>
            <th>Resource</th>
            <th>Utilization</th>
            <th>Lead time</th>
            <th>Confidence</th>
            <th>Hops</th>
            <th>Phase</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => {
            const phaseStatus: SeverityStatus = token.awaitingHumanVerification
              ? "WARNING"
              : token.currentPhase === "07_RESOLVED"
                ? "HEALTHY"
                : token.currentPhase === "08_REJECTED_BY_OPERATOR"
                  ? "CRITICAL"
                  : severityFromUtilization(token.utilizationPct);

            return (
              <tr
                key={token.tokenId}
                data-clickable="true"
                tabIndex={0}
                onClick={() => onSelect(token.tokenId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(token.tokenId);
                  }
                }}
              >
                <td className="mono text-right tabular-nums text-brand-muted">
                  {token.priorityNumber}
                </td>
                <td>
                  <div className="mono text-[10px]">{token.tokenId}</div>
                  <div className="mono text-[9px] text-brand-muted">
                    {fmtDateTime(token.createdAt)}
                  </div>
                </td>
                <td>
                  <div className="mono">{token.rackId}</div>
                  <div className="mono text-[9px] text-brand-muted">{token.tenantId}</div>
                </td>
                <td className="text-brand-muted">
                  {token.resourceType.replace(/_/g, " ").toLowerCase()}
                </td>
                <td>
                  <Utilization value={token.utilizationPct} />
                </td>
                <td className="mono tabular-nums">{fmtWeeks(token.leadTimeWeeks)}</td>
                <td className="mono tabular-nums">
                  {token.forecastConfidenceScore > 0
                    ? fmtPct(token.forecastConfidenceScore * 100, 0)
                    : "—"}
                </td>
                <td className="mono tabular-nums text-brand-muted">
                  {token.hopCount}/{token.maxAllowedHops}
                </td>
                <td>
                  <SeverityBadge status={phaseStatus} label={phaseLabel(token.currentPhase)} />
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {token.isTransientSpike && <span className="tag tag-warn">spike</span>}
                    {token.regimeChangeDetected && (
                      <span className="tag tag-neutral">regime</span>
                    )}
                    {token.humanApproved === true && (
                      <span className="tag tag-ok">approved</span>
                    )}
                    {token.humanApproved === false && (
                      <span className="tag tag-critical">rejected</span>
                    )}
                    {!token.isTransientSpike &&
                      !token.regimeChangeDetected &&
                      token.humanApproved === null && (
                        <span className="mono text-[10px] text-brand-muted">—</span>
                      )}
                  </div>
                </td>
              </tr>
            );
          })}
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
    <div className="mt-8">
      <div className="page-toolbar">
        <button
          type="button"
          onClick={() => void actions.runPipeline()}
          disabled={state.loading.pipeline || queued.length === 0}
          className="btn btn-primary"
        >
          {state.loading.pipeline ? "Running pipeline…" : "Run top-priority incident ↗"}
        </button>
        <button
          type="button"
          onClick={() => void actions.scanResources()}
          disabled={state.loading.scan}
          className="btn"
        >
          {state.loading.scan ? "Scanning resources…" : "Scan resources"}
        </button>
        <button
          type="button"
          onClick={() => void actions.refreshAll()}
          disabled={state.loading.queue}
          className="btn"
        >
          Refresh
        </button>

        <p className="meta">
          Priority 01 = highest · max {queued[0]?.maxAllowedHops ?? 8} hops
        </p>
      </div>

      <div className="tabs" role="tablist" aria-label="Queue views">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            data-active={tab === item.id}
            onClick={() => setTab(item.id)}
            className="tab"
          >
            {item.label}
            <span className="tab-count">{String(item.count).padStart(2, "0")}</span>
          </button>
        ))}
      </div>

      <div className="mt-6">
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
        <section className="section-block" aria-label="Agent activity">
          <div className="section-head">
            <div>
              <p className="eyebrow">AGENT ACTIVITY / RECENT</p>
              <h2>Stream</h2>
            </div>
            <span className="pending">{state.activity.length} events</span>
          </div>
          <ul className="activity-list">
            {state.activity.slice(0, 8).map((entry) => (
              <li key={entry.id}>
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    entry.kind === "error"
                      ? "bg-brand-critical"
                      : entry.kind === "agent"
                        ? "bg-brand-accent"
                        : entry.kind === "human"
                          ? "bg-brand-ok"
                          : "bg-brand-muted"
                  }`}
                  aria-hidden="true"
                />
                <span className="flex-1 text-brand-muted">{entry.message}</span>
                <span className="mono shrink-0 text-[9px] tabular-nums text-brand-muted">
                  {new Date(entry.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
