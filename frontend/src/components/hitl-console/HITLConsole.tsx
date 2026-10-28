// Human-in-the-loop console: evidence, RCA, read-only remediation options,
// risk assessment, operator decision, and the immutable audit trail.

import { useEffect, useState } from "react";

import { SeverityBadge } from "@/components/common/SeverityBadge";
import { useSelectedIncident } from "@/hooks/useSelectedIncident";
import {
  fmtDate,
  fmtDateTime,
  fmtPct,
  fmtWeeks,
  phaseLabel,
  severityFromUtilization,
  truncateHash,
} from "@/lib/format";
import { useAO02Store } from "@/store/ao02Store";
import { PHASE_ORDER } from "@/types/ao02";
import type { SeverityStatus } from "@/types/ao02";

interface HITLConsoleProps {
  onNavigate?: (page: "rack-map" | "queue" | "forecast" | "hitl") => void;
}

type Decision = "approve" | "reject" | "defer";

const DECISION_LABELS: Record<Decision, string> = {
  approve: "Approve advisory",
  reject: "Reject advisory",
  defer: "Defer decision",
};

const RISK_TEXT: Record<"ok" | "warn" | "critical", string> = {
  ok: "text-brand-ok",
  warn: "text-brand-warn",
  critical: "text-brand-critical",
};

