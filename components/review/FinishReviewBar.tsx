"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { finishDemoReview, type FinishReviewOutcome } from "@/lib/demo/workspace-store";

interface FinishReviewBarProps {
  assetId: string;
  reviewerName: string;
  reviewerEmail?: string | null;
  onFinished?: (message: string) => void;
}

/**
 * The guest's closing act (Webster review promise): submit the round as a
 * durable decision. Approved / Request changes / Notes only — all recorded
 * with the reviewer's open comments attached as provenance.
 */
export default function FinishReviewBar({ assetId, reviewerName, reviewerEmail, onFinished }: FinishReviewBarProps) {
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

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
      <p className="mb-2 text-sm font-semibold text-[var(--ink)]">Finish review</p>
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
