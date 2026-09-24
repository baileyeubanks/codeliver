"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, GripVertical, ImagePlus, LoaderCircle, PenLine, Send, X } from "lucide-react";
import { submitReviewComment } from "@/lib/review/submit-review-comment";
import { formatTimeLong } from "@/lib/stores/playerStore";
import type { AnnotationData, Comment } from "@/lib/types/codeliver";
import { rasterizeAnnotations } from "@/components/review/annotation/rasterize";
import AnchoredLeaderLine from "@/components/review/AnchoredLeaderLine";
import { useCalloutDrag } from "@/components/review/useCalloutDrag";
import { closePersistedAttachmentDraft, REVIEW_IMAGE_ACCEPT, uploadReviewImageAttachment, validateReviewImage } from "@/lib/review/image-attachments-client";
import type { CommentAttachment } from "@/lib/types/codeliver";

interface InlineReviewCommentProps {
  token?: string;
  demoMode?: boolean;
  assetId: string;
  assetType?: string;
  versionId: string | null;
  reviewInviteId: string | null;
  reviewerName: string;
  onReviewerNameChange: (value: string) => void;
  timecode: number;
  pin: { x: number; y: number };
  /** Vector strokes drawn on the frame; submitted with the comment. */
  annotations?: AnnotationData[];
  /** Media-natural size used to rasterize the drawing preview. */
  rasterSize?: { width: number; height: number };
  onCancel: () => void;
  onCommentCreated?: (comment: Comment) => void;
  /** Internal review uses its authenticated asset route. This callback must
   * resolve only after that route has persisted the exact version-bound note. */
  onPersist?: (input: { body: string; timecode: number; pin: { x: number; y: number } }) => Promise<{ id: string }>;
  attachmentEndpoint?: string;
  onAttachmentCreated?: (commentId: string, attachment: CommentAttachment) => void;
  onComplete?: () => void;
}