const RISK_BG: Record<"ok" | "warn" | "critical", string> = {
  ok: "bg-brand-ok",
  warn: "bg-brand-warn",
  critical: "bg-brand-critical",
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
      <div className="mt-8">
        <section className="panel empty">
          <p className="eyebrow">OPERATOR GATE</p>
          <h2 className="mt-3 text-[25px] font-medium tracking-tight">No incident selected</h2>
          <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-brand-muted">
            Choose a token from the priority queue or run the pipeline to produce an incident
            that reaches the human verification gate.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => onNavigate?.("queue")} className="btn">
              Open queue
            </button>
            <button
              type="button"
              onClick={() => void actions.runPipeline()}
              disabled={state.loading.pipeline || state.tokens.length === 0}
              className="btn btn-primary"
            >
              {state.loading.pipeline ? "Running…" : "Run top-priority incident ↗"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  const phaseIndex = PHASE_ORDER.indexOf(activeToken.currentPhase);
  const currentIndex = phaseIndex === -1 ? PHASE_ORDER.length - 1 : phaseIndex;
  const resolved = activeToken.currentPhase === "07_RESOLVED";
  const risk = envelope?.riskEvaluation ?? null;
  const rca = envelope?.rca ?? null;
  const options = envelope?.remediationOptions ?? [];
  const auditTrail = envelope?.auditTrail ?? [];
  const selectedOption = options.find((option) => option.optionId === risk?.selectedOptionId);

  const riskTone: "ok" | "warn" | "critical" =
    !risk || risk.riskScore < 0.4 ? "ok" : risk.riskScore < 0.7 ? "warn" : "critical";

  const headerStatus: SeverityStatus = resolved
    ? "HEALTHY"
    : activeToken.currentPhase === "08_REJECTED_BY_OPERATOR"
      ? "CRITICAL"
      : isAwaiting
        ? "WARNING"
        : severityFromUtilization(activeToken.utilizationPct);

  return (
    <div className="mt-8">
      <section className="panel section-pad" aria-label="Incident record">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">OPERATOR RECORD</p>
            <h2 className="mono mt-2 text-[20px] font-medium tracking-tight">
              {activeToken.tokenId}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SeverityBadge
                status={headerStatus}
                label={phaseLabel(activeToken.currentPhase)}
              />
              <span className="tag tag-neutral">priority {activeToken.priorityNumber}</span>
              <span className="tag tag-neutral">
                {activeToken.resourceType.replace(/_/g, " ").toLowerCase()}
              </span>
            </div>
            <p className="pending mt-3">
              {activeToken.rackId} · tenant {activeToken.tenantId} · {activeToken.hopCount}/
              {activeToken.maxAllowedHops} hops · created {fmtDateTime(activeToken.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="tag tag-neutral">operator view · facility scope</span>
            <button type="button" onClick={() => onNavigate?.("forecast")} className="btn">
              View forecast ↗
            </button>
          </div>
        </div>
      </section>

      <ol className="phase-track mt-5" aria-label="Pipeline phases">
        {PHASE_ORDER.map((phase, index) => {
          const state =
            resolved || index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "pending";
          return (
            <li key={phase} className="phase-step" data-state={state}>
              <strong>{String(index + 1).padStart(2, "0")}</strong>
              {phaseLabel(phase)}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="panel section-pad">
            <div className="section-head">
              <div>
                <p className="eyebrow">EVIDENCE / TELEMETRY</p>
                <h3>Observed window</h3>
              </div>
              <span className="pending">raw_series_sha256</span>
            </div>

            <dl className="evidence-grid">
              <div className="evidence-cell">
                <dt className="evidence-label">Current utilization</dt>
                <dd className="evidence-value tabular-nums">
                  {fmtPct(envelope?.telemetry.currentUtilizationPct ?? activeToken.utilizationPct)}
                </dd>
              </div>
              <div className="evidence-cell">
                <dt className="evidence-label">Safety margin</dt>
                <dd className="evidence-value tabular-nums">
                  {fmtPct(envelope?.telemetry.safetyMarginPct ?? activeToken.safetyMarginPct)}
                </dd>
              </div>
              <div className="evidence-cell">
                <dt className="evidence-label">Lead time</dt>
                <dd className="evidence-value tabular-nums">
                  {fmtWeeks(envelope?.forecast.leadTimeWeeks ?? activeToken.leadTimeWeeks)}
                </dd>
              </div>
              <div className="evidence-cell">
                <dt className="evidence-label">Hard limit</dt>
                <dd className="evidence-value tabular-nums">
                  {(envelope?.telemetry.hardCapacityLimit ?? activeToken.hardCapacityLimit).toFixed(
                    1,
                  )}{" "}
                  <span className="text-[10px] text-brand-muted">
                    {envelope?.telemetry.unit ?? activeToken.unit}
                  </span>
                </dd>
              </div>
              <div className="evidence-cell">
                <dt className="evidence-label">Forecast confidence</dt>
                <dd className="evidence-value tabular-nums">
                  {fmtPct(
                    (envelope?.forecast.forecastConfidenceScore ??
                      activeToken.forecastConfidenceScore) * 100,
                    0,
                  )}
                </dd>
              </div>
              <div className="evidence-cell">
                <dt className="evidence-label">Predicted exhaustion</dt>
                <dd className="evidence-value tabular-nums">
                  {fmtDate(
                    envelope?.forecast.predictedExhaustionDate ??
                      activeToken.predictedExhaustionDate,
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-brand-line-soft pt-3">
              <span className="pending">
                Window {fmtDate(envelope?.telemetry.windowStart ?? activeToken.windowStart)} →{" "}
                {fmtDate(envelope?.telemetry.windowEnd ?? activeToken.windowEnd)}
              </span>
              <span className="mono text-[9px] text-brand-muted">
                sha256{" "}
                {truncateHash(envelope?.telemetry.rawSeriesSha256 ?? activeToken.rawSeriesSha256)}
              </span>
              {activeToken.regimeChangeDetected && (
                <span className="tag tag-neutral">regime change</span>
              )}
              {activeToken.isTransientSpike && <span className="tag tag-warn">transient spike</span>}
            </div>
          </section>

          <section className="panel section-pad">
            <div className="section-head">
              <div>
                <p className="eyebrow">AGENT 02 / RCA</p>
                <h3>Root cause analysis</h3>
              </div>
              {rca && (
                <span className="pending">
                  confidence {fmtPct(rca.confidenceScore * 100, 0)}
                </span>
              )}
            </div>

            {!envelope ? (
              <p className="pending">Loading incident context…</p>
            ) : rca ? (
              <div>
                <p className="text-xs leading-relaxed">{rca.rootCauseSummary}</p>
                <dl className="mt-4 text-xs">
                  <div className="flex justify-between gap-4 border-b border-brand-line-soft/60 py-2">
                    <dt className="text-brand-muted">Attributed tenant</dt>
                    <dd className="mono">{rca.attributedTenantId}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-brand-line-soft/60 py-2">
                    <dt className="text-brand-muted">Workload signature</dt>
                    <dd className="mono text-right">{rca.drivingWorkloadSignature}</dd>
                  </div>
                </dl>
                {rca.correlatedSignals.length > 0 && (
                  <div className="mt-3">
                    <p className="pending">Correlated signals</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rca.correlatedSignals.map((signal) => (
                        <span key={signal} className="tag tag-neutral">
                          {signal}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {rca.investigationNotes && (
                  <p className="mt-3 text-[11px] leading-relaxed text-brand-muted">
                    {rca.investigationNotes}
                  </p>
                )}
              </div>
            ) : (
              <p className="pending">RCA has not run yet. Start the pipeline from the queue.</p>
            )}
          </section>

          <section className="panel section-pad">
            <div className="section-head">
              <div>
                <p className="eyebrow">AGENT 03 / REMEDIATION</p>
                <h3>Simulated options</h3>
              </div>
              <span className="pending">read-only telemetry</span>
            </div>

            {options.length === 0 ? (
              <p className="pending">No remediation options generated yet.</p>
            ) : (
              <ul>
                {options.map((option) => {
                  const selected = option.optionId === risk?.selectedOptionId;
                  return (
                    <li
                      key={option.optionId}
                      className={`border-b border-brand-line-soft py-3 last:border-b-0 ${
                        selected
                          ? "-mx-3 border-l-2 border-l-brand-accent bg-brand-accent/5 px-3"
                          : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium">{option.title}</span>
                        {selected && <span className="tag tag-ok">recommended</span>}
                        {option.mutatesLiveFacilityControls ? (
                          <span className="tag tag-critical">mutates controls</span>
                        ) : (
                          <span className="tag tag-neutral">read-only</span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">
                        {option.recommendedAction}
                      </p>
                      <p className="pending mt-1.5">
                        Simulated post-action utilization{" "}
                        <span className="text-brand-ink tabular-nums">
                          {fmtPct(option.simulatedPostActionUtilizationPct)}
                        </span>{" "}
                        · extends runway{" "}
                        <span className="text-brand-ink tabular-nums">
                          {fmtWeeks(option.projectedLeadTimeExtensionWeeks)}
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel section-pad">
            <div className="section-head">
              <div>
                <p className="eyebrow">AUDIT / IMMUTABLE</p>
                <h3>Decision trail</h3>
              </div>
              <span className="pending">{auditTrail.length} entries</span>
            </div>

            {auditTrail.length === 0 ? (
              <p className="pending">No audit entries yet.</p>
            ) : (
              <ol className="timeline">
                {auditTrail.map((entry) => (
                  <li key={entry.auditId} className="text-xs">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{entry.actor}</span>
                      <span className="mono text-[9px] uppercase tracking-wide text-brand-muted">
                        {phaseLabel(entry.phase)}
                      </span>
                      <span className="mono ml-auto text-[9px] tabular-nums text-brand-muted">
                        {fmtDateTime(entry.timestamp)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">
                      {entry.decisionSummary}
                    </p>
                    <p className="mono mt-1 text-[9px] text-brand-muted">
                      telemetry {truncateHash(entry.telemetryHash, 8, 4)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="panel section-pad">
            <div className="section-head">
              <div>
                <p className="eyebrow">RISK GATE</p>
                <h3>Assessment</h3>
              </div>
            </div>

            {risk ? (
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="pending">Risk score</span>
                  <span
                    className={`text-[30px] font-medium leading-none tracking-tight tabular-nums ${RISK_TEXT[riskTone]}`}
                  >
                    {risk.riskScore.toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 h-[2px] w-full bg-brand-line-soft">
                  <div
                    className={`h-[2px] ${RISK_BG[riskTone]}`}
                    style={{ width: `${Math.min(100, risk.riskScore * 100)}%` }}
                  />
                </div>

                <dl className="mt-4 text-xs">
                  <div className="border-b border-brand-line-soft/60 py-2">
                    <dt className="pending">Gate decision</dt>
                    <dd className="mt-1 text-[11px]">
                      {risk.gateDecision.replace(/_/g, " ").toLowerCase()}
                    </dd>
                  </div>
                  <div className="border-b border-brand-line-soft/60 py-2">
                    <dt className="pending">Blast radius</dt>
                    <dd className="mt-1 text-[11px] leading-relaxed text-brand-muted">
                      {risk.blastRadiusSummary}
                    </dd>
                  </div>
                  <div className="py-2">
                    <dt className="pending">SLA impact</dt>
                    <dd className="mt-1 text-[11px] leading-relaxed text-brand-muted">
                      {risk.slaImpactAssessment}
                    </dd>
                  </div>
                </dl>

                {selectedOption && (
                  <div className="mt-2 border border-brand-accent/30 bg-brand-accent/5 p-2.5">
                    <p className="mono text-[8px] uppercase tracking-wide text-brand-accent">
                      Recommended action
                    </p>
                    <p className="mt-1 text-[11px]">{selectedOption.title}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="pending">Risk evaluation has not run for this incident.</p>
            )}
          </section>

          <section className="panel section-pad">
            <div className="section-head">
              <div>
                <p className="eyebrow">OPERATOR DECISION</p>
                <h3>Sign-off</h3>
              </div>
            </div>

            {humanApproved !== null && !isAwaiting ? (
              <div className="space-y-3 text-xs">
                <p
                  className={`border px-3 py-2 text-[11px] leading-relaxed ${
                    humanApproved
                      ? "border-brand-accent/40 bg-brand-accent/5 text-brand-accent"
                      : "border-brand-critical/40 bg-brand-critical/5 text-brand-critical"
                  }`}
                >
                  {humanApproved
                    ? "Advisory approved by operator."
                    : "Advisory rejected by operator."}
                </p>
                {envelope?.operatorNotes && (
                  <p className="text-[11px] leading-relaxed text-brand-muted">
                    {envelope.operatorNotes}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate?.("queue")}
                  className="btn btn-block"
                >
                  Back to queue
                </button>
              </div>
            ) : isAwaiting ? (
              <div className="space-y-3 text-xs">
                <p className="notice">
                  Pipeline paused before the human verification gate. Review the evidence,
                  then record a decision.
                </p>

                <label className="field-label">
                  Operator notes (optional)
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Context for the audit trail…"
                    className="field resize-none"
                  />
                </label>

                <div className="space-y-2">
                  {(["approve", "reject", "defer"] as Decision[]).map((decision) => (
                    <button
                      key={decision}
                      type="button"
                      disabled={deciding}
                      onClick={() => void decide(decision, notes)}
                      className={`btn btn-block ${
                        decision === "approve"
                          ? "btn-approve"
                          : decision === "reject"
                            ? "btn-danger"
                            : ""
                      }`}
                    >
                      {deciding ? "Recording…" : DECISION_LABELS[decision]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <p className="text-[11px] leading-relaxed text-brand-muted">
                  This incident is in phase{" "}
                  <span className="text-brand-ink">
                    {phaseLabel(activeToken.currentPhase)}
                  </span>{" "}
                  and is not awaiting a decision.
                </p>
                {activeToken.currentPhase === "01_RESOURCE_MONITORING" && (
                  <p className="pending">Start the pipeline from the queue to reach the gate.</p>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate?.("queue")}
                  className="btn btn-block"
                >
                  Open queue
                </button>
              </div>
            )}
          </section>

          <section className="panel section-pad">
            <p className="eyebrow">SAFETY CONSTRAINTS</p>
            <p className="mt-3 text-[10px] leading-relaxed text-brand-muted">
              AO-02 never writes to facility controls. Remediation is simulated and advisory
              only; every decision is appended to the token&apos;s immutable audit trail with
              the originating telemetry hash.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
