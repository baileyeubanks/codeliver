"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  XCircle,
} from "lucide-react";
import type {
  ApprovalDecision,
  ApprovalStep,
  WorkflowMode,
} from "@/lib/types/codeliver";
import {
  activeApprovalSteps,
  currentAssetState,
  shapeAuditEntry,
  stepChipState,
  type ApprovalAuditEntry,
  type AssetApprovalState,
  type StepChipState,
} from "@/lib/approvals/approval-machine";

/** What the panel hands to its host when the reviewer records a decision. */
export interface ApprovalPanelDecision {
  stepId: string;
  decision: ApprovalDecision;
  actorName: string;
  note: string | null;
  audit: ApprovalAuditEntry;
}

interface ApprovalPanelProps {
  steps: ApprovalStep[];
  comments?: readonly { id: string }[];
  workflowMode?: WorkflowMode | null;
  /** Host-computed active steps; falls back to the state machine's own rules. */
  activeStepIds?: string[];
  /** Locked is terminal: the panel renders it and disables every action. */
  locked?: boolean;
  locking?: boolean;
  onLock?: () => void | Promise<void>;
  identityName?: string | null;
  identityEmail?: string | null;
  /** Whether this viewer may decide the active step (host's call). */
  canDecide?: boolean;
  submitting?: boolean;
  error?: string | null;
  /** Passed through to the audit entry only when genuinely available. */
  userAgent?: string | null;
  onDecide?: (decision: ApprovalPanelDecision) => void | Promise<void>;
}

const STATE_PILL: Record<AssetApprovalState, { label: string; color: string }> = {
  needs_review: { label: "Needs review", color: "var(--orange)" },
  feedback_submitted: { label: "Feedback submitted", color: "var(--blue)" },
  changes_in_progress: { label: "Changes in progress", color: "var(--orange)" },
  approved: { label: "Approved", color: "var(--green)" },
  locked: { label: "Locked", color: "var(--dim)" },
};

const CHIP_STYLE: Record<StepChipState, { label: string; color: string }> = {
  pending: { label: "Pending", color: "var(--dim)" },
  current: { label: "Current", color: "var(--orange)" },
  approved: { label: "Approved", color: "var(--green)" },
  rejected: { label: "Rejected", color: "var(--red)" },
};

function ChipIcon({ state }: { state: StepChipState }) {
  const color = CHIP_STYLE[state].color;
  if (state === "approved") return <CheckCircle2 size={12} style={{ color }} />;
  if (state === "rejected") return <XCircle size={12} style={{ color }} />;
  if (state === "current") return <AlertCircle size={12} style={{ color }} />;
  return <Clock size={12} style={{ color }} />;
}

/**
 * P20 approval panel (Documenso approver pattern). Presentational: the host
 * owns persistence and passes the truthful step list back down. One click
 * approves the current step with an optional name + note (prefilled from the
 * reviewer's identity when known); requesting changes or rejecting requires
 * a note. Every decision is shaped into an audit entry before it leaves the
 * panel. Locked is terminal and visibly disables all approval actions.
 */