export default function InlineReviewComment({
  token,
  demoMode = false,
  assetId,
  assetType = "video",
  versionId,
  reviewInviteId,
  reviewerName,
  onReviewerNameChange,
  timecode,
  pin,
  annotations,
  rasterSize,
  onCancel,
  onCommentCreated,
  onPersist,
  attachmentEndpoint,
  onAttachmentCreated,
  onComplete,
}: InlineReviewCommentProps) {
  const reviewerNameRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const initialReviewerNamePresent = useRef(Boolean(reviewerName.trim()));
  const [collectReviewerName, setCollectReviewerName] = useState(!initialReviewerNamePresent.current);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [persistedComment, setPersistedComment] = useState<({ id: string } & Partial<Comment>) | null>(null);
  const attachmentKey = useRef<string | null>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const [phoneSheet, setPhoneSheet] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { offset, beginDragging } = useCalloutDrag(cardRef);
  const horizontalSide = pin.x > 56 ? "left" : "right";
  const verticalSide = pin.y > 56 ? "above" : "below";

  useEffect(() => {
    if (initialReviewerNamePresent.current) {
      commentRef.current?.focus();
    } else {
      reviewerNameRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const apply = () => setPhoneSheet(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  async function submit() {
    if (!reviewerName.trim() || submitting) return;
    if (!persistedComment && !body.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      let comment: ({ id: string } & Partial<Comment>) | null = persistedComment;
      if (!comment) {
        const hasDrawing = Boolean(annotations?.length);
        const size = rasterSize ?? { width: 1280, height: 720 };
        const drawing = hasDrawing ? rasterizeAnnotations(annotations ?? [], size.width, size.height) : null;
        comment = onPersist
          ? await onPersist({ body: body.trim(), timecode, pin })
          : await submitReviewComment({ token: token ?? "", demoMode, assetId, assetType, versionId, reviewInviteId, reviewerName, body, timecode, pin, drawing, annotations: hasDrawing ? annotations : undefined });
        if (!attachment) {
          onCommentCreated?.(comment as Comment);
          onComplete?.();
          return;
        }
        setPersistedComment(comment);
      }
      if (!attachment || !attachmentEndpoint || !versionId) throw new Error("Image attachments are unavailable for this review version.");
      attachmentKey.current ??= crypto.randomUUID();
      const saved = await uploadReviewImageAttachment({ endpoint: attachmentEndpoint, commentId: comment.id, versionId, idempotencyKey: attachmentKey.current, file: attachment });
      if (onCommentCreated && typeof comment.body === "string") {
        onCommentCreated({ ...(comment as Comment), attachments: [...(comment.attachments ?? []), saved] });
      }
      onAttachmentCreated?.(comment.id, saved);
      onComplete?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not post your comment.");
    } finally { setSubmitting(false); }
  }

  function closeDraft() {
    closePersistedAttachmentDraft({
      persistedComment,
      onCommentCreated: onCommentCreated
        ? (comment) => onCommentCreated(comment as Comment)
        : undefined,
      onCancel,
    });
  }

  const commentCard = (
      <div
        ref={cardRef}
        className="review-inline-comment-card"
        data-phone-sheet={phoneSheet ? "true" : undefined}
        role="dialog"
        aria-label={`Add a comment at ${formatTimeLong(timecode)}`}
        aria-busy={submitting}
        style={phoneSheet ? { position: "fixed", left: 8, right: 8, bottom: 12, width: "auto", maxWidth: "none", transform: "none", zIndex: 80 } : undefined}
      >
      <header>
        <button type="button" className="review-inline-comment-drag" onPointerDown={beginDragging} aria-label="Move comment card"><GripVertical size={14} /></button>
        <div>
          <strong>{reviewerName.trim() || "Reviewer"}</strong>
          <span>{formatTimeLong(timecode)}</span>
        </div>
        <button type="button" onClick={closeDraft} title="Cancel comment" aria-label="Cancel comment">
          <X size={14} />
        </button>
      </header>

      {!demoMode ? <div className="review-inline-comment-attachment"><input ref={attachmentInput} type="file" accept={REVIEW_IMAGE_ACCEPT} hidden onChange={(event) => { const file = event.target.files?.[0] ?? null; const invalid = file ? validateReviewImage(file) : null; if (invalid) { setAttachment(null); setError(invalid); return; } setAttachment(file); attachmentKey.current = null; setError(""); }} /><button type="button" onClick={() => attachmentInput.current?.click()} disabled={submitting || Boolean(persistedComment)} aria-label="Attach image"><ImagePlus size={13} /> {attachment ? attachment.name : "Attach image"}</button>{attachment ? <button type="button" onClick={() => persistedComment ? closeDraft() : setAttachment(null)} disabled={submitting} aria-label="Remove attached image"><X size={13} /></button> : null}</div> : null}

      {persistedComment ? <p className="review-inline-comment-error" role="status">Comment saved. Retry the image or remove it to close.</p> : null}

      {annotations?.length ? (
        <p
          data-drawing-attached
          className="mx-3 mt-2 flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--ink)]"
        >
          <PenLine size={12} />
          Drawing attached · {annotations.length} stroke{annotations.length === 1 ? "" : "s"}
        </p>
      ) : null}

      {collectReviewerName ? (
        <label>
          <span>Reviewer name</span>
          <input
            ref={reviewerNameRef}
            value={reviewerName}
            onChange={(event) => onReviewerNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && reviewerName.trim()) {
                event.preventDefault();
                setCollectReviewerName(false);
                commentRef.current?.focus();
              }
              if (event.key === "Escape") closeDraft();
            }}
            placeholder="Your name"
            autoComplete="name"
          />
        </label>
      ) : null}

      <div className="review-inline-comment-entry">
        <textarea
          ref={commentRef}
          value={body}
          readOnly={Boolean(persistedComment)}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current) {
              event.preventDefault();
              void submit();
            }
            if (event.key === "Escape") closeDraft();
          }}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          rows={2}
          placeholder="Add a precise note..."
          aria-label="Comment"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!reviewerName.trim() || (!body.trim() && !persistedComment) || submitting}
          title="Send comment"
          aria-label="Send comment"
        >
          {submitting ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
        </button>
      </div>

      {error ? (
        <p role="alert"><AlertCircle size={12} /> {error}</p>
      ) : null}
      </div>
  );

  return (
    <div
      ref={anchorRef}
      className="review-inline-comment"
      data-horizontal={horizontalSide}
      data-vertical={verticalSide}
      style={{ left: `${pin.x}%`, top: `${pin.y}%`, "--callout-drag-x": `${offset.x}px`, "--callout-drag-y": `${offset.y}px` } as CSSProperties}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <AnchoredLeaderLine anchorRef={anchorRef} cardRef={cardRef} refreshKey={`${offset.x}:${offset.y}:${phoneSheet}`} className="review-inline-comment-leader" />
      {phoneSheet && typeof document !== "undefined" ? createPortal(commentCard, document.body) : commentCard}
    </div>
  );
}
