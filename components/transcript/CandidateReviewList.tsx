"use client";

import { Check, Play, RotateCcw, X } from "lucide-react";
import type { AnalysisCandidate } from "@/lib/audio-analysis/core";

interface CandidateReviewListProps {
  candidates: readonly AnalysisCandidate[];
  pendingCandidateId?: string | null;
  onPreview?: (candidate: AnalysisCandidate) => void;
  onDecision?: (candidate: AnalysisCandidate, action: "accept" | "reject") => void | Promise<void>;
}

function timecode(milliseconds: number): string {
  const seconds = milliseconds / 1_000;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function statusLabel(candidate: AnalysisCandidate) {
  if (candidate.review.status === "accepted") return "Accepted";
  if (candidate.review.status === "rejected") return "Rejected";
  if (candidate.review.revision > 0) return `Adjusted r${candidate.review.revision}`;
  return "Proposed";
}

export function CandidateReviewList({
  candidates,
  pendingCandidateId = null,
  onPreview,
  onDecision,
}: CandidateReviewListProps) {
  if (candidates.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--muted)]">No candidates in this view.</p>;
  }

  return (
    <ol className="divide-y divide-[var(--border)]" aria-label="Audio analysis candidates">
      {candidates.map((candidate) => {
        const pending = pendingCandidateId === candidate.id;
        const proposed = candidate.review.status === "proposed";
        return (
          <li key={candidate.id} className="grid min-h-24 grid-cols-[minmax(0,1fr)_auto] gap-3 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase text-[var(--ink-secondary)]">
                  {candidate.detector === "filler_word" ? "Filler" : "Silence"}
                </span>
                <span className="font-mono text-xs text-[var(--muted)]">
                  {timecode(candidate.startMs)}-{timecode(candidate.endMs)}
                </span>
                <span className="text-xs text-[var(--muted)]">{statusLabel(candidate)}</span>
              </div>
              <p className="mt-1 truncate text-sm font-medium text-[var(--ink)]">{candidate.label}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                <span>Confidence {Math.round(candidate.confidence.raw * 100)}%</span>
                <span>{candidate.confidence.calibrationStatus}</span>
                <span>{candidate.risks.length} risk flags</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="Preview in context"
                aria-label={`Preview ${candidate.label}`}
                className="grid size-9 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)] disabled:opacity-40"
                onClick={() => onPreview?.(candidate)}
                disabled={pending}
              >
                <Play size={15} aria-hidden="true" />
              </button>
              {proposed ? (
                <>
                  <button
                    type="button"
                    title="Accept proposal"
                    aria-label={`Accept ${candidate.label}`}
                    className="grid size-9 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--green)] hover:bg-[var(--accent-dim)] disabled:opacity-40"
                    onClick={() => onDecision?.(candidate, "accept")}
                    disabled={pending || !onDecision}
                  >
                    <Check size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="Reject proposal"
                    aria-label={`Reject ${candidate.label}`}
                    className="grid size-9 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--red)] hover:bg-[var(--red-dim)] disabled:opacity-40"
                    onClick={() => onDecision?.(candidate, "reject")}
                    disabled={pending || !onDecision}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <span
                  title="Decision is reversible through a new composition revision"
                  className="grid size-9 place-items-center text-[var(--dim)]"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