export default function ApprovalPanel({
  steps,
  comments = [],
  workflowMode = null,
  activeStepIds,
  locked = false,
  locking = false,
  onLock,
  identityName = null,
  identityEmail = null,
  canDecide,
  submitting = false,
  error = null,
  userAgent = null,
  onDecide,
}: ApprovalPanelProps) {
  const [name, setName] = useState(identityName ?? "");
  const [note, setNote] = useState("");

  const assetState: AssetApprovalState = locked
    ? "locked"
    : currentAssetState(steps, comments);
  const pill = STATE_PILL[assetState];

  const orderedSteps = [...steps].sort((left, right) => left.step_order - right.step_order);
  const activeIds =
    activeStepIds ?? activeApprovalSteps(steps, workflowMode).map((step) => step.id);
  const currentStep =
    orderedSteps.find((step) => step.status === "pending" && activeIds.includes(step.id)) ?? null;

  const mayDecide = Boolean(onDecide) && (canDecide ?? true) && !locked && !submitting;
  const trimmedNote = note.trim();
  const negativeNeedsNote = !trimmedNote;

  function recordDecision(decision: ApprovalDecision) {
    if (!currentStep || !onDecide || !mayDecide) return;
    if ((decision === "changes_requested" || decision === "rejected") && !trimmedNote) return;

    const actorName = name.trim() || identityEmail?.trim() || "External reviewer";
    const audit = shapeAuditEntry({
      step: currentStep,
      actor: { name: actorName, email: identityEmail },
      decision,
      note: trimmedNote || null,
      decidedAt: new Date().toISOString(),
      userAgent,
    });
    onDecide({
      stepId: currentStep.id,
      decision,
      actorName,
      note: trimmedNote || null,
      audit,
    });
  }

  return (
    <section
      aria-label="Approval"
      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)]/72 p-4"
      data-approval-state={assetState}
      data-testid="approval-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Approval</h3>
        <span
          className="approval-state-pill shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: `color-mix(in srgb, ${pill.color} 14%, transparent)`, color: pill.color }}
        >
          {assetState === "locked" && (
            <Lock size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
          )}
          {pill.label}
        </span>
      </div>

      {orderedSteps.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          No approval steps are configured for this asset.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2" aria-label="Approval steps">
          {orderedSteps.map((step) => {
            const chip = stepChipState(step, activeIds);
            const chipStyle = CHIP_STYLE[chip];
            return (
              <li
                key={step.id}
                data-step-id={step.id}
                data-chip-state={chip}
                className={`flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-3 py-2 ${
                  chip === "current" ? "border-[var(--accent)]" : "border-[var(--border)]"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ChipIcon state={chip} />
                  <span className="text-xs text-[var(--dim)]">Step {step.step_order}</span>
                  <span className="truncate text-sm font-medium text-[var(--ink)]">
                    {step.role_label}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {step.decided_at && (
                    <span className="text-xs text-[var(--dim)]">
                      {new Date(step.decided_at).toLocaleString()}
                    </span>
                  )}
                  <span
                    className="rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${chipStyle.color} 14%, transparent)`,
                      color: chipStyle.color,
                    }}
                  >
                    {chipStyle.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {locked ? (
        <p
          role="status"
          className="approval-locked-notice mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]"
        >
          <Lock size={12} />
          Locked — this approval is final and can no longer be changed.
        </p>
      ) : currentStep && onDecide ? (
        <div className="approval-decision mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-xs font-medium text-[var(--ink)]">
            Your decision — Step {currentStep.step_order} · {currentStep.role_label}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <label className="text-xs text-[var(--muted)]">
              Your name (optional)
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={identityEmail ?? "External reviewer"}
                disabled={!mayDecide}
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Note (optional for approval — required to request changes or reject)
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Add a note for the record…"
                disabled={!mayDecide}
                className="mt-1 w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
              />
            </label>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => recordDecision("approved")}
              disabled={!mayDecide}
              className="flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--green)] px-2 py-2 text-xs font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 size={13} className="animate-spin" />}
              Approve
            </button>
            <button
              type="button"
              onClick={() => recordDecision("changes_requested")}
              disabled={!mayDecide || negativeNeedsNote}
              title={negativeNeedsNote ? "Requesting changes requires a note." : undefined}
              className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--orange)] px-2 py-2 text-xs font-medium text-[var(--orange)] transition-all hover:bg-[var(--orange)]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Request changes
            </button>
            <button
              type="button"
              onClick={() => recordDecision("rejected")}
              disabled={!mayDecide || negativeNeedsNote}
              title={negativeNeedsNote ? "Rejecting requires a note." : undefined}
              className="min-h-10 rounded-[var(--radius-sm)] bg-[var(--red)] px-2 py-2 text-xs font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reject
            </button>
          </div>
          {negativeNeedsNote && (
            <p className="mt-2 text-xs text-[var(--dim)]">
              One click approves. Requesting changes or rejecting requires a note.
            </p>
          )}
        </div>
      ) : null}

      {!locked && assetState === "approved" && onLock && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void onLock()}
            disabled={locking}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--dim)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {locking ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
            Lock approval
          </button>
          <p className="mt-1 text-xs text-[var(--dim)]">
            Locking is final — no further approval actions will be possible.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-[var(--red)]">
          {error}
        </p>
      )}
    </section>
  );
}
