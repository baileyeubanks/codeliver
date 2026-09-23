"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, MapPin, MousePointerClick, PenLine, Send, X } from "lucide-react";
import { submitReviewComment } from "@/lib/review/submit-review-comment";
import { rasterizeAnnotations } from "@/components/review/annotation/rasterize";
import type { ShareIntent } from "@/lib/sharing/share-intent";
import { formatTimeLong } from "@/lib/stores/playerStore";
import type { AnnotationData, Comment } from "@/lib/types/codeliver";

interface PublicReviewComposerProps {
  token: string;
  demoMode?: boolean;
  assetId: string;
  assetType: string;
  versionId: string | null;
  reviewInviteId: string | null;
  shareIntent: ShareIntent;
  canComment: boolean;
  reviewerName: string;
  onReviewerNameChange: (value: string) => void;
  timecode: number;
  pin: { x: number; y: number; timeSeconds?: number | null } | null;
  /** Vector strokes drawn on the frame; rasterized and submitted with the note. */
  annotations?: AnnotationData[];
  /** Media-natural size used to rasterize the drawing preview. */
  rasterSize?: { width: number; height: number };
  onClearPin: () => void;
  onCommentCreated: (comment: Comment) => void;
}

/**
 * VA-019: the rail composer is contextual, never a permanent deck under the
 * frame. Idle state is one quiet line pointing at the film; tapping the film
 * pauses it, drops the pin, and opens this composer at the captured playhead.
 */
export default function PublicReviewComposer({
  token,
  demoMode = false,
  assetId,
  assetType,
  versionId,
  reviewInviteId,
  shareIntent,
  canComment,
  reviewerName,
  onReviewerNameChange,
  timecode,
  pin,
  annotations,
  rasterSize,
  onClearPin,
  onCommentCreated,
}: PublicReviewComposerProps) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);

  // Film and images compose from a tap-dropped pin; file types without a
  // tappable review surface keep a plain composer so feedback stays possible.
  const supportsPins = assetType === "video" || assetType === "image";
  const composing = canComment && (pin != null || !supportsPins);
  const hasDrawing = Boolean(annotations?.length);

  // A fresh pin moves focus straight into the composer: the name gate when
  // identity is still missing, otherwise the note itself.
  const pinKey = pin ? `${pin.x}:${pin.y}:${pin.timeSeconds ?? "still"}` : null;
  const lastPinKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pinKey || lastPinKeyRef.current === pinKey) return;
    lastPinKeyRef.current = pinKey;
    const target = reviewerName.trim() ? bodyInputRef.current : nameInputRef.current;
    target?.focus();
  }, [pinKey, reviewerName]);

  async function handleSubmit() {
    if (!canComment || !reviewerName.trim() || !body.trim() || submitting) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const size = rasterSize ?? { width: 1280, height: 720 };
      const drawing = hasDrawing
        ? rasterizeAnnotations(annotations ?? [], size.width, size.height)
        : null;
      const comment = await submitReviewComment({
        token,
        demoMode,
        assetId,
        assetType,
        versionId,
        reviewInviteId,
        reviewerName,
        body,
        timecode,
        pin,
        drawing,
        annotations: hasDrawing ? annotations : undefined,
      });

      onCommentCreated(comment);
      setBody("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not post your comment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!canComment) {
    const heading = shareIntent === "final_delivery"
      ? "Delivery"
      : shareIntent === "preview"
        ? "Preview"
        : "Review";
    const note = shareIntent === "final_delivery"
      ? "You can review the delivery details here and download the asset if the owner enabled it."
      : shareIntent === "preview"
        ? "This preview link is watch only — no account, no feedback deck."
        : "You can navigate the player, review existing comments, and download the asset if the owner enabled it.";

    return (
      <div className="px-5 py-4">
        <p className="text-sm font-semibold text-[var(--ink)]">{heading}</p>
        <div className="mt-4 border-l-2 border-[var(--accent)] px-3 py-1 text-sm text-[var(--muted)]">
          {note}
        </div>
      </div>
    );
  }

  if (!composing) {
    return (
      <div className="px-5 py-4">
        <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <MousePointerClick size={14} className="shrink-0 text-[var(--dim)]" aria-hidden="true" />
          {assetType === "image"
            ? "Tap the image to pin a note on that spot."
            : "Tap the film to pin a note at that frame."}
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Add a note</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {shareIntent === "internal_review"
              ? "Internal notes stay with this version."
              : shareIntent === "approval_needed"
                ? "Feedback stays attached to this approval round."
                : "Feedback stays attached to this version and timestamp."}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {assetType === "video" && (
          <span className="font-mono text-xs text-[var(--muted)]">
            {formatTimeLong(timecode)}
          </span>
        )}

        {pin ? (
          <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--orange)]/10 px-2.5 py-1 text-xs text-[var(--orange)]">
            <MapPin size={10} />
            Pin locked
            <button
              type="button"
              onClick={onClearPin}
              className="rounded p-0.5 transition-colors hover:bg-[var(--orange)]/15"
              aria-label="Clear pin"
            >
              <X size={10} />
            </button>
          </span>
        ) : null}

        {hasDrawing ? (
          <span
            data-drawing-attached
            className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--ink)]"
          >
            <PenLine size={10} />
            Drawing attached · {annotations?.length} stroke{annotations?.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <label
        htmlFor="public-review-reviewer-name"
        className="mt-4 block text-xs font-medium text-[var(--muted)]"
      >
        Your name
      </label>
      <input
        id="public-review-reviewer-name"
        ref={nameInputRef}
        value={reviewerName}
        onChange={(event) => onReviewerNameChange(event.target.value)}
        placeholder="How should this feedback be attributed?"
        autoComplete="name"
        className="mt-1.5 w-full border-b border-[var(--border)] bg-transparent px-0 py-2 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
      />

      <textarea
        ref={bodyInputRef}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void handleSubmit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onClearPin();
          }
        }}
        rows={4}
        placeholder={
          shareIntent === "internal_review"
            ? "Capture what should change before this leaves internal review."
            : shareIntent === "approval_needed"
              ? "Share any blocker, rationale, or final note that should sit beside your approval decision."
              : "Share what needs to change, what is working, or where approval is blocked."
        }
        className="mt-3 w-full resize-none border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
      />

      {submitError && (
        <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--red)]/20 bg-[var(--red)]/5 px-3 py-2 text-xs text-[var(--red)]">
          <AlertCircle size={12} />
          {submitError}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--dim)]">Attached to this version</p>

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
    </div>
  );
}
