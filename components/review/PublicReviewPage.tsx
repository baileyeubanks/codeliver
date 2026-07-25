"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
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
import InlineReviewComment from "@/components/review/InlineReviewComment";
import AnnotationCanvas from "@/components/review/annotation/AnnotationCanvas";
import AnnotationThumbnail from "@/components/review/annotation/AnnotationThumbnail";
import AnnotationToolbar from "@/components/review/annotation/AnnotationToolbar";
import {
  isNearTimecode,
  type AnnotationTool,
} from "@/lib/review/annotation";
import {
  addDemoReviewCutMarker,
  recordDemoPublicReviewApproval,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import {
  bindDemoReviewApprovals,
  demoReviewPayload,
} from "@/lib/review/demoReview";
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
import { usePlayerStore } from "@/lib/stores/playerStore";
import { resolveReviewFrameRate } from "@/lib/review/frame-review";
import { formatSmpteTimecode } from "@/components/player/timecode";
import type {
  AnnotationData,
  ApprovalDecision,
  ApprovalStep,
  Comment as ReviewComment,
  EditDecision,
  SharePermission,
  Version,
  WorkflowMode,
} from "@/lib/types/codeliver";
import PlayerTimeline from "@/components/player/PlayerTimeline";
import { useDemoMediaObjectUrl } from "@/lib/demo/media-blob-store";

interface Asset {
  id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  status: string;
  /** Per-asset frame rate override; absent → player default (24fps). */
  frame_rate?: number | null;
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
  version: Version;
  edit_decisions: EditDecision[];
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

interface CutMarker {
  id: string;
  time: number;
  status?: EditDecision["status"];
  pending?: boolean;
}

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
  const imageRef = useRef<HTMLImageElement>(null);
  const demoWorkspace = useDemoWorkspace();

  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const frameRate = usePlayerStore((state) => state.frameRate);
  const setFrameRate = usePlayerStore((state) => state.setFrameRate);
  const resetPlayer = usePlayerStore((state) => state.reset);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [version, setVersion] = useState<Version | null>(null);
  const [invite, setInvite] = useState<ReviewInvite | null>(null);
  const [approvals, setApprovals] = useState<ApprovalStep[]>([]);
  const [activeApprovalIds, setActiveApprovalIds] = useState<string[]>([]);
  const [approvalAccessMessage, setApprovalAccessMessage] = useState("");
  const [storedComments, setComments] = useState<ReviewComment[]>([]);
  // P17: the demo workspace store has no annotation column, so drawings ride
  // on the in-memory comment after submit. The demo loader rebuilds comments
  // from persisted state whenever the store changes; this map re-applies each
  // drawing to its comment for the rest of the session (local preview).
  const [drawingsByCommentId, setDrawingsByCommentId] = useState<
    Record<string, Pick<ReviewComment, "annotations" | "attachments">>
  >({});
  const comments = storedComments.map((comment) =>
    drawingsByCommentId[comment.id] ? { ...comment, ...drawingsByCommentId[comment.id] } : comment,
  );
  const [permissions, setPermissions] = useState<SharePermission>("view");
  const [shareIntent, setShareIntent] = useState<ShareIntent>("client_review");
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CommentFilter>("open");
  const [pinMode, setPinMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawTool, setDrawTool] = useState<AnnotationTool>("arrow");
  const [draftStrokes, setDraftStrokes] = useState<AnnotationData[]>([]);
  const [commentPin, setCommentPin] = useState<{
    x: number;
    y: number;
    timeSeconds: number | null;
  } | null>(null);
  const [cutMarkers, setCutMarkers] = useState<CutMarker[]>([]);
  const [cutMarkerError, setCutMarkerError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const demoMode = token === "demo" || searchParams.get("demo") === "1";
  const requestedDemoShareToken = demoMode ? searchParams.get("share") : null;
  const requestedDemoShare = requestedDemoShareToken
    ? demoWorkspace.shareLinks.find((link) => link.token === requestedDemoShareToken)
    : null;
  const requestedDemoAssetId = demoMode
    ? searchParams.get("asset") ?? requestedDemoShare?.asset_ids[0] ?? null
    : null;
  const demoMediaUrl = useDemoMediaObjectUrl(requestedDemoAssetId);

  useEffect(() => {
    resetPlayer();
    return () => resetPlayer();
  }, [resetPlayer]);

  // P16: frame-accurate stepping/timecode follows the asset's real frame
  // rate when the payload carries one; otherwise the 24fps default stands.
  useEffect(() => {
    setFrameRate(resolveReviewFrameRate(asset?.frame_rate));
  }, [asset?.frame_rate, setFrameRate]);

  // P17: Escape cancels draw mode and drops unsent strokes. While the inline
  // comment dialog is open it owns Escape (cancel returns to the drawing).
  useEffect(() => {
    if (!drawMode) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || commentPin) return;
      event.preventDefault();
      setDrawMode(false);
      setDraftStrokes([]);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [drawMode, commentPin]);

  useEffect(() => {
    if (!demoMode || !asset?.id) return;
    setCutMarkers(
      demoWorkspace.reviewCutMarkers
        .filter((marker) => marker.asset_id === asset.id)
        .map((marker) => ({ id: marker.id, time: marker.time_seconds, status: "accepted" })),
    );
  }, [asset?.id, demoMode, demoWorkspace.reviewCutMarkers]);

  useEffect(() => {
    let cancelled = false;

    async function loadReview() {
      try {
        if (demoMode) {
          if (requestedDemoShareToken && !requestedDemoShare) {
            throw new Error("This review link is invalid or no longer available.");
          }
          if (requestedDemoShare && !requestedDemoShare.is_active) {
            throw new Error("This review link has been revoked.");
          }

          const workspaceAsset = demoWorkspace.assets.find(
            (candidate) => candidate.id === requestedDemoAssetId,
          );
          const workspaceProject = demoWorkspace.projects.find(
            (candidate) => candidate.id === workspaceAsset?.project_id,
          );
          const publicAssetId = workspaceAsset?.id ?? demoReviewPayload.asset.id;
          const publicProjectId = workspaceAsset?.project_id ?? "demo";
          const publicVersionId = `demo-version-${workspaceAsset?.version_count ?? 4}`;
          const requestedIntent =
            requestedDemoShare?.share_intent ??
            normalizeShareIntent(searchParams.get("intent")) ??
            deriveShareIntent({
              permissions: demoReviewPayload.permissions,
              downloadEnabled: demoReviewPayload.download_enabled,
              watermarkEnabled: demoReviewPayload.watermark_enabled,
            });
          const intentDefaults = resolveShareIntentDefaults(requestedIntent);
          const review = {
            ...demoReviewPayload,
            asset: {
              ...demoReviewPayload.asset,
              id: publicAssetId,
              title: workspaceAsset?.title ?? demoReviewPayload.asset.title,
              file_url: demoMediaUrl ?? demoReviewPayload.asset.file_url,
              status: workspaceAsset?.status ?? demoReviewPayload.asset.status,
              projects: {
                name: workspaceProject
                  ? `${workspaceProject.name} / Client Review`
                  : demoReviewPayload.asset.projects?.name ?? "Client Review",
              },
            },
            permissions: requestedDemoShare?.permission ?? intentDefaults.permissions,
            expires_at: requestedDemoShare?.expires_at ?? demoReviewPayload.expires_at,
            download_enabled:
              requestedDemoShare?.allow_downloads ?? intentDefaults.downloadEnabled,
            watermark_enabled:
              requestedDemoShare?.watermark_enabled ?? intentDefaults.watermarkEnabled,
            watermark_text:
              requestedDemoShare?.reviewer_name ??
              requestedDemoShare?.reviewer_email ??
              demoReviewPayload.watermark_text,
            reviewer_name:
              requestedDemoShare?.reviewer_name ??
              (requestedIntent === "approval_needed"
                ? demoReviewPayload.reviewer_name
                : "Client Reviewer"),
            reviewer_email:
              requestedDemoShare?.reviewer_email ??
              (requestedIntent === "approval_needed" ? demoReviewPayload.reviewer_email : null),
            approvals: bindDemoReviewApprovals({
              approvals: demoReviewPayload.approvals,
              assetId: publicAssetId,
              reviewerEmail:
                requestedDemoShare?.reviewer_email ??
                (requestedIntent === "approval_needed"
                  ? demoReviewPayload.reviewer_email
                  : null),
              permission: requestedDemoShare?.permission ?? intentDefaults.permissions,
            }),
            comments: demoReviewPayload.comments.map((comment) => ({
              ...comment,
              asset_id: publicAssetId,
              version_id: publicVersionId,
            })),
            invite: {
              ...demoReviewPayload.invite,
              id: requestedDemoShare?.id ?? demoReviewPayload.invite.id,
              view_count: 0,
              max_views: requestedDemoShare?.max_views ?? demoReviewPayload.invite.max_views,
            },
          };
          const persistedApprovalState = demoWorkspace.publicReviewStates.find(
            (state) =>
              state.project_id === publicProjectId &&
              state.asset_id === publicAssetId &&
              state.version_id === publicVersionId &&
              state.review_invite_id === review.invite.id,
          );
          const persistedComments: ReviewComment[] = demoWorkspace.reviewComments
            .filter(
              (comment) =>
                comment.project_id === publicProjectId &&
                comment.asset_id === publicAssetId &&
                comment.version_id === publicVersionId,
            )
            .map((comment) => ({
              id: comment.id,
              review_id: null,
              review_invite_id: comment.review_invite_id ?? review.invite.id,
              asset_id: comment.asset_id,
              version_id: comment.version_id ?? publicVersionId,
              parent_id: null,
              author_name: comment.author_name,
              author_email: comment.author_email ?? null,
              author_id: null,
              body: comment.body,
              rich_body: null,
              timecode_seconds:
                review.asset.file_type === "video" ? comment.time_seconds : null,
              frame_number: null,
              pin_x: comment.pin_x ?? null,
              pin_y: comment.pin_y ?? null,
              mentions: [],
              status: comment.status,
              visibility: "external",
              resolved_by: null,
              resolved_at: null,
              created_at: comment.created_at,
              updated_at: comment.created_at,
            }));
          const restoredComments = [...review.comments, ...persistedComments];
          const restoredApprovals = persistedApprovalState?.approvals ?? review.approvals;
          const restoredAsset = {
            ...review.asset,
            status: persistedApprovalState?.asset_status ?? review.asset.status,
          };
          const demoVersion: Version = {
            id: publicVersionId,
            asset_id: publicAssetId,
            version_number: workspaceAsset?.version_count ?? 4,
            file_url: review.asset.file_url ?? "",
            file_size: null,
            thumbnail_url: "/demo/ceraweek-speaker.jpg",
            duration_seconds: workspaceAsset?.duration_seconds ?? null,
            resolution: "1920 x 1080",
            is_current: true,
            notes: "Local demo review version",
            uploaded_by: null,
            created_at: workspaceAsset?.created_at ?? new Date().toISOString(),
          };
          const rootComments = restoredComments.filter((comment) => !comment.parent_id);
          const initialSelection =
            rootComments.find((comment) => comment.status === "open")?.id ??
            rootComments[0]?.id ??
            null;

          setAsset(restoredAsset);
          setVersion(demoVersion);
          setInvite({
            id: review.invite.id,
            reviewer_name: persistedApprovalState?.reviewer_name ?? review.reviewer_name,
            expires_at: review.expires_at,
            permissions: review.permissions,
            download_enabled: review.download_enabled,
            watermark_enabled: review.watermark_enabled,
            watermark_text: review.watermark_text,
            view_count: review.invite.view_count,
            max_views: review.invite.max_views,
          });
          setApprovals(restoredApprovals);
          setActiveApprovalIds(
            persistedApprovalState?.active_approval_ids ??
              defaultActiveApprovalIds(
                restoredApprovals,
                review.workflow_mode,
                review.reviewer_email,
              ),
          );
          setApprovalAccessMessage(persistedApprovalState?.approval_access_message ?? "");
          setComments(restoredComments);
          setPermissions(review.permissions);
          setShareIntent(requestedIntent);
          setWorkflowMode(review.workflow_mode);
          setReviewerName(persistedApprovalState?.reviewer_name ?? review.reviewer_name ?? "");
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
        setVersion(review.version ?? null);
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
        setCutMarkers(
          (review.edit_decisions ?? [])
            .filter(
              (decision) =>
                decision.decision_type === "cut" && decision.status !== "rejected",
            )
            .map((decision) => ({
              id: decision.id,
              time: decision.start_seconds,
              status: decision.status,
            })),
        );
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
  }, [
    demoMediaUrl,
    demoMode,
    demoWorkspace.assets,
    demoWorkspace.projects,
    demoWorkspace.publicReviewStates,
    demoWorkspace.reviewComments,
    demoWorkspace.shareLinks,
    requestedDemoAssetId,
    requestedDemoShare,
    requestedDemoShareToken,
    searchParams,
    token,
  ]);

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
      ? "Approved delivery and review history."
      : shareIntent === "approval_needed"
        ? "Client approval is active for this version."
        : shareIntent === "internal_review"
          ? "Internal review is active for this version."
          : "Client review is active for this version.";
  const stageTitle = shareIntent === "final_delivery" ? "Delivery player" : "Review player";
  const stageDescription = drawMode
    ? "Draw mode active — Esc to cancel"
    : pinMode
    ? "Pin mode active"
    : cutMarkers.length > 0
      ? `${cutMarkers.length} cut ${cutMarkers.length === 1 ? "decision" : "decisions"} marked`
    : shareIntent === "final_delivery"
      ? "Approved version and delivery history"
      : `Version ${version?.version_number ?? 1} · Client review`;
  const railTitle =
    shareIntent === "final_delivery" ? "Delivery" : "Review";
  const railHeading =
    shareIntent === "final_delivery"
      ? "Final delivery"
      : shareIntent === "approval_needed"
        ? "Comments and approval"
        : "Comments";
  const railDescription =
    shareIntent === "final_delivery"
      ? `${rootComments.length} notes in the review history.`
      : permissions === "approve"
        ? `${openThreads} open notes before sign-off.`
        : canComment
          ? `${openThreads} open notes on this version.`
          : `${rootComments.length} notes on this version.`;
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

  function handleFramePin(x: number, y: number, timeSeconds: number) {
    if (!canComment) return;
    setCommentPin({ x, y, timeSeconds });
    setPinMode(false);
  }

  function toggleDrawMode() {
    if (drawMode) {
      setDrawMode(false);
      setDraftStrokes([]);
      return;
    }

    // Entering draw mode freezes the frame so strokes land on a still image.
    videoRef.current?.pause();
    setPinMode(false);
    setCommentPin(null);
    setDrawMode(true);
  }

  function handleStrokeComplete(annotation: AnnotationData) {
    setDraftStrokes((current) => [...current, annotation]);
  }

  function strokeAnchorPoint(strokes: AnnotationData[]): { x: number; y: number } {
    const first = strokes[0];
    if (!first) return { x: 50, y: 50 };
    if (first.kind === "arrow" || first.kind === "freehand") {
      return { x: first.points[0] * 100, y: first.points[1] * 100 };
    }
    if (first.kind === "rectangle") {
      return { x: (first.x + first.width / 2) * 100, y: (first.y + first.height / 2) * 100 };
    }
    return { x: 50, y: 50 };
  }

  function handleDrawAddComment() {
    if (!canComment || draftStrokes.length === 0) return;
    const anchor = strokeAnchorPoint(draftStrokes);
    setCommentPin({
      x: anchor.x,
      y: anchor.y,
      timeSeconds: asset?.file_type === "video" ? currentTime : null,
    });
  }

  function handleImagePin(event: React.MouseEvent<HTMLDivElement>) {
    if (!canComment || !pinMode) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    setCommentPin({ x, y, timeSeconds: null });
    setPinMode(false);
  }

  function togglePinMode() {
    // Pin mode and draw mode are mutually exclusive ways to start a note.
    setDrawMode(false);
    setDraftStrokes([]);

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
    if (comment.annotations?.length || comment.attachments?.length) {
      setDrawingsByCommentId((current) => ({
        ...current,
        [comment.id]: { annotations: comment.annotations, attachments: comment.attachments },
      }));
    }
    setComments((current) =>
      current.some((candidate) => candidate.id === comment.id) ? current : [...current, comment],
    );
    setSelectedCommentId(comment.id);
    setCommentPin(null);
    setPinMode(false);
    setDrawMode(false);
    setDraftStrokes([]);

    if (asset?.file_type === "video" && videoRef.current) {
      const video = videoRef.current;
      (video.closest("[data-player-root]") as HTMLElement | null)?.focus({ preventScroll: true });
      void video.play().catch(() => {
        video.muted = true;
        usePlayerStore.getState().setMuted(true);
        void video.play().catch(() => undefined);
      });
    }
  }

  async function handleCutMarker(time: number) {
    const normalizedTime = Math.max(0, Number(time.toFixed(3)));
    if (cutMarkers.some((marker) => Math.abs(marker.time - normalizedTime) < 0.25)) return;
    setCutMarkerError("");

    if (demoMode && asset) {
      const workspaceAsset = demoWorkspace.assets.find((candidate) => candidate.id === asset.id);
      addDemoReviewCutMarker({
        projectId: workspaceAsset?.project_id ?? "demo",
        assetId: asset.id,
        timeSeconds: normalizedTime,
      });
      return;
    }

    if (!asset || !version) {
      setCutMarkerError("This review is not bound to a media version yet.");
      return;
    }

    const clientRequestId = crypto.randomUUID();
    const optimisticId = `pending-${clientRequestId}`;
    setCutMarkers((current) => [
      ...current,
      { id: optimisticId, time: normalizedTime, status: "proposed", pending: true },
    ]);

    try {
      const response = await fetch(`/api/review/${token}/edit-decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision_type: "cut",
          source: "keyboard",
          start_seconds: normalizedTime,
          end_seconds: null,
          label: "Cut",
          confidence: null,
          client_request_id: clientRequestId,
          metadata: { input: "ArrowDown", version_number: version.version_number },
          reviewer_name: reviewerName,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Could not save the cut decision.");
      }

      const decision = payload as EditDecision;
      setCutMarkers((current) =>
        current.map((marker) =>
          marker.id === optimisticId
            ? {
                id: decision.id,
                time: decision.start_seconds,
                status: decision.status,
              }
            : marker,
        ),
      );
    } catch (saveError) {
      setCutMarkers((current) => current.filter((marker) => marker.id !== optimisticId));
      setCutMarkerError(
        saveError instanceof Error ? saveError.message : "Could not save the cut decision.",
      );
    }
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
      if (demoMode) {
        if (!asset || !version || !invite) {
          throw new Error("This demo review is not bound to a media version yet.");
        }

        const workspaceAsset = demoWorkspace.assets.find(
          (candidate) => candidate.id === asset.id,
        );
        const demoDecision = recordDemoPublicReviewApproval({
          projectId: workspaceAsset?.project_id ?? "demo",
          assetId: asset.id,
          versionId: version.id,
          reviewInviteId: invite.id,
          reviewerName: reviewerName.trim(),
          reviewerEmail:
            requestedDemoShare?.reviewer_email ??
            (permissions === "approve" ? demoReviewPayload.reviewer_email : null),
          permission: permissions,
          workflowMode,
          approvals,
          initialAssetStatus: asset.status,
          approvalId,
          decision,
          note,
        });

        if (!demoDecision.ok) {
          throw new Error(demoDecision.error);
        }

        setApprovals(demoDecision.approvals);
        setAsset((current) =>
          current ? { ...current, status: demoDecision.assetStatus } : current,
        );
        setActiveApprovalIds(demoDecision.activeApprovalIds);
        setApprovalAccessMessage(demoDecision.approvalAccessMessage);
        return;
      }

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

  // Saved drawings replay as vector overlays: for video while the playhead is
  // within ±0.5s of the note's timecode, for images on the selected note.
  const replayAnnotations = comments.flatMap((comment) => {
    const data = (comment.annotations ?? []).map((annotation) => annotation.data);
    if (data.length === 0) return [];
    if (asset?.file_type === "video") {
      return isNearTimecode(comment.timecode_seconds, currentTime) ? data : [];
    }
    return comment.id === selectedCommentId ? data : [];
  });

  const drawingRasterSize =
    asset?.file_type === "video"
      ? {
          width: videoRef.current?.videoWidth || 1280,
          height: videoRef.current?.videoHeight || 720,
        }
      : {
          width: imageRef.current?.naturalWidth || 1280,
          height: imageRef.current?.naturalHeight || 720,
        };

  const drawableSurface = canComment && (asset?.file_type === "video" || asset?.file_type === "image");

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
              className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-full rounded-full border-2 px-2 py-1 text-[11px] font-bold shadow-lg transition-transform hover:scale-105 ${
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
            className="review-pending-pin pointer-events-none absolute"
            style={{ left: `${commentPin.x}%`, top: `${commentPin.y}%` }}
            aria-hidden="true"
          />
        ) : null}

        {asset && commentPin && canComment && (asset.file_type === "video" || drawMode) ? (
          <InlineReviewComment
            token={token}
            demoMode={demoMode}
            assetId={asset.id}
            assetType={asset.file_type}
            reviewerName={reviewerName}
            onReviewerNameChange={setReviewerName}
            timecode={commentPin.timeSeconds ?? currentTime}
            pin={commentPin}
            annotations={draftStrokes.length > 0 ? draftStrokes : undefined}
            rasterSize={drawingRasterSize}
            onCancel={clearPin}
            onCommentCreated={handleCommentCreated}
          />
        ) : null}

        {drawableSurface ? (
          <>
            <AnnotationCanvas
              active={drawMode && !commentPin}
              tool={drawTool}
              strokes={draftStrokes}
              replay={replayAnnotations}
              onStroke={handleStrokeComplete}
            />
            <AnnotationToolbar
              drawMode={drawMode}
              tool={drawTool}
              strokeCount={draftStrokes.length}
              onToggleDrawMode={toggleDrawMode}
              onToolChange={setDrawTool}
              onClear={() => setDraftStrokes([])}
              onAddComment={handleDrawAddComment}
            />
          </>
        ) : null}
      </div>
    );
  }

  const workspaceError = error || (!loading && !asset ? "Asset not found." : "");

  return (
    <ReviewWorkspace
      loading={loading}
      error={workspaceError}
      brand={demoMode ? demoWorkspace.settings.brand : undefined}
      header={
        <>
          <div className="client-review-title-block">
            <div className="client-review-breadcrumbs">
              {demoMode ? (
                <span className="client-review-back-link" aria-label="External review">
                  <ArrowLeft size={13} />
                  Shared review
                </span>
              ) : null}
              {demoMode ? <span aria-hidden="true">/</span> : null}
              <span className="client-review-project-name">
                {asset?.projects?.name ?? "Project"}
              </span>
              <span className="client-review-intent-badge">
                {shareMeta.label}
              </span>
            </div>

            <div className="client-review-title-row">
              <h1 className="review-display">
                {asset?.title ?? "Review"}
              </h1>
              {asset ? (
                <span className="client-review-status-badge">
                  {formatAssetStatusLabel(asset.status)}
                </span>
              ) : null}
            </div>
            <p className="client-review-page-description">{pageDescription}</p>
          </div>

          <div className="client-review-header-summary">
            <div className="client-review-access-row">
              <span className="client-review-state-badge">
              {reviewState.label}
              </span>
              <span>{shareMeta.permissionsLabel}</span>
            </div>
            {reviewerName || invite?.reviewer_name ? (
              <p className="client-review-reviewer">
                Reviewing as <strong>{reviewerName || invite?.reviewer_name}</strong>
              </p>
            ) : null}
            <div className="client-review-link-meta">
              <span>{invite?.view_count ?? 0} views</span>
              {expiresLabel ? <span>Expires {expiresLabel}</span> : null}
            </div>
            {invite?.download_enabled && asset?.file_url ? (
              <a
                href={asset.file_url}
                download
                className="client-review-download"
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
          `${cutMarkers.length} cut ${cutMarkers.length === 1 ? "decision" : "decisions"}`,
        ],
        context: selectedComment ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">
                Note {threadNumberById.get(selectedComment.id) ?? 0}
              </span>
              {selectedComment.timecode_seconds != null ? (
                <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 font-mono text-xs text-[var(--ink)]">
                  {formatSmpteTimecode(selectedComment.timecode_seconds, frameRate)}
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
              {selectedComment.annotations?.length ? (
                <AnnotationThumbnail annotations={selectedComment.annotations.map((a) => a.data)} />
              ) : null}
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--muted)]">
              {selectedComment.body}
            </p>
            <button
              type="button"
              onClick={() => setSelectedCommentId(null)}
              className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-xs text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] sm:min-h-8"
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
            poster={demoMode ? "/demo/ceraweek-speaker.jpg" : undefined}
            videoRef={videoRef}
            imageRef={imageRef}
            pinMode={canComment && pinMode}
            annotationEnabled={canComment && asset?.file_type === "video"}
            overlay={renderPins()}
            onFramePin={handleFramePin}
            onCutMarker={canComment ? handleCutMarker : undefined}
            onImagePin={handleImagePin}
            timeline={{
              label: "Timeline feedback",
              countLabel: `${timedThreads} notes · ${cutMarkers.length} cuts`,
              content: (
                <div className="grid gap-2">
                  <PlayerTimeline
                    comments={rootComments}
                    cutMarkers={cutMarkers}
                    onSeek={seekTo}
                    onCommentSelect={(comment) => handleCommentSelect(comment as ReviewComment)}
                    selectedCommentId={selectedCommentId}
                  />
                  <p
                    className={`min-h-5 text-xs ${
                      cutMarkerError ? "text-[var(--red)]" : "text-[var(--dim)]"
                    }`}
                    role={cutMarkerError ? "alert" : "status"}
                    aria-live="polite"
                  >
                    {cutMarkerError ||
                      (canComment
                        ? "Press Down to propose a version-bound cut at the playhead."
                        : "Cut decisions are read-only for this link.")}
                  </p>
                </div>
              ),
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
        intro: null,
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
            demoMode={demoMode}
            assetId={asset.id}
            assetType={asset.file_type}
            shareIntent={shareIntent}
            canComment={canComment}
            reviewerName={reviewerName}
            onReviewerNameChange={setReviewerName}
            timecode={commentPin?.timeSeconds ?? currentTime}
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
