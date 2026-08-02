"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { ApprovalDecision } from "@/lib/types/codeliver";

interface ApprovalActionsProps {
  onDecide: (decision: ApprovalDecision, note?: string) => void;
  loading?: boolean;
}

export default function ApprovalActions({
  onDecide,
  loading,
}: ApprovalActionsProps) {
  const [activeAction, setActiveAction] = useState<
    "approved_with_changes" | "changes_requested" | null
  >(null);
  const [note, setNote] = useState("");

  function handleQuickApprove() {
    onDecide("approved");
  }

  function handleSubmitWithNote() {
    if (activeAction === "changes_requested" && !note.trim()) return;
    onDecide(activeAction!, note.trim() || undefined);
    setActiveAction(null);
    setNote("");
  }

  function handleCancel() {
    setActiveAction(null);
    setNote("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={handleQuickApprove}
          disabled={loading || !!activeAction}
          className="flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--green)] px-2 py-2 text-center text-xs font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && !activeAction && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
          Approve
        </button>
        <button
          onClick={() => setActiveAction("approved_with_changes")}
          disabled={loading || !!activeAction}
          className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--green)] px-2 py-2 text-center text-xs font-medium text-[var(--green)] transition-all hover:bg-[var(--green)]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve with Changes
        </button>
        <button
          onClick={() => setActiveAction("changes_requested")}
          disabled={loading || !!activeAction}
          className="flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--red)] px-2 py-2 text-center text-xs font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Request Changes
        </button>
      </div>

      {activeAction && (
        <div className="flex flex-col gap-2 p-3 rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
          <label className="text-xs text-[var(--muted)]">
            {activeAction === "changes_requested"
              ? "Describe required changes *"
              : "Notes (optional)"}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={
              activeAction === "changes_requested"
                ? "What needs to change?"
                : "Any additional notes..."
            }
            className="w-full px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--bg)] border border-[var(--border)] text-[var(--ink)] text-sm placeholder:text-[var(--dim)] resize-none focus:outline-none focus:border-[var(--accent)]"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleCancel}
              disabled={loading}
              className="px-3 py-1.5 rounded-[var(--radius-sm)] text-sm text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitWithNote}
              disabled={
                loading ||
                (activeAction === "changes_requested" && !note.trim())
              }
              className="flex items-center gap-2 px-4 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
