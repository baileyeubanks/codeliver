"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Download,
  MapPin,
  X,
} from "lucide-react";
import ApprovalStepCard from "@/components/approvals/ApprovalStep";
import CommentThread from "@/components/comments/CommentThread";
import FrameIndicator from "@/components/player/FrameIndicator";
import ReviewMediaSurface from "@/components/review/ReviewMediaSurface";
import ReviewWorkspace from "@/components/review/PublicReviewWorkspace";
import PublicReviewComposer from "@/components/review/PublicReviewComposer";
import { demoReviewPayload } from "@/lib/review/demoReview";
import {
  deriveReviewState,
  formatAssetStatusLabel,
} from "@/lib/review-state";
import {
  deriveShareIntent,
  formatShareIntentMeta,
  normalizeShareIntent,
  resolveShareIntentDefaults,
  type ShareIntent,
} from "@/lib/sharing/share-intent";
import { formatTimeLong, usePlayerStore } from "@/lib/stores/playerStore";
import type {
  ApprovalDecision,
  ApprovalStep,
  Comment as ReviewComment,
  SharePermission,
  WorkflowMode,
} from "@/lib/types/codeliver";
import PlayerTimeline from "@/components/player/PlayerTimeline";

interface Asset {
  id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  status: string;
  projects: { name: string } | null;
}

interface ReviewInvite {
  id: string;
  reviewer_name: string | null;
  expires_at: string | null;
  permissions: SharePermission;
  download_enabled: boolean;
  watermark_enabled: boolean;
  watermark_text: string | null;
  view_count: number;
  max_views: number | null;
}

interface ReviewPayload {
  asset: Asset;
  approvals: ApprovalStep[];
  active_approval_ids?: string[];
  approval_access_message?: string | null;
  comments: ReviewComment[];
  permissions: SharePermission;
  share_intent: ShareIntent;
  reviewer_name: string | null;
  expires_at: string | null;
  download_enabled: boolean;
  watermark_enabled: boolean;
  watermark_text: string | null;
  workflow_mode: WorkflowMode | null;
  invite: {
    id: string;
    view_count: number;
    max_views: number | null;
  };
}

type CommentFilter = "open" | "all" | "resolved";

