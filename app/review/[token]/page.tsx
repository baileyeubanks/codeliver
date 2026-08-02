"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import ApprovalStepCard from "@/components/approvals/ApprovalStep";
import CommentThread from "@/components/comments/CommentThread";
import FrameIndicator from "@/components/player/FrameIndicator";
import ReviewMediaSurface from "@/components/review/ReviewMediaSurface";
import ReviewWorkspace from "@/components/review/PublicReviewWorkspace";
import InlineReviewComment from "@/components/review/InlineReviewComment";
import {
  addDemoReviewCutMarker,
  getDemoExternalReviewComments,
  getDemoVersionCutMarkers,
  recordDemoPublicReviewApproval,
  recordDemoReviewCompletion,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
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
  projects: { name: string } | null;
}

interface ReviewInvite {
  id: string;
  approval_id: string | null;
  reviewer_name: string | null;
  expires_at: string | null;
  permissions: SharePermission;
  download_enabled: boolean;
  watermark_enabled: boolean;
  watermark_text: string | null;
  view_count: number;
  max_views: number | null;
}

interface ReviewCompletion {
  reviewer_name: string;
  note: string | null;
  completed_at: string;
}

interface ReviewPayload {
  asset: Asset;
  version: Version;
  edit_decisions: EditDecision[];
  approvals: ApprovalStep[];
  active_approval_ids?: string[];
  approval_access_message?: string | null;
  comments: ReviewComment[];
  completion?: ReviewCompletion | null;
  completion_available?: boolean;
  can_complete_review?: boolean;
  permissions: SharePermission;
  share_intent: ShareIntent;
  reviewer_name: string | null;
  expires_at: string | null;
  download_enabled: boolean;
  download_url: string | null;
  watermark_enabled: boolean;
  watermark_text: string | null;
  workflow_mode: WorkflowMode | null;
  invite: {
    id: string;
    approval_id: string | null;
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

interface ReviewCommentDraft {
  id: string;
  anchor: { x: number; y: number };
  persistedPin: { x: number; y: number } | null;
  timeSeconds: number | null;
  parentId: string | null;
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
  approvalId?: string | null,
) {
  const normalizedReviewerEmail = reviewerEmail?.trim().toLowerCase();
  if (!normalizedReviewerEmail || !approvalId) {
    return [];
  }

  const orderedApprovals = [...approvals].sort((a, b) => a.step_order - b.step_order);
  const pendingApprovals = orderedApprovals.filter((approval) => approval.status === "pending");
  const workflowActiveApprovals =
    workflowMode === "sequential" ? pendingApprovals.slice(0, 1) : pendingApprovals;

  const approval = workflowActiveApprovals.find(
    (candidate) =>
      candidate.id === approvalId &&
      candidate.assignee_email?.trim().toLowerCase() === normalizedReviewerEmail,
  );

  return approval ? [approval.id] : [];
}

export default function PublicReviewPage() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewClaimRequestRef = useRef<{ token: string; requestId: string } | null>(
    null,
  );
  const demoWorkspace = useDemoWorkspace();

  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const resetPlayer = usePlayerStore((state) => state.reset);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [version, setVersion] = useState<Version | null>(null);
  const [invite, setInvite] = useState<ReviewInvite | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalStep[]>([]);
  const [activeApprovalIds, setActiveApprovalIds] = useState<string[]>([]);
  const [approvalAccessMessage, setApprovalAccessMessage] = useState("");
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [reviewCompletion, setReviewCompletion] = useState<ReviewCompletion | null>(null);
  const [completionAvailable, setCompletionAvailable] = useState(false);
  const [canCompleteReview, setCanCompleteReview] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [completionSubmitting, setCompletionSubmitting] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [permissions, setPermissions] = useState<SharePermission>("view");
  const [shareIntent, setShareIntent] = useState<ShareIntent>("client_review");
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<ReviewCommentDraft | null>(null);
  const [draftNotice, setDraftNotice] = useState("");
  const [filter, setFilter] = useState<CommentFilter>("open");
  const [showPins, setShowPins] = useState(true);
  const [cutMarkers, setCutMarkers] = useState<CutMarker[]>([]);
  const [cutMarkerError, setCutMarkerError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [reviewPassword, setReviewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [reviewLoadKey, setReviewLoadKey] = useState(0);
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

  useEffect(() => {
    if (!demoMode || !asset?.id || !version?.id) return;
    const workspaceAsset = demoWorkspace.assets.find((candidate) => candidate.id === asset.id);
    if (!workspaceAsset) {
      setCutMarkers([]);
      return;
    }

    setCutMarkers(
      getDemoVersionCutMarkers(
        { reviewCutMarkers: demoWorkspace.reviewCutMarkers },
        {
          projectId: workspaceAsset.project_id,
          assetId: asset.id,
          versionId: version.id,
        },
      ).map((marker) => ({ id: marker.id, time: marker.time_seconds, status: "accepted" })),
    );
  }, [asset?.id, demoMode, demoWorkspace.assets, demoWorkspace.reviewCutMarkers, version?.id]);

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
              demoReviewPayload.reviewer_email,
            approvals: demoReviewPayload.approvals.map((approval) => ({
              ...approval,
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
          const persistedCompletion = demoWorkspace.reviewCompletions.find(
            (completion) =>
              completion.project_id === publicProjectId &&
              completion.asset_id === publicAssetId &&
              completion.version_id === publicVersionId &&
              completion.review_invite_id === review.invite.id,
          );
          // The public link and producer cockpit project the same workspace
          // threads. This link narrows that shared source to its exact invite.
          const persistedComments: ReviewComment[] = getDemoExternalReviewComments(
            { reviewComments: demoWorkspace.reviewComments },
            {
              projectId: publicProjectId,
              assetId: publicAssetId,
              versionId: publicVersionId,
              reviewInviteId: review.invite.id,
            },
          )
            .map((comment) => ({
              id: comment.id,
              review_id: null,
              review_invite_id: comment.review_invite_id ?? review.invite.id,
              asset_id: comment.asset_id,
              version_id: comment.version_id ?? publicVersionId,
              parent_id: comment.parent_id ?? null,
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
              visibility: comment.visibility ?? "external",
              resolved_by: null,
              resolved_at: null,
              created_at: comment.created_at,
              updated_at: comment.created_at,
            }));
          const restoredComments = persistedComments;
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
          setDownloadUrl(review.download_enabled ? review.asset.file_url : null);
          setVersion(demoVersion);
          setInvite({
            id: review.invite.id,
            approval_id: review.invite.approval_id,
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
                review.invite.approval_id,
              ),
          );
          setApprovalAccessMessage(persistedApprovalState?.approval_access_message ?? "");
          setComments(restoredComments);
          setReviewCompletion(
            persistedCompletion
              ? {
                  reviewer_name: persistedCompletion.reviewer_name,
                  note: persistedCompletion.note,
                  completed_at: persistedCompletion.completed_at,
                }
              : null,
          );
          setCompletionAvailable(true);
          setCanCompleteReview(
            review.permissions !== "view" && Boolean(review.reviewer_email),
          );
          setCompletionNote("");
          setCompletionError("");
          setPermissions(review.permissions);
          setShareIntent(requestedIntent);
          setWorkflowMode(review.workflow_mode);
          setReviewerName(
            persistedApprovalState?.reviewer_name ??
              persistedCompletion?.reviewer_name ??
              review.reviewer_name ??
              "",
          );
          setSelectedCommentId(initialSelection);
          setLoading(false);
          return;
        }

        if (viewClaimRequestRef.current?.token !== token) {
          viewClaimRequestRef.current = {
            token,
            requestId: globalThis.crypto.randomUUID(),
          };
        }
        const response = await fetch(`/api/review/${token}`, {
          credentials: "same-origin",
          headers: {
            "X-Review-View-Claim-Id": viewClaimRequestRef.current.requestId,
          },
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          if (response.status === 401 && payload?.password_required === true) {
            setError("");
            setPasswordRequired(true);
            return;
          }
          throw new Error(payload?.error || "Invalid or expired review link.");
        }

        if (cancelled) return;

        const review = payload as ReviewPayload;
        setPasswordRequired(false);
        setPasswordError("");
        const rootComments = (review.comments ?? []).filter((comment) => !comment.parent_id);
        const initialSelection =
          rootComments.find((comment) => comment.status === "open")?.id ??
          rootComments[0]?.id ??
          null;

        setAsset(review.asset);
        setDownloadUrl(review.download_url ?? null);
        setVersion(review.version ?? null);
        setInvite({
          id: review.invite.id,
          approval_id: review.invite.approval_id,
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
            defaultActiveApprovalIds(
              review.approvals ?? [],
              review.workflow_mode,
              null,
              review.invite.approval_id,
            ),
        );
        setApprovalAccessMessage(review.approval_access_message ?? "");
        setComments(review.comments ?? []);
        setReviewCompletion(review.completion ?? null);
        setCompletionAvailable(review.completion_available === true);
        setCanCompleteReview(review.can_complete_review === true);
        setCompletionNote("");
        setCompletionError("");
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
    demoWorkspace.reviewCompletions,
    demoWorkspace.shareLinks,
    requestedDemoAssetId,
    requestedDemoShare,
    requestedDemoShareToken,
    reviewLoadKey,
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
  const selectedFilteredThreadIndex = filteredComments.findIndex(
    (comment) => comment.id === selectedCommentId,
  );
  const previousThreadDisabled =
    Boolean(commentDraft) || selectedFilteredThreadIndex <= 0;
  const nextThreadDisabled =
    Boolean(commentDraft) ||
    filteredComments.length === 0 ||
    selectedFilteredThreadIndex >= filteredComments.length - 1;
  const replyToComment = commentDraft?.parentId
    ? comments.find((comment) => comment.id === commentDraft.parentId) ?? null
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
  const reviewStatusLabel = reviewCompletion ? "Review complete" : reviewState.label;
  const openThreads = reviewState.counts.openThreads;
  const resolvedThreads = reviewState.counts.resolvedThreads;
  const completedApprovals = approvals.filter((approval) => approval.status !== "pending");
  const activeApprovalIdSet = new Set(activeApprovalIds);
  const activeApproval =
    orderedApprovals.find((approval) => activeApprovalIdSet.has(approval.id)) ?? null;
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
  const stageDescription = commentDraft
    ? replyToComment
      ? `Reply draft to ${replyToComment.author_name}`
      : asset?.file_type === "video"
      ? `Comment draft at ${formatTimeLong(commentDraft.timeSeconds ?? currentTime)}`
      : "Comment draft on this frame"
    : cutMarkers.length > 0
      ? `${cutMarkers.length} cut ${cutMarkers.length === 1 ? "decision" : "decisions"} marked`
    : shareIntent === "final_delivery"
      ? "Approved version and delivery history"
      : `Version ${version?.version_number ?? 1} · Client review`;
  const commentsTitle = shareIntent === "final_delivery" ? "Review history" : "Comments";
  const commentsDescription =
    shareIntent === "final_delivery"
      ? "These notes show the review context that led to this handoff."
      : undefined;
  const emptyCommentsDescription =
    shareIntent === "final_delivery"
      ? "No review notes were captured before this delivery was handed off."
      : "No comments in this view.";

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

  function selectAdjacentThread(direction: -1 | 1) {
    if (commentDraft || filteredComments.length === 0) return;

    const nextIndex =
      direction === 1
        ? selectedFilteredThreadIndex < 0
          ? 0
          : selectedFilteredThreadIndex + 1
        : selectedFilteredThreadIndex - 1;
    const nextThread = filteredComments[nextIndex];
    if (nextThread) handleCommentSelect(nextThread);
  }

  function beginCommentDraft(draft: ReviewCommentDraft) {
    if (commentDraft) {
      setDraftNotice("Finish or cancel the open comment before starting another.");
      return false;
    }

    setDraftNotice("");
    setCommentDraft(draft);
    return true;
  }

  function handleFramePin(x: number, y: number, timeSeconds: number) {
    if (!canComment) return;
    if (!beginCommentDraft({
      id: `frame:${version?.id ?? "review"}:${timeSeconds}:${x.toFixed(2)}:${y.toFixed(2)}`,
      anchor: { x, y },
      persistedPin: { x, y },
      timeSeconds,
      parentId: null,
    })) {
      return;
    }
    videoRef.current?.pause();
  }

  function handleImagePin(event: React.MouseEvent<HTMLDivElement>) {
    if (!canComment) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    beginCommentDraft({
      id: `frame:${version?.id ?? "review"}:image:${x.toFixed(2)}:${y.toFixed(2)}`,
      anchor: { x, y },
      persistedPin: { x, y },
      timeSeconds: null,
      parentId: null,
    });
  }

  function startReply(parentId: string) {
    if (!canComment) return;
    const parent = comments.find((comment) => comment.id === parentId);
    if (!parent) return;
    const rootComment = parent.parent_id
      ? comments.find((comment) => comment.id === parent.parent_id) ?? parent
      : parent;
    const timeSeconds = rootComment.timecode_seconds ?? (asset?.file_type === "video" ? currentTime : null);

    if (!beginCommentDraft({
      id: `reply:${parent.id}`,
      anchor: {
        x: rootComment.pin_x ?? 50,
        y: rootComment.pin_y ?? 32,
      },
      persistedPin: null,
      timeSeconds,
      parentId: parent.id,
    })) {
      return;
    }

    setSelectedCommentId(rootComment.id);
    videoRef.current?.pause();
    if (asset?.file_type === "video" && timeSeconds != null) {
      seekTo(timeSeconds);
    }
  }

  function clearCommentDraft() {
    setCommentDraft(null);
    setDraftNotice("");
  }

  function handleCommentCreated(comment: ReviewComment) {
    setComments((current) =>
      current.some((candidate) => candidate.id === comment.id) ? current : [...current, comment],
    );
    setSelectedCommentId(comment.parent_id ?? comment.id);
    clearCommentDraft();

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

    if (!asset || !version) {
      setCutMarkerError("This review is not bound to a media version yet.");
      return;
    }

    if (demoMode) {
      const workspaceAsset = demoWorkspace.assets.find((candidate) => candidate.id === asset.id);
      if (!workspaceAsset) {
        setCutMarkerError("This review asset is not available in the workspace.");
        return;
      }
      addDemoReviewCutMarker({
        projectId: workspaceAsset.project_id,
        assetId: asset.id,
        versionId: version.id,
        timeSeconds: normalizedTime,
      });
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

  async function handleReviewCompletion() {
    if (completionSubmitting || reviewCompletion) return;
    if (!reviewerName.trim()) {
      setCompletionError("Enter your reviewer name before completing the review.");
      return;
    }
    if (!asset || !version || !invite) {
      setCompletionError("This review is not bound to a media version yet.");
      return;
    }

    setCompletionSubmitting(true);
    setCompletionError("");

    try {
      if (demoMode) {
        const workspaceAsset = demoWorkspace.assets.find(
          (candidate) => candidate.id === asset.id,
        );
        const completion = recordDemoReviewCompletion({
          projectId: workspaceAsset?.project_id ?? "demo",
          assetId: asset.id,
          versionId: version.id,
          reviewInviteId: invite.id,
          reviewerName: reviewerName.trim(),
          reviewerEmail:
            requestedDemoShare?.reviewer_email ?? demoReviewPayload.reviewer_email,
          permission: permissions,
          note: completionNote,
        });

        if (!completion.ok) {
          throw new Error(completion.error);
        }

        setReviewCompletion({
          reviewer_name: completion.completion.reviewer_name,
          note: completion.completion.note,
          completed_at: completion.completion.completed_at,
        });
        setCompletionNote("");
        return;
      }

      const response = await fetch(`/api/review/${token}/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          reviewer_name: reviewerName.trim(),
          note: completionNote,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.completion) {
        throw new Error(payload?.error || "Could not complete the review.");
      }

      setReviewCompletion(payload.completion as ReviewCompletion);
      setCompletionNote("");
    } catch (completionFailure) {
      setCompletionError(
        completionFailure instanceof Error
          ? completionFailure.message
          : "Could not complete the review.",
      );
    } finally {
      setCompletionSubmitting(false);
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
          approvalLinkApprovalId: invite.approval_id,
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

  async function handleReviewUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unlocking || reviewPassword.length < 8) return;

    setUnlocking(true);
    setPasswordError("");
    try {
      const response = await fetch(`/api/review/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password: reviewPassword }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Password could not be verified.");
      }

      setReviewPassword("");
      setPasswordRequired(false);
      setLoading(true);
      setReviewLoadKey((current) => current + 1);
    } catch (unlockError) {
      setPasswordError(
        unlockError instanceof Error
          ? unlockError.message
          : "Password could not be verified.",
      );
    } finally {
      setUnlocking(false);
    }
  }

  function renderPins() {
    const pins = showPins ? rootComments.filter((comment) => {
      if (comment.pin_x == null || comment.pin_y == null) return false;
      if (asset?.file_type === "image") return true;
      if (comment.id === selectedCommentId) return true;
      if (comment.timecode_seconds == null) return true;
      return Math.abs(currentTime - comment.timecode_seconds) <= 2;
    }) : [];

    return (
      <div className="relative h-full w-full">
        {asset?.file_type === "video" ? <FrameIndicator /> : null}

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

        {showPins && selectedComment && !commentDraft && selectedComment.pin_x != null && selectedComment.pin_y != null ? (
          <section
            className="review-selected-thread-popover"
            data-horizontal={selectedComment.pin_x > 56 ? "left" : "right"}
            data-vertical={selectedComment.pin_y > 56 ? "above" : "below"}
            style={{ left: `${selectedComment.pin_x}%`, top: `${selectedComment.pin_y}%` }}
            aria-label={`Selected comment from ${selectedComment.author_name}`}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <span className="review-selected-thread-avatar" aria-hidden="true">
                {(selectedComment.author_name || "?")
                  .split(" ")
                  .map((word) => word[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </span>
              <div>
                <strong>{selectedComment.author_name || "Reviewer"}</strong>
                {selectedComment.timecode_seconds != null ? (
                  <span>{formatTimeLong(selectedComment.timecode_seconds)}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelectedCommentId(null)}
                aria-label="Close selected comment"
                title="Close selected comment"
              >
                <X size={14} />
              </button>
            </header>
            <p>{selectedComment.body}</p>
            <footer>
              <span>
                {selectedComment.status === "resolved"
                  ? "Resolved"
                  : `${repliesByParent.get(selectedComment.id)?.length ?? 0} replies`}
              </span>
              {canComment ? (
                <button type="button" onClick={() => startReply(selectedComment.id)}>
                  Reply
                </button>
              ) : null}
            </footer>
          </section>
        ) : null}

        {commentDraft?.persistedPin ? (
          <div
            className="review-pending-pin pointer-events-none absolute"
            style={{
              left: `${commentDraft.persistedPin.x}%`,
              top: `${commentDraft.persistedPin.y}%`,
            }}
            aria-hidden="true"
          />
        ) : null}

        {commentDraft && asset && canComment ? (
          <InlineReviewComment
            key={commentDraft.id}
            token={token}
            demoMode={demoMode}
            projectId={
              demoWorkspace.assets.find((candidate) => candidate.id === asset.id)?.project_id
            }
            assetId={asset.id}
            assetType={asset.file_type}
            versionId={version?.id ?? null}
            reviewInviteId={invite?.id ?? null}
            reviewerName={reviewerName}
            onReviewerNameChange={setReviewerName}
            timecode={commentDraft.timeSeconds}
            anchor={commentDraft.anchor}
            persistedPin={commentDraft.persistedPin}
            parentId={replyToComment?.id ?? null}
            replyToName={replyToComment?.author_name ?? null}
            notice={draftNotice}
            onCancel={clearCommentDraft}
            onCommentCreated={handleCommentCreated}
          />
        ) : null}
      </div>
    );
  }

  const workspaceError = passwordRequired
    ? ""
    : error || (!loading && !asset ? "Asset not found." : "");

  return (
    <ReviewWorkspace
      loading={loading}
      error={workspaceError}
      accessGate={
        passwordRequired
          ? {
              password: reviewPassword,
              error: passwordError,
              submitting: unlocking,
              onPasswordChange: (value) => {
                setReviewPassword(value);
                if (passwordError) setPasswordError("");
              },
              onSubmit: handleReviewUnlock,
            }
          : null
      }
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
                {reviewStatusLabel}
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
            {invite?.download_enabled && downloadUrl ? (
              <a
                href={downloadUrl}
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
          `${rootComments.length} threads`,
        ],
        context: null,
        media: (
          <ReviewMediaSurface
            assetType={asset?.file_type ?? "other"}
            assetTitle={asset?.title ?? "Review"}
            assetUrl={asset?.file_url ?? null}
            poster={demoMode ? "/demo/ceraweek-speaker.jpg" : undefined}
            videoRef={videoRef}
            annotationEnabled={canComment && asset?.file_type === "video" && !commentDraft}
            overlay={renderPins()}
            onFramePin={handleFramePin}
            onCutMarker={canComment ? handleCutMarker : undefined}
            onImagePin={canComment && !commentDraft ? handleImagePin : undefined}
            timeline={{
              label: "Timeline feedback",
              countLabel: `${timedThreads} notes · ${cutMarkers.length} cuts`,
              actions:
                rootComments.length > 0 ? (
                  <div className="inline-flex items-center gap-1" aria-label="Review comment controls">
                    <button
                      type="button"
                      onClick={() => selectAdjacentThread(-1)}
                      disabled={previousThreadDisabled}
                      title="Previous visible comment"
                      aria-label="Previous visible comment"
                      className="grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => selectAdjacentThread(1)}
                      disabled={nextThreadDisabled}
                      title="Next visible comment"
                      aria-label="Next visible comment"
                      className="grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPins((current) => !current)}
                      title={showPins ? "Hide comment pins" : "Show comment pins"}
                      aria-label={showPins ? "Hide comment pins" : "Show comment pins"}
                      aria-pressed={showPins}
                      className="grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] sm:h-8 sm:w-8"
                    >
                      {showPins ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </div>
                ) : null,
              content: (
                <div className="grid gap-2">
                  <PlayerTimeline
                    comments={rootComments}
                    cutMarkers={cutMarkers}
                    onSeek={seekTo}
                    onCommentActivate={(timelineComment) => {
                      const comment = rootComments.find((candidate) => candidate.id === timelineComment.id);
                      if (comment) handleCommentSelect(comment);
                      else if (timelineComment.timecode_seconds != null) seekTo(timelineComment.timecode_seconds);
                    }}
                    selectedCommentId={selectedCommentId}
                  />
                  {cutMarkerError ? (
                    <p className="text-xs text-[var(--red)]" role="alert">
                      {cutMarkerError}
                    </p>
                  ) : null}
                </div>
              ),
            }}
            fallbackAction={
              invite?.download_enabled && downloadUrl ? (
                <a
                  href={downloadUrl}
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
        stats: [],
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
        completion:
          completionAvailable && (canCompleteReview || reviewCompletion)
            ? {
                content: reviewCompletion ? (
                  <div className="grid gap-3" aria-live="polite">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--green)]/10 text-[var(--green)]">
                        <CheckCircle2 size={16} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="review-kicker">Review status</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                          Review complete
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                          {reviewCompletion.reviewer_name} finished this version
                          {formatShortDate(reviewCompletion.completed_at)
                            ? ` on ${formatShortDate(reviewCompletion.completed_at)}`
                            : ""}
                          .
                        </p>
                      </div>
                    </div>
                    {reviewCompletion.note ? (
                      <p className="border-l-2 border-[var(--accent)]/35 pl-3 text-sm leading-6 text-[var(--ink-secondary)]">
                        {reviewCompletion.note}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div>
                      <p className="review-kicker">Review status</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                        Finish review
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        Mark this version reviewed. Approval remains a separate decision.
                      </p>
                    </div>
                    <label className="grid gap-1.5" htmlFor="review-completion-note">
                      <span className="text-xs font-semibold text-[var(--ink-secondary)]">
                        Closing note <span className="font-normal text-[var(--dim)]">(optional)</span>
                      </span>
                      <textarea
                        id="review-completion-note"
                        className="min-h-20 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
                        value={completionNote}
                        maxLength={2000}
                        disabled={completionSubmitting}
                        onChange={(event) => setCompletionNote(event.target.value)}
                        placeholder="Anything the producer should know?"
                      />
                    </label>
                    {completionError ? (
                      <p className="text-xs leading-5 text-[var(--red)]" role="alert">
                        {completionError}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleReviewCompletion()}
                      disabled={completionSubmitting}
                      className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-9"
                    >
                      {completionSubmitting ? "Finishing review..." : "Finish review"}
                    </button>
                  </div>
                ),
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
                  canReply={canComment}
                  canResolve={false}
                  selected={comment.id === selectedComment?.id}
                  onSelect={() => handleCommentSelect(comment)}
                  onReply={startReply}
                />
              ))}
            </div>
          ),
        },
      }}
    />
  );
}
