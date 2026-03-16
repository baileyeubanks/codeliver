"use client";

import { useState } from "react";
import { AlertCircle, LoaderCircle, MapPin, MessageSquareText, Send, X } from "lucide-react";
import { formatTimeLong } from "@/lib/stores/playerStore";
import type { Comment } from "@/lib/types/codeliver";

interface InternalReviewComposerProps {
  assetId: string;
  assetType: string;
  timecode: number;
  pin: { x: number; y: number } | null;
  pinMode: boolean;
  replyToName?: string | null;
  onTogglePinMode: () => void;
  onClearPin: () => void;
  onCancelReply: () => void;
  onCommentCreated: (comment: Comment) => void;
  parentId?: string | null;
}

export default function InternalReviewComposer({
  assetId,
  assetType,
  timecode,
  pin,
  pinMode,
  replyToName,
  onTogglePinMode,
  onClearPin,
  onCancelReply,
  onCommentCreated,
  parentId,
}: InternalReviewComposerProps) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const supportsPins = assetType === "video" || assetType === "image";

  async function handleSubmit() {
    if (!body.trim() || submitting) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch(`/api/assets/${assetId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          parent_id: parentId ?? null,
          timecode_seconds: assetType === "video" ? timecode : null,
          pin_x: pin?.x ?? null,
          pin_y: pin?.y ?? null,
        }),
      });

      if (!response.ok) {
        throw new Error("Could not save your comment.");
      }

      const payload = await response.json().catch(() => null);
      const comment = (payload?.comment ?? payload) as Comment | null;

      if (!comment?.id) {
        throw new Error("Comment saved, but the response was invalid.");
      }

      onCommentCreated(comment);
      setBody("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not save your comment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-t border-[var(--border)] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="review-kicker">Add Direction</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Keep notes precise and tied to the frame or moment. Approval remains the decision on this cut.
          </p>
        </div>

        {supportsPins ? (
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
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {parentId ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-xs text-[var(--accent)]">
            <MessageSquareText size={10} />
            Replying to {replyToName || "thread"}
            <button
              type="button"
              onClick={onCancelReply}
              className="rounded-full p-0.5 transition-colors hover:bg-[var(--accent)]/15"
              aria-label="Cancel reply"
            >
              <X size={10} />
            </button>
          </span>
        ) : null}

        {assetType === "video" ? (
          <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--muted)]">
            Timestamp {formatTimeLong(timecode)}
          </span>
        ) : null}

        {pinMode && !pin ? (
          <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-xs text-[var(--accent)]">
            Click the media to place your pin.
          </span>
        ) : null}

        {pin ? (
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
        ) : null}
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
        rows={4}
        placeholder={parentId ? "Write a reply..." : "Add a review note..."}
        className="mt-3 w-full resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
      />

      {submitError ? (
        <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--red)]/20 bg-[var(--red)]/5 px-3 py-2 text-xs text-[var(--red)]">
          <AlertCircle size={12} />
          {submitError}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--dim)]">Use Cmd/Ctrl + Enter to send.</p>

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!body.trim() || submitting}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}
          {submitting ? "Sending..." : parentId ? "Send reply" : "Send note"}
        </button>
      </div>
    </div>
  );
}