function formatShortDate(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function threadSort(a: ReviewComment, b: ReviewComment, fileType: string): number {
  if (fileType === "video") {
    const aTime = a.timecode_seconds ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.timecode_seconds ?? Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
  }

  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function defaultActiveApprovalIds(
  approvals: ApprovalStep[],
  workflowMode: WorkflowMode | null,
  reviewerEmail?: string | null,
) {
  const normalizedReviewerEmail = reviewerEmail?.trim().toLowerCase();
  if (!normalizedReviewerEmail) {
    return [];
  }

  const orderedApprovals = [...approvals].sort((a, b) => a.step_order - b.step_order);
  const pendingApprovals = orderedApprovals.filter((approval) => approval.status === "pending");
  const workflowActiveApprovals =
    workflowMode === "sequential" ? pendingApprovals.slice(0, 1) : pendingApprovals;

  return workflowActiveApprovals
    .filter((approval) => approval.assignee_email?.trim().toLowerCase() === normalizedReviewerEmail)
    .map((approval) => approval.id);
}

export default function PublicReviewPage() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);

  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const resetPlayer = usePlayerStore((state) => state.reset);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [invite, setInvite] = useState<ReviewInvite | null>(null);
  const [approvals, setApprovals] = useState<ApprovalStep[]>([]);
  const [activeApprovalIds, setActiveApprovalIds] = useState<string[]>([]);
  const [approvalAccessMessage, setApprovalAccessMessage] = useState("");
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [permissions, setPermissions] = useState<SharePermission>("view");
  const [shareIntent, setShareIntent] = useState<ShareIntent>("client_review");
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CommentFilter>("open");
  const [pinMode, setPinMode] = useState(false);
  const [commentPin, setCommentPin] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const demoMode =
    process.env.NODE_ENV !== "production" && (token === "demo" || searchParams.get("demo") === "1");

  useEffect(() => {
    resetPlayer();
    return () => resetPlayer();
  }, [resetPlayer]);

  useEffect(() => {
    let cancelled = false;

    async function loadReview() {
      try {
        if (demoMode) {
          const requestedIntent =
            normalizeShareIntent(searchParams.get("intent")) ??
            deriveShareIntent({
              permissions: demoReviewPayload.permissions,
              downloadEnabled: demoReviewPayload.download_enabled,
              watermarkEnabled: demoReviewPayload.watermark_enabled,
            });
          const intentDefaults = resolveShareIntentDefaults(requestedIntent);
          const review = {
            ...demoReviewPayload,
            permissions: intentDefaults.permissions,
            download_enabled: intentDefaults.downloadEnabled,
            watermark_enabled: intentDefaults.watermarkEnabled,
            reviewer_name:
              requestedIntent === "approval_needed" ? demoReviewPayload.reviewer_name : "Maya Chen",
            reviewer_email:
              requestedIntent === "approval_needed" ? demoReviewPayload.reviewer_email : null,
          };
          const rootComments = review.comments.filter((comment) => !comment.parent_id);
          const initialSelection =
            rootComments.find((comment) => comment.status === "open")?.id ??
            rootComments[0]?.id ??
            null;

          setAsset(review.asset);
          setInvite({
            id: review.invite.id,
            reviewer_name: review.reviewer_name,
            expires_at: review.expires_at,
            permissions: review.permissions,
            download_enabled: review.download_enabled,
            watermark_enabled: review.watermark_enabled,
            watermark_text: review.watermark_text,
            view_count: review.invite.view_count,
            max_views: review.invite.max_views,
          });
          setApprovals(review.approvals);
          setActiveApprovalIds(
            defaultActiveApprovalIds(review.approvals, review.workflow_mode, review.reviewer_email),
          );
          setApprovalAccessMessage("");
          setComments(review.comments);
          setPermissions(review.permissions);
          setShareIntent(requestedIntent);
          setWorkflowMode(review.workflow_mode);
          setReviewerName(review.reviewer_name ?? "");
          setSelectedCommentId(initialSelection);
          setLoading(false);
          return;
        }

        const response = await fetch(`/api/review/${token}`);
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || "Invalid or expired review link.");
        }

        if (cancelled) return;

        const review = payload as ReviewPayload;
        const rootComments = (review.comments ?? []).filter((comment) => !comment.parent_id);
        const initialSelection =
          rootComments.find((comment) => comment.status === "open")?.id ??
          rootComments[0]?.id ??
          null;

        setAsset(review.asset);
        setInvite({
          id: review.invite.id,
          reviewer_name: review.reviewer_name,
          expires_at: review.expires_at,
          permissions: review.permissions,
          download_enabled: review.download_enabled,
          watermark_enabled: review.watermark_enabled,
          watermark_text: review.watermark_text,
          view_count: review.invite.view_count,
          max_views: review.invite.max_views,
        });
        setApprovals(review.approvals ?? []);
        setActiveApprovalIds(
          review.active_approval_ids ??
            defaultActiveApprovalIds(review.approvals ?? [], review.workflow_mode, null),
        );
        setApprovalAccessMessage(review.approval_access_message ?? "");
        setComments(review.comments ?? []);
        setPermissions(review.permissions);
        setShareIntent(review.share_intent);
        setWorkflowMode(review.workflow_mode);
        setReviewerName(review.reviewer_name ?? "");
        setSelectedCommentId(initialSelection);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load this review.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReview();

    return () => {
      cancelled = true;
    };
  }, [demoMode, searchParams, token]);

  const canComment = permissions === "comment" || permissions === "approve";
  const rootComments = comments.filter((comment) => !comment.parent_id);
  const repliesByParent = new Map<string, ReviewComment[]>();
  const threadNumberById = new Map<string, number>();

  rootComments.forEach((comment, index) => {
    threadNumberById.set(comment.id, index + 1);
  });

  comments.forEach((comment) => {
    if (!comment.parent_id) return;
    const existing = repliesByParent.get(comment.parent_id) ?? [];
    existing.push(comment);
    repliesByParent.set(comment.parent_id, existing);
  });

  const pinnedThreads = rootComments.filter(
    (comment) => comment.pin_x != null && comment.pin_y != null,
  ).length;
  const timedThreads = rootComments.filter((comment) => comment.timecode_seconds != null).length;

  const filteredComments = rootComments
    .filter((comment) => {
      if (filter === "open") return comment.status === "open";
      if (filter === "resolved") return comment.status === "resolved";
      return true;
    })
    .sort((a, b) => threadSort(a, b, asset?.file_type ?? "other"));

  const selectedComment = selectedCommentId
    ? rootComments.find((comment) => comment.id === selectedCommentId) ?? null
    : null;
  const orderedApprovals = [...approvals].sort((a, b) => a.step_order - b.step_order);
  const reviewState = deriveReviewState({
    approvals: orderedApprovals,
    comments,
    assetStatus: asset?.status,
    shareIntent,
    permissions,
    workflowMode,
  });
  const openThreads = reviewState.counts.openThreads;
  const resolvedThreads = reviewState.counts.resolvedThreads;
  const pendingApprovals = orderedApprovals.filter((approval) => approval.status === "pending");
  const completedApprovals = approvals.filter((approval) => approval.status !== "pending");
  const activeApprovalIdSet = new Set(activeApprovalIds);
  const activeApproval =
    orderedApprovals.find((approval) => activeApprovalIdSet.has(approval.id)) ?? pendingApprovals[0] ?? null;
  const expiresLabel = formatShortDate(invite?.expires_at);
  const shareMeta = formatShareIntentMeta(shareIntent);
  const pageDescription =
    shareIntent === "final_delivery"
      ? "This link is a final handoff. Review the delivery details, then download the approved asset."
      : shareIntent === "approval_needed"
        ? "Review the asset, leave any final notes, and record your decision when your approval step is active."
        : shareIntent === "internal_review"
          ? "Review the working cut, pause where direction is needed, and leave notes tied to the right frame or moment."
          : "Watch the cut first, pause where feedback is needed, then leave notes that stay tied to the moment or frame.";
  const stageTitle =
    shareIntent === "final_delivery" ? "Delivery view" : "Player first. Feedback second.";
  const stageDescription = pinMode
    ? "Pin mode is active. Click the frame to lock your note to a precise spot."
    : shareIntent === "final_delivery"
      ? "Use the player to review the approved asset, then move to the rail for delivery details and any prior review history."
      : canComment
        ? "Use the player to find the right moment, then add notes from the rail without losing context."
        : "Use the player and comment list together to move through the review.";
  const railTitle =
    shareIntent === "final_delivery"
      ? "Delivery rail"
      : shareIntent === "approval_needed"
        ? "Review and approval"
        : "Review rail";
  const railHeading =
    shareIntent === "final_delivery"
      ? "Delivery details and history"
      : shareIntent === "approval_needed"
        ? "Watch, comment, approve"
        : "Watch and respond";
  const railDescription =
    shareIntent === "final_delivery"
      ? "This panel explains the handoff and keeps the prior review record visible."
      : permissions === "approve"
        ? "Everything needed to review and sign off stays beside the player."
        : canComment
          ? "Everything needed to review and leave notes stays beside the player."
          : "Use this rail to follow the current review conversation.";
  const stepThreeText =
    shareIntent === "final_delivery"
      ? "Download the approved file when you are ready to hand it off or use it."
      : permissions === "approve"
        ? "Record your approval when the cut is ready."
        : "Use the thread list to track open feedback.";
  const commentsTitle = shareIntent === "final_delivery" ? "Review history" : "Comments";
  const commentsDescription =
    shareIntent === "final_delivery"
      ? "These notes show the review context that led to this handoff."
      : "Select a thread to jump the player to that exact moment.";
  const emptyCommentsDescription =
    shareIntent === "final_delivery"
      ? "No review notes were captured before this delivery was handed off."
      : canComment
        ? "Leave the first note from the player to start the review."
        : "There is no feedback to show for this filter yet.";

  function seekTo(seconds: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(seconds, duration || seconds));
  }

  function handleCommentSelect(comment: ReviewComment) {
    setSelectedCommentId(comment.id);
    if (asset?.file_type === "video" && comment.timecode_seconds != null) {
      seekTo(comment.timecode_seconds);
    }
  }

  function handleFramePin(x: number, y: number) {
    setCommentPin({ x, y });
    setPinMode(false);
  }

  function handleImagePin(event: React.MouseEvent<HTMLDivElement>) {
    if (!canComment || !pinMode) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    setCommentPin({ x, y });
    setPinMode(false);
  }

  function togglePinMode() {
    if (commentPin) {
      setCommentPin(null);
      setPinMode(true);
      return;
    }

    setPinMode((current) => !current);
  }

  function clearPin() {
    setCommentPin(null);
    setPinMode(false);
  }

  function handleCommentCreated(comment: ReviewComment) {
    setComments((current) => [...current, comment]);
    setSelectedCommentId(comment.id);
    setCommentPin(null);
    setPinMode(false);
  }

  async function handleApprovalDecision(
    approvalId: string,
    decision: ApprovalDecision,
    note?: string,
  ) {
    if (approvalSubmitting) return;
    if (!reviewerName.trim()) {
      setApprovalError("Enter your reviewer name before recording an approval.");
      return;
    }

    setApprovalSubmitting(true);
    setApprovalError("");

    try {
      const response = await fetch(`/api/review/${token}/approvals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: approvalId,
          status: decision,
          decision_note: note,
          reviewer_name: reviewerName.trim(),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Could not record approval.");
      }

      const updatedApproval = (payload?.approval ?? payload) as ApprovalStep | null;
      if (!updatedApproval?.id) {
        throw new Error("Approval saved, but the response was invalid.");
      }

      setApprovals((current) =>
        current.map((approval) =>
          approval.id === approvalId ? ({ ...approval, ...updatedApproval } as ApprovalStep) : approval,
        ),
      );
      if (payload?.asset_status) {
        setAsset((current) =>
          current ? { ...current, status: payload.asset_status as Asset["status"] } : current,
        );
      }
      setActiveApprovalIds(payload?.active_approval_ids ?? []);
      setApprovalAccessMessage(payload?.approval_access_message ?? "");
    } catch (submitError) {
      setApprovalError(
        submitError instanceof Error ? submitError.message : "Could not record approval.",
      );
    } finally {
      setApprovalSubmitting(false);
    }
  }

  function renderPins() {
    const pins = rootComments.filter((comment) => {
      if (comment.pin_x == null || comment.pin_y == null) return false;
      if (asset?.file_type === "image") return true;
      if (comment.id === selectedCommentId) return true;
      if (comment.timecode_seconds == null) return true;
      return Math.abs(currentTime - comment.timecode_seconds) <= 2;
    });

    return (
      <div className="relative h-full w-full">
        {asset?.file_type === "video" ? <FrameIndicator /> : null}

        {pinMode ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
            <div className="rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
              Click the frame to place your pin.
            </div>
          </div>
        ) : null}

        {pins.map((comment) => {
          const number = threadNumberById.get(comment.id) ?? 0;
          const selected = comment.id === selectedCommentId;
          const resolved = comment.status === "resolved";

          return (
            <button
              key={comment.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleCommentSelect(comment);
              }}
              className={`absolute -translate-x-1/2 -translate-y-full rounded-full border-2 px-2 py-1 text-[11px] font-bold shadow-lg transition-transform hover:scale-105 ${
                selected
                  ? "border-white bg-[var(--accent)] text-white"
                  : resolved
                    ? "border-white/70 bg-[var(--green)] text-white"
                    : "border-white/80 bg-[var(--orange)] text-white"
              }`}
              style={{ left: `${comment.pin_x}%`, top: `${comment.pin_y}%` }}
              aria-label={`Jump to comment ${number}`}
            >
              {number}
            </button>
          );
        })}

        {commentPin ? (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-full border-2 border-dashed border-white bg-[var(--accent)] px-2 py-1 text-[11px] font-bold text-white shadow-lg"
            style={{ left: `${commentPin.x}%`, top: `${commentPin.y}%` }}
          >
            New
          </div>
        ) : null}
      </div>
    );
  }

  const workspaceError = error || (!loading && !asset ? "Asset not found." : "");

  return (
    <ReviewWorkspace
      loading={loading}
      error={workspaceError}
      header={
        <>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="review-kicker rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-[var(--accent)]">
                Co-Deliver
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--muted)]">
                {shareMeta.label}
              </span>
              {demoMode ? (
                <span className="rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-3 py-1 text-xs text-[var(--accent)]">
                  Demo mode
                </span>
              ) : null}
            </div>

            <div className="mt-3 min-w-0">
              <p className="text-sm text-[var(--muted)]">{asset?.projects?.name ?? "Project"}</p>
              <h1 className="review-display mt-1 truncate text-2xl font-semibold text-[var(--ink)]">
                {asset?.title ?? "Review"}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">{pageDescription}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {asset ? (
              <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs capitalize text-[var(--ink)]">
                {formatAssetStatusLabel(asset.status)}
              </span>
            ) : null}
            <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--muted)]">
              {reviewState.label}
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--muted)]">
              {shareMeta.permissionsLabel}
            </span>
            {reviewerName || invite?.reviewer_name ? (
              <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--muted)]">
                Reviewing as <span className="font-medium text-[var(--ink)]">{reviewerName || invite?.reviewer_name}</span>
              </span>
            ) : null}
            <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--muted)]">
              {invite?.view_count ?? 0} views
            </span>
            {expiresLabel ? (
              <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--muted)]">
                Expires {expiresLabel}
              </span>
            ) : null}
            {invite?.download_enabled && asset?.file_url ? (
              <a
                href={asset.file_url}
                download
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Download size={13} />
                Download
              </a>
            ) : null}
          </div>
        </>
      }
      stage={{
        kicker: "Review stage",
        title: stageTitle,
        description: stageDescription,
        stats: [
          `${openThreads} open`,
          `${resolvedThreads} resolved`,
          `${timedThreads} timeline notes`,
          `${pinnedThreads} pinned`,
        ],
        context: selectedComment ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">
                Note {threadNumberById.get(selectedComment.id) ?? 0}
              </span>
              {selectedComment.timecode_seconds != null ? (
                <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 font-mono text-xs text-[var(--ink)]">
                  {formatTimeLong(selectedComment.timecode_seconds)}
                </span>
              ) : null}
              {selectedComment.pin_x != null && selectedComment.pin_y != null ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs text-[var(--ink)]">
                  <MapPin size={10} />
                  Frame pin
                </span>
              ) : null}
              {selectedComment.status === "resolved" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--green)]/10 px-2.5 py-0.5 text-xs text-[var(--green)]">
                  <CheckCircle2 size={10} />
                  Resolved
                </span>
              ) : null}
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--muted)]">
              {selectedComment.body}
            </p>
            <button
              type="button"
              onClick={() => setSelectedCommentId(null)}
              className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              Clear selection
              <X size={12} />
            </button>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
              Review state
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--ink)]">{reviewState.label}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{reviewState.summary}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--dim)]">Next: {reviewState.nextStep}</p>
          </>
        ),
        media: (
          <ReviewMediaSurface
            assetType={asset?.file_type ?? "other"}
            assetTitle={asset?.title ?? "Review"}
            assetUrl={asset?.file_url ?? null}
            videoRef={videoRef}
            pinMode={canComment && pinMode}
            overlay={renderPins()}
            onFramePin={handleFramePin}
            onImagePin={handleImagePin}
            timeline={{
              label: "Timeline feedback",
              countLabel: `${timedThreads} markers`,
              content: <PlayerTimeline comments={rootComments} onSeek={seekTo} />,
            }}
            fallbackAction={
              invite?.download_enabled && asset?.file_url ? (
                <a
                  href={asset.file_url}
                  download
                  className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
                >
                  <Download size={14} />
                  Download file
                </a>
              ) : null
            }
          />
        ),
      }}
      rail={{
        kicker: railTitle,
        title: railHeading,
        description: railDescription,
        stats: [
          `${openThreads} open`,
          `${resolvedThreads} resolved`,
          shareMeta.permissionsLabel,
        ],
        intro: (
          <div className="grid gap-2">
            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--muted)]">
              <span className="mr-2 font-semibold text-[var(--ink)]">1.</span>
              {shareIntent === "final_delivery"
                ? "Review the approved asset and confirm the handoff details."
                : "Watch the cut and pause where feedback is needed."}
            </div>
            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--muted)]">
              <span className="mr-2 font-semibold text-[var(--ink)]">2.</span>
              {shareIntent === "final_delivery"
                ? "Use the review history below if you need the context behind the final changes."
                : "Leave a comment tied to the current timestamp or frame."}
            </div>
            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--muted)]">
              <span className="mr-2 font-semibold text-[var(--ink)]">3.</span>
              {stepThreeText}
            </div>
          </div>
        ),
        approval: permissions === "approve"
          ? {
              header: (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="review-kicker">Approval</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {workflowMode === "sequential"
                        ? "Approvals move step by step."
                        : workflowMode === "parallel"
                          ? "Approvers can decide in parallel."
                          : "Single-step approval flow."}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--bg)] px-3 py-1 text-xs text-[var(--muted)]">
                    {completedApprovals.length}/{approvals.length || 1} decided
                  </span>
                </div>
              ),
              summary: (
                <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dim)]">
                    {activeApproval ? "Decision needed" : "Decision state"}
                  </p>
                  <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                    {activeApproval
                      ? `${activeApproval.role_label} is ready for review`
                      : orderedApprovals.length > 0
                        ? "No active decision is waiting on this link"
                        : "No approval step is assigned to this review link yet"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {!reviewerName.trim()
                      ? "Enter your reviewer name below before you record approval."
                      : activeApproval
                        ? "Leave any final notes, then use the actions below to approve or request changes."
                        : approvalAccessMessage || "Review decisions already captured remain visible here."}
                  </p>
                </div>
              ),
              error: approvalError,
              content: orderedApprovals.map((approval) => (
                <ApprovalStepCard
                  key={approval.id}
                  step={approval}
                  isActive={activeApprovalIdSet.has(approval.id)}
                  onDecide={
                    activeApprovalIdSet.has(approval.id)
                      ? (decision, note) => handleApprovalDecision(approval.id, decision, note)
                      : undefined
                  }
                />
              )),
              footer:
                orderedApprovals.length > 0 && approvalAccessMessage ? (
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm text-[var(--muted)]">
                    {approvalAccessMessage}
                  </div>
                ) : null,
            }
          : null,
        comments: {
          title: commentsTitle,
          description: commentsDescription,
          countLabel: `${rootComments.length} total`,
          filters: [
            { id: "open", label: `Open (${openThreads})`, active: filter === "open", onClick: () => setFilter("open") },
            { id: "all", label: `All (${rootComments.length})`, active: filter === "all", onClick: () => setFilter("all") },
            {
              id: "resolved",
              label: `Resolved (${resolvedThreads})`,
              active: filter === "resolved",
              onClick: () => setFilter("resolved"),
            },
          ],
          hasResults: filteredComments.length > 0,
          emptyTitle: "No threads in this view",
          emptyDescription: emptyCommentsDescription,
          content: (
            <div className="space-y-3">
              {filteredComments.map((comment) => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  replies={repliesByParent.get(comment.id) ?? []}
                  onSeek={comment.timecode_seconds != null ? () => handleCommentSelect(comment) : undefined}
                  index={threadNumberById.get(comment.id) ?? 0}
                  canReply={false}
                  canResolve={false}
                  selected={comment.id === selectedComment?.id}
                  onSelect={() => handleCommentSelect(comment)}
                />
              ))}
            </div>
          ),
        },
        composer: asset ? (
          <PublicReviewComposer
            token={token}
            assetType={asset.file_type}
            shareIntent={shareIntent}
            canComment={canComment}
            reviewerName={reviewerName}
            onReviewerNameChange={setReviewerName}
            timecode={currentTime}
            pin={commentPin}
            pinMode={pinMode}
            onTogglePinMode={togglePinMode}
            onClearPin={clearPin}
            onCommentCreated={handleCommentCreated}
          />
        ) : <div />,
      }}
    />
  );
}
