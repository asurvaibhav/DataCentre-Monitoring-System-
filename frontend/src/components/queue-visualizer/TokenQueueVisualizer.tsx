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

export function getPriorityTier(token: IncidentTokenDTO): {
  code: string;
  label: string;
  colorClass: string;
} {
  if (token.priorityNumber <= 25) {
    return { code: "P1", label: "Critical", colorClass: "tag-critical" };
  }
  if (token.priorityNumber <= 50) {
    return { code: "P2", label: "High", colorClass: "tag-warn" };
  }
  if (token.priorityNumber <= 75) {
    return { code: "P3", label: "Medium", colorClass: "tag-neutral" };
  }
  return { code: "P4", label: "Low", colorClass: "tag-neutral" };
}

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
  onDiagnose,
  isDiagnosing,
}: {
  tokens: IncidentTokenDTO[];
  emptyMessage: string;
  onSelect: (tokenId: string) => void;
  onDiagnose: (tokenId: string) => void;
  isDiagnosing: boolean;
}) {
  if (tokens.length === 0) {
    return <p className="empty pending">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table min-w-[1100px]">
        <thead>
          <tr>
            <th className="text-left w-24">Priority</th>
            <th>Token</th>
            <th>Node · Tenant</th>
            <th>Resource</th>
            <th>Utilization</th>
            <th>Lead time</th>
            <th>Confidence</th>
            <th>Hops</th>
            <th>Phase</th>
            <th>Flags</th>
            <th className="text-right">Human Actions</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token, index) => {
            const phaseStatus: SeverityStatus = token.awaitingHumanVerification
              ? "WARNING"
              : token.currentPhase === "07_RESOLVED"
                ? "HEALTHY"
                : token.currentPhase === "08_REJECTED_BY_OPERATOR"
                  ? "CRITICAL"
                  : severityFromUtilization(token.utilizationPct);

            const tier = getPriorityTier(token);
            const isResolved = token.currentPhase === "07_RESOLVED";

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
                <td className="mono tabular-nums">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-brand-ink">
                      #{String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`tag ${tier.colorClass} text-[9px] px-1 py-0.5 tracking-wider`}
                      title={`Priority ${token.priorityNumber}/100 · ${token.priorityReason ?? tier.label} · Lower runs first`}
                    >
                      {tier.code} · {token.priorityNumber}
                    </span>
                    <small className="text-brand-muted text-[9px] max-w-[200px]">{token.priorityReason}</small>
                  </div>
                </td>
                <td>
                  <div className="mono text-[10px] font-medium">{token.tokenId}</div>
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
                <td className="text-right whitespace-nowrap">
                  <div
                    className="flex items-center justify-end gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!isResolved ? (
                      <button
                        type="button"
                        onClick={() => onDiagnose(token.tokenId)}
                        disabled={isDiagnosing}
                        className="btn py-1 px-2.5 text-[10px] mono tracking-wider hover:border-brand-accent"
                        title="Run 6-phase multi-agent diagnosis on this incident"
                      >
                        Diagnose ↗
                      </button>
                    ) : (
                      <span className="mono text-[10px] text-brand-accent font-medium">
                        ✓ Resolved
                      </span>
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

  const handleDiagnose = (tokenId: string) => {
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
      <div className="page-toolbar flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const firstToken = queued[0];
            if (!firstToken) return;
            actions.selectToken(firstToken.tokenId);
            onNavigate?.("hitl");
          }}
          disabled={queued.length === 0}
          className="btn btn-primary"
        >
          Open top incident ↗
        </button>

        <button
          type="button"
          onClick={() => void actions.refreshAll()}
          disabled={state.loading.queue}
          className="btn"
        >
          Refresh
        </button>

        <p className="meta ml-auto">
          Priority P1 = highest · Select an incident to begin diagnosis
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
          onDiagnose={handleDiagnose}
          isDiagnosing={state.loading.pipeline}
          emptyMessage={
            tab === "queued"
              ? "No tokens in the priority queue. Select an incident once it appears."
              : tab === "pending"
                ? "No incidents are waiting for operator verification."
                : "No processed incidents yet."
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

