"use client";

import { useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { finishDemoReview, type FinishReviewOutcome } from "@/lib/demo/workspace-store";
import type { AssetApprovalState } from "@/lib/approvals/approval-machine";

interface FinishReviewBarProps {
  assetId: string;
  reviewerName: string;
  reviewerEmail?: string | null;
  /**
   * P20 gate honesty: when the asset's approval is locked (terminal), every
   * finish action is visibly disabled — no further decisions can be recorded.
   */
  locked?: boolean;
  /** When provided, the bar renders the asset's approval state pill. */
  assetState?: AssetApprovalState;
  onFinished?: (message: string) => void;
}

const ASSET_STATE_LABEL: Record<AssetApprovalState, string> = {
  needs_review: "Needs review",
  feedback_submitted: "Feedback submitted",
  changes_in_progress: "Changes in progress",
  approved: "Approved",
  locked: "Locked",
};

/**
 * The guest's closing act (Co‑ProVideo review promise): submit the round as a
 * durable decision. Approved / Request changes / Notes only — all recorded
 * with the reviewer's open comments attached as provenance.
 */
export default function FinishReviewBar({ assetId, reviewerName, reviewerEmail, locked = false, assetState, onFinished }: FinishReviewBarProps) {
  const [submitted, setSubmitted] = useState<string | null>(null);

  function finish(outcome: FinishReviewOutcome) {
    const result = finishDemoReview({
      assetId,
      reviewerName,
      reviewerEmail,
      outcome,
      note: "",
    });
    if (!result.ok) {
      onFinished?.(result.reason);
      return;
    }
    const message =
      outcome === "approved"
        ? "Review finished — your approval is on the record."
        : outcome === "changes_requested"
          ? "Review finished — your requested changes are consolidated for the next round."
          : "Review finished — your notes are on the record.";
    setSubmitted(message);
    onFinished?.(message);
  }

  if (submitted) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm text-[var(--ink)]" role="status">
        <CheckCircle2 size={15} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
        {submitted}
      </div>
    );
  }

  if (locked) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-3" role="status">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <Lock size={14} />
          Finish review
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          This approval is locked — the decision is final and no further review actions can be recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--ink)]">Finish review</p>
        {assetState && (
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
            {ASSET_STATE_LABEL[assetState]}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Submits your round as a durable decision with your comments attached.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!reviewerName.trim()}
          onClick={() => finish("approved")}
        >
          Approve & finish
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!reviewerName.trim()}
          onClick={() => finish("changes_requested")}
        >
          Request changes & finish
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!reviewerName.trim()}
          onClick={() => finish("notes_only")}
        >
          Finish without a decision
        </button>
      </div>
    </div>
  );
}
