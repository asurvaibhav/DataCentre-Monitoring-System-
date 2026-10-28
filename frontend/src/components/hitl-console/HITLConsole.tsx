// Human-in-the-loop console: incident evidence, RCA, read-only remediation
// options, risk assessment, operator decision, and the immutable audit trail.

import { useEffect, useState } from "react";

import { SeverityBadge } from "@/components/common/SeverityBadge";
import { useAO02Store } from "@/store/ao02Store";
import { useSelectedIncident } from "@/hooks/useSelectedIncident";
import {
  fmtDate,
  fmtDateTime,
  fmtPct,
  fmtWeeks,
  phaseLabel,
  truncateHash,
} from "@/lib/format";
import { PHASE_ORDER } from "@/types/ao02";

interface HITLConsoleProps {
  onNavigate?: (page: "rack-map" | "queue" | "forecast" | "hitl") => void;
}

type Decision = "approve" | "reject" | "defer";

const DECISION_LABELS: Record<Decision, string> = {
  approve: "Approve advisory",
  reject: "Reject advisory",
  defer: "Defer decision",
};

export function HITLConsole({ onNavigate }: HITLConsoleProps) {
  const { state, actions } = useAO02Store();
  const { tokenId, token, envelope, deciding, decide } = useSelectedIncident();
  const [notes, setNotes] = useState("");

  const activeToken = envelope?.token ?? token;
  const isAwaiting = activeToken?.currentPhase === "06_HUMAN_VERIFICATION";
  const humanApproved = envelope?.humanApproved ?? activeToken?.humanApproved ?? null;

  useEffect(() => {
    setNotes("");
  }, [tokenId]);

  if (!tokenId || !activeToken) {
    return (
      <div className="rounded-xl border border-brand-surface bg-brand-surface/20 p-10 text-center">
        <h2 className="text-sm font-semibold text-white">No incident selected</h2>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
          Choose a token from the priority queue or run the pipeline to produce an
          incident that reaches the human verification gate.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate?.("queue")}
            className="rounded-lg border border-brand-surface bg-brand-surface/40 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-brand-surface/70"
          >
            Open queue
          </button>
          <button
            type="button"
            onClick={() => void actions.runPipeline()}
            disabled={state.loading.pipeline || state.tokens.length === 0}
            className="rounded-lg border border-brand-accent/40 bg-brand-accent/10 px-3 py-2 text-xs font-medium text-brand-accent hover:bg-brand-accent/20 disabled:opacity-40"
          >
            {state.loading.pipeline ? "Running…" : "Run top-priority incident"}
          </button>
        </div>
      </div>
    );
  }

  const phaseIndex = PHASE_ORDER.indexOf(activeToken.currentPhase);
  const currentIndex = phaseIndex === -1 ? PHASE_ORDER.length - 1 : phaseIndex;
  const risk = envelope?.riskEvaluation ?? null;
  const rca = envelope?.rca ?? null;
  const options = envelope?.remediationOptions ?? [];
  const auditTrail = envelope?.auditTrail ?? [];
  const selectedOption = options.find((option) => option.optionId === risk?.selectedOptionId);

  const riskTone =
    !risk || risk.riskScore < 0.4
      ? "ok"
      : risk.riskScore < 0.7
        ? "warn"
        : "critical";

  return (
    <div className="space-y-4">
      {/* Incident header */}
      <div className="rounded-xl border border-brand-surface bg-brand-surface/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-sm font-semibold text-white">
                {activeToken.tokenId}
              </h2>
              <SeverityBadge
                status={
                  activeToken.currentPhase === "07_RESOLVED"
                    ? "HEALTHY"
                    : activeToken.currentPhase === "08_REJECTED_BY_OPERATOR"
                      ? "CRITICAL"
                      : isAwaiting
                        ? "WARNING"
                        : "WARNING"
                }
                label={phaseLabel(activeToken.currentPhase)}
              />
              <span className="rounded-full border border-brand-surface px-2 py-0.5 text-[10px] text-slate-400">
                Priority {activeToken.priorityNumber}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {activeToken.rackId} · tenant {activeToken.tenantId} ·{" "}
              {activeToken.resourceType.replace(/_/g, " ")} ·{" "}
              {activeToken.hopCount}/{activeToken.maxAllowedHops} hops · created{" "}
              {fmtDateTime(activeToken.createdAt)}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded-full border border-brand-surface bg-brand-dark px-2 py-1">
              operator view · facility scope
            </span>
            <button
              type="button"
              onClick={() => onNavigate?.("forecast")}
              className="rounded-lg border border-brand-surface bg-brand-surface/40 px-2.5 py-1.5 font-medium text-slate-200 hover:bg-brand-surface/70"
            >
              View forecast
            </button>
          </div>
        </div>

        {/* Phase stepper */}
        <ol className="mt-4 flex flex-wrap items-center gap-1.5">
          {PHASE_ORDER.map((phase, index) => {
            const done = index < currentIndex || activeToken.currentPhase === "07_RESOLVED";
            const current = index === currentIndex;
            return (
              <li key={phase} className="flex items-center gap-1.5">
                <span
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                    current
                      ? "border-brand-accent/50 bg-brand-accent/10 text-brand-accent"
                      : done
                        ? "border-brand-ok/30 bg-brand-ok/10 text-brand-ok"
                        : "border-brand-surface bg-brand-dark text-slate-500"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                      current
                        ? "bg-brand-accent text-brand-dark"
                        : done
                          ? "bg-brand-ok text-brand-dark"
                          : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {index + 1}
                  </span>
                  {phaseLabel(phase)}
                </span>
                {index < PHASE_ORDER.length - 1 && (
                  <span className="text-[10px] text-slate-700">→</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Telemetry evidence */}
          <section className="rounded-xl border border-brand-surface bg-brand-surface/20 p-4">
            <h3 className="text-sm font-semibold text-white">Telemetry evidence</h3>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Current utilization</dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-100">
                  {fmtPct(envelope?.telemetry.currentUtilizationPct ?? activeToken.utilizationPct)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Safety margin</dt>
                <dd className="mt-0.5 tabular-nums text-slate-200">
                  {fmtPct(envelope?.telemetry.safetyMarginPct ?? activeToken.safetyMarginPct)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Lead time</dt>
                <dd className="mt-0.5 tabular-nums text-slate-200">
                  {fmtWeeks(envelope?.forecast.leadTimeWeeks ?? activeToken.leadTimeWeeks)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Hard limit</dt>
                <dd className="mt-0.5 tabular-nums text-slate-200">
                  {(envelope?.telemetry.hardCapacityLimit ?? activeToken.hardCapacityLimit).toFixed(1)}{" "}
                  {envelope?.telemetry.unit ?? activeToken.unit}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Forecast confidence</dt>
                <dd className="mt-0.5 tabular-nums text-slate-200">
                  {fmtPct(
                    (envelope?.forecast.forecastConfidenceScore ??
                      activeToken.forecastConfidenceScore) * 100,
                    0,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Predicted exhaustion</dt>
                <dd className="mt-0.5 tabular-nums text-slate-200">
                  {fmtDate(
                    envelope?.forecast.predictedExhaustionDate ??
                      activeToken.predictedExhaustionDate,
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-brand-surface/60 pt-3 text-[11px] text-slate-500">
              <span>
                Window {fmtDate(envelope?.telemetry.windowStart ?? activeToken.windowStart)} →{" "}
                {fmtDate(envelope?.telemetry.windowEnd ?? activeToken.windowEnd)}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                sha256 {truncateHash(envelope?.telemetry.rawSeriesSha256 ?? activeToken.rawSeriesSha256)}
              </span>
              {activeToken.regimeChangeDetected && (
                <span className="rounded bg-violet-400/10 px-1.5 py-0.5 text-violet-300">
                  regime change
                </span>
              )}
              {activeToken.isTransientSpike && (
                <span className="rounded bg-brand-warn/10 px-1.5 py-0.5 text-brand-warn">
                  transient spike
                </span>
              )}
            </div>
          </section>

          {/* RCA */}
          <section className="rounded-xl border border-brand-surface bg-brand-surface/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Root cause analysis</h3>
              {rca && (
                <span className="text-[11px] text-slate-500">
                  confidence {fmtPct(rca.confidenceScore * 100, 0)}
                </span>
              )}
            </div>
            {!envelope ? (
              <p className="mt-2 text-xs text-slate-500">Loading incident context…</p>
            ) : rca ? (
              <div className="mt-3 space-y-2 text-xs">
                <p className="text-slate-200">{rca.rootCauseSummary}</p>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Attributed tenant</dt>
                    <dd className="text-slate-300">{rca.attributedTenantId}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Workload signature</dt>
                    <dd className="text-slate-300">{rca.drivingWorkloadSignature}</dd>
                  </div>
                </dl>
                {rca.correlatedSignals.length > 0 && (
                  <div>
                    <p className="text-slate-500">Correlated signals</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {rca.correlatedSignals.map((signal) => (
                        <span
                          key={signal}
                          className="rounded bg-brand-surface px-1.5 py-0.5 text-[10px] text-slate-300"
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {rca.investigationNotes && (
                  <p className="text-slate-500">{rca.investigationNotes}</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                RCA has not run yet. Start the pipeline from the queue.
              </p>
            )}
          </section>

          {/* Remediation options */}
          <section className="rounded-xl border border-brand-surface bg-brand-surface/20 p-4">
            <h3 className="text-sm font-semibold text-white">
              Remediation options{" "}
              <span className="text-[11px] font-normal text-slate-500">
                (simulated — read-only telemetry)
              </span>
            </h3>
            {options.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                No remediation options generated yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {options.map((option) => {
                  const selected = option.optionId === risk?.selectedOptionId;
                  return (
                    <li
                      key={option.optionId}
                      className={`rounded-lg border p-3 text-xs ${
                        selected
                          ? "border-brand-accent/40 bg-brand-accent/5"
                          : "border-brand-surface bg-brand-dark/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-200">{option.title}</span>
                        {selected && (
                          <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 text-[10px] font-medium text-brand-accent">
                            recommended
                          </span>
                        )}
                        {option.mutatesLiveFacilityControls ? (
                          <span className="rounded-full bg-brand-critical/10 px-2 py-0.5 text-[10px] text-brand-critical">
                            mutates controls
                          </span>
                        ) : (
                          <span className="rounded-full bg-brand-ok/10 px-2 py-0.5 text-[10px] text-brand-ok">
                            read-only
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-slate-400">{option.recommendedAction}</p>
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        Simulated post-action utilization{" "}
                        <span className="tabular-nums text-slate-300">
                          {fmtPct(option.simulatedPostActionUtilizationPct)}
                        </span>{" "}
                        · extends runway{" "}
                        <span className="tabular-nums text-slate-300">
                          {fmtWeeks(option.projectedLeadTimeExtensionWeeks)}
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Audit trail */}
          <section className="rounded-xl border border-brand-surface bg-brand-surface/20 p-4">
            <h3 className="text-sm font-semibold text-white">
              Immutable audit trail{" "}
              <span className="text-[11px] font-normal text-slate-500">
                ({auditTrail.length} entries)
              </span>
            </h3>
            {auditTrail.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No audit entries yet.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {auditTrail.map((entry) => (
                  <li key={entry.auditId} className="flex gap-3 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-slate-200">{entry.actor}</span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          {phaseLabel(entry.phase)}
                        </span>
                        <span className="ml-auto text-[10px] tabular-nums text-slate-500">
                          {fmtDateTime(entry.timestamp)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-slate-400">{entry.decisionSummary}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-600">
                        telemetry {truncateHash(entry.telemetryHash, 8, 4)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Decision panel */}
        <aside className="space-y-4">
          <section className="rounded-xl border border-brand-surface bg-brand-surface/20 p-4">
            <h3 className="text-sm font-semibold text-white">Risk gate</h3>
            {risk ? (
              <div className="mt-3 space-y-3 text-xs">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-500">Risk score</span>
                    <span
                      className={`text-2xl font-semibold tabular-nums ${
                        riskTone === "critical"
                          ? "text-brand-critical"
                          : riskTone === "warn"
                            ? "text-brand-warn"
                            : "text-brand-ok"
                      }`}
                    >
                      {risk.riskScore.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-700">
                    <div
                      className={`h-full rounded-full ${
                        riskTone === "critical"
                          ? "bg-brand-critical"
                          : riskTone === "warn"
                            ? "bg-brand-warn"
                            : "bg-brand-ok"
                      }`}
                      style={{ width: `${Math.min(100, risk.riskScore * 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-slate-500">Gate decision</p>
                  <p className="mt-0.5 font-medium text-slate-200">
                    {risk.gateDecision.replace(/_/g, " ").toLowerCase()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Blast radius</p>
                  <p className="mt-0.5 text-slate-300">{risk.blastRadiusSummary}</p>
                </div>
                <div>
                  <p className="text-slate-500">SLA impact</p>
                  <p className="mt-0.5 text-slate-300">{risk.slaImpactAssessment}</p>
                </div>
                {selectedOption && (
                  <div className="rounded-lg border border-brand-accent/30 bg-brand-accent/5 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-brand-accent">
                      Recommended action
                    </p>
                    <p className="mt-0.5 text-slate-200">{selectedOption.title}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Risk evaluation has not run for this incident.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-brand-surface bg-brand-surface/20 p-4">
            <h3 className="text-sm font-semibold text-white">Operator decision</h3>

            {humanApproved !== null && !isAwaiting ? (
              <div className="mt-3 space-y-2 text-xs">
                <p
                  className={`rounded-lg border px-3 py-2 ${
                    humanApproved
                      ? "border-brand-ok/30 bg-brand-ok/10 text-brand-ok"
                      : "border-brand-critical/30 bg-brand-critical/10 text-brand-critical"
                  }`}
                >
                  {humanApproved
                    ? "Advisory approved by operator."
                    : "Advisory rejected by operator."}
                </p>
                {envelope?.operatorNotes && (
                  <p className="text-slate-400">{envelope.operatorNotes}</p>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate?.("queue")}
                  className="w-full rounded-lg border border-brand-surface bg-brand-surface/40 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-brand-surface/70"
                >
                  Back to queue
                </button>
              </div>
            ) : isAwaiting ? (
              <div className="mt-3 space-y-3 text-xs">
                <p className="rounded-lg border border-brand-warn/30 bg-brand-warn/10 px-3 py-2 text-brand-warn">
                  Pipeline paused before the human verification gate. Review the
                  evidence, then record a decision.
                </p>

                <label className="block">
                  <span className="text-slate-500">Operator notes (optional)</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Context for the audit trail…"
                    className="mt-1 w-full resize-none rounded-lg border border-brand-surface bg-brand-dark px-2.5 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-brand-accent focus:outline-none"
                  />
                </label>

                <div className="space-y-2">
                  {(["approve", "reject", "defer"] as Decision[]).map((decision) => (
                    <button
                      key={decision}
                      type="button"
                      disabled={deciding}
                      onClick={() => void decide(decision, notes)}
                      className={`w-full rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        decision === "approve"
                          ? "border-brand-ok/40 bg-brand-ok/10 text-brand-ok hover:bg-brand-ok/20"
                          : decision === "reject"
                            ? "border-brand-critical/40 bg-brand-critical/10 text-brand-critical hover:bg-brand-critical/20"
                            : "border-brand-surface bg-brand-surface/40 text-slate-300 hover:bg-brand-surface/70"
                      }`}
                    >
                      {deciding ? "Recording…" : DECISION_LABELS[decision]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-2 text-xs">
                <p className="text-slate-400">
                  This incident is in phase{" "}
                  <span className="text-slate-200">
                    {phaseLabel(activeToken.currentPhase)}
                  </span>{" "}
                  and is not awaiting a decision.
                </p>
                {activeToken.currentPhase === "01_RESOURCE_MONITORING" && (
                  <p className="text-slate-500">
                    Start the pipeline from the queue to progress it to the gate.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate?.("queue")}
                  className="w-full rounded-lg border border-brand-surface bg-brand-surface/40 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-brand-surface/70"
                >
                  Open queue
                </button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-brand-surface bg-brand-surface/20 p-4 text-[11px] leading-relaxed text-slate-500">
            <p className="font-medium text-slate-400">Safety constraints</p>
            <p className="mt-1">
              AO-02 never writes to facility controls. Remediation is simulated and
              advisory only; every decision is appended to the token&apos;s immutable
              audit trail with the originating telemetry hash.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
