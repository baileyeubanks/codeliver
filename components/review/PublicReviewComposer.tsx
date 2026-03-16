"use client";

import { useState } from "react";
import { AlertCircle, LoaderCircle, MapPin, Send, X } from "lucide-react";
import type { ShareIntent } from "@/lib/sharing/share-intent";
import { formatTimeLong } from "@/lib/stores/playerStore";
import type { Comment } from "@/lib/types/codeliver";

interface PublicReviewComposerProps {
  token: string;
  assetType: string;
  shareIntent: ShareIntent;
  canComment: boolean;
  reviewerName: string;
  onReviewerNameChange: (value: string) => void;
  timecode: number;
  pin: { x: number; y: number } | null;
  pinMode: boolean;
  onTogglePinMode: () => void;
  onClearPin: () => void;
  onCommentCreated: (comment: Comment) => void;
}

export default function PublicReviewComposer({
  token,
  assetType,
  shareIntent,
  canComment,
  reviewerName,
  onReviewerNameChange,
  timecode,
  pin,
  pinMode,
  onTogglePinMode,
  onClearPin,
  onCommentCreated,
}: PublicReviewComposerProps) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const supportsPins = assetType === "video" || assetType === "image";
  const heading =
    shareIntent === "internal_review"
      ? "Internal feedback"
      : shareIntent === "approval_needed"
        ? "Review notes"
        : shareIntent === "final_delivery"
          ? "Delivery details"
          : "Client feedback";
  const helperText = canComment
    ? shareIntent === "internal_review"
      ? "Capture working-session notes tied to the current frame or timestamp."
      : shareIntent === "approval_needed"
        ? "Use comments for blockers or context. Approval should record your decision on this version, not replace feedback."
        : "Leave clear client-facing notes tied to the current frame or timestamp."
    : shareIntent === "final_delivery"
      ? "This link is a final delivery handoff. Feedback is closed."
      : "This review link is view only.";
  const placeholder =
    shareIntent === "internal_review"
      ? "Capture what should change before this leaves internal review."
      : shareIntent === "approval_needed"
        ? "Share any blocker, rationale, or final note that should sit beside your approval decision."
        : "Share what needs to change, what is working, or where approval is blocked.";

  async function handleSubmit() {
    if (!canComment || !reviewerName.trim() || !body.trim() || submitting) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch(`/api/review/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          author_name: reviewerName.trim(),
          timecode_seconds: assetType === "video" ? timecode : null,
          pin_x: pin?.x ?? null,
          pin_y: pin?.y ?? null,
        }),
      });

      if (!response.ok) {
        throw new Error("Could not post your comment.");
      }

      const payload = await response.json().catch(() => null);
      const comment = (payload?.comment ?? payload) as Comment | null;

      if (!comment?.id) {
        throw new Error("Comment saved, but the response was invalid.");
      }

      onCommentCreated(comment);
      setBody("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not post your comment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-t border-[var(--border)] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
            {heading}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">{helperText}</p>
        </div>

        {canComment && supportsPins && (
          <button
            type="button"
            onClick={onTogglePinMode}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              pinMode || pin
                ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
                : "bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--surface-2)]/80"
            }`}
          >
            <MapPin size={12} />
            {pin ? "Adjust pin" : pinMode ? "Pin ready" : "Place pin"}
          </button>
        )}
      </div>

      {canComment ? (
        <>
          <label className="mt-4 block text-xs font-medium uppercase tracking-[0.12em] text-[var(--dim)]">
            Reviewer name
          </label>
          <input
            value={reviewerName}
            onChange={(event) => onReviewerNameChange(event.target.value)}
            placeholder="How should this feedback be attributed?"
            className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {assetType === "video" && (
              <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--muted)]">
                Timestamp {formatTimeLong(timecode)}
              </span>
            )}

            {pinMode && !pin && (
              <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-xs text-[var(--accent)]">
                Click the frame to drop your pin.
              </span>
            )}

            {pin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--orange)]/10 px-2.5 py-1 text-xs text-[var(--orange)]">
                <MapPin size={10} />
                Pin locked
                <button
                  type="button"
                  onClick={onClearPin}
                  className="rounded-full p-0.5 transition-colors hover:bg-[var(--orange)]/15"
                  aria-label="Clear pin"
                >
                  <X size={10} />
                </button>
              </span>
            )}
          </div>

          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            rows={5}
            placeholder={placeholder}
            className="mt-3 w-full resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
          />

          {submitError && (
            <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--red)]/20 bg-[var(--red)]/5 px-3 py-2 text-xs text-[var(--red)]">
              <AlertCircle size={12} />
              {submitError}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--dim)]">Use Cmd/Ctrl + Enter to send.</p>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!reviewerName.trim() || !body.trim() || submitting}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}
              {submitting ? "Sending..." : "Send comment"}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm text-[var(--muted)]">
          {shareIntent === "final_delivery"
            ? "You can review the delivery details here and download the asset if the owner enabled it."
            : "You can navigate the player, review existing comments, and download the asset if the owner enabled it."}
        </div>
      )}
    </div>
  );
}
