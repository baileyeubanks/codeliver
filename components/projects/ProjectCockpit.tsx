"use client";

import Image from "next/image";
import Link from "next/link";
import { sourceCatalog } from "@/lib/demo/source-catalog";
import ProjectSourceArchive from "./ProjectSourceArchive";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Compass,
  Clock3,
  History,
  Info,
  Link2,
  LoaderCircle,
  Maximize2,
  Menu,
  MapPin,
  MessageSquareText,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  ServerCog,
  Share2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import DemoShareModal from "@/components/demo/DemoShareModal";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import ShareModal from "@/components/sharing/ShareModal";
import CommandPalette, { type CommandPaletteItem } from "@/components/navigation/CommandPalette";
import { useOverlay } from "@/components/overlay/useOverlay";
import { roleCan, type WorkspaceRole } from "@/components/navigation/navigation-model";
import { useMediaQuery, useOnlineStatus } from "@/components/navigation/useEnvironmentStatus";
import CockpitDock from "@/components/cockpit/CockpitDock";
import CoProduceLifecycleDrawer, {
  type CoProduceLifecycleData,
  type CoProduceLifecycleDestination,
} from "@/components/cockpit/CoProduceLifecycleDrawer";
import CockpitReviewTimeline from "@/components/cockpit/CockpitReviewTimeline";
import {
  CockpitMobileNavigation,
  CockpitProjectNavigation,
  CockpitProjectNavigationDrawer,
} from "@/components/cockpit/CockpitNavigation";
import CockpitToolbar from "@/components/cockpit/CockpitToolbar";
import VersionCompareDock from "@/components/cockpit/VersionCompareDock";
import {
  cockpitSectionFromSearchParams,
  COCKPIT_NAVIGATION,
  projectCockpitSurfaceHref,
  type CockpitSection,
} from "@/components/cockpit/cockpit-navigation";
import { useCockpitLayout } from "@/components/cockpit/useCockpitLayout";
import type { MediaAsset } from "@/components/projects/MediaCard";
import {
  addDemoReviewComment,
  addDemoReviewCutMarker,
  advanceProjectStage,
  approveDemoStage,
  createDemoShareLinks,
  setDemoShareLinkActive,
  signOutDemoSession,
  toggleDemoReviewCommentResolved,
  toggleDemoTask,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import type {
  DemoActivityItem,
  DemoApprovalStage,
  DemoProjectTask,
  DemoReviewComment,
  DemoReviewCutMarker,
  DemoShareLink,
} from "@/lib/demo/workspace-store";
import type { DemoProject } from "@/lib/demo/workspace";
import { PROJECT_STAGE_META, PROJECT_STAGES, type ProjectStage } from "@/lib/covideopro/record.ts";
import {
  CreativeSection,
  DecisionLedgerSection,
  DeliverySection,
  NotificationOutboxSection,
  PlanSection,
  ProposalSection,
  ReviewConsolidationSection,
  SequencesSection,
} from "@/components/projects/ProjectRecordSections";
import { useDemoMediaObjectUrl } from "@/lib/demo/media-blob-store";
import {
  currentDemoMediaVersion,
  isRevisionableDemoMedia,
  resolvePinnedDemoMediaVersion,
  sortDemoMediaVersions,
} from "@/lib/demo/media-version-authority";
import {
  canOperateExactInternalReviewVersion,
  resolveExactLiveInternalReviewVersion,
  reviewCommentDraftKey,
  shouldApplyLiveInternalReviewResponse,
  visibleExactInternalReviewRecords,
} from "@/lib/review/internal-version-operations";
import { formatSmpteTimecode } from "@/components/player/timecode";
import VideoPlayer from "@/components/player/VideoPlayer";
import { normalizeReviewSeekStep, normalizeReviewShortcutKey, shouldIgnoreReviewShortcut } from "@/lib/review/player-policy";
import { buildSurfaceUrl, getReviewSiteUrl } from "@/lib/surface-origins";
import type { EditDecision, Version } from "@/lib/types/codeliver";
import styles from "./ProjectCockpit.module.css";

interface ProjectCockpitProps {
  project: DemoProject;
  assets: MediaAsset[];
  demoMode: boolean;
  projects?: DemoProject[];
  viewer?: {
    name: string;
    email: string;
  };
  workspaceRole?: WorkspaceRole;
  uploading: boolean;
  uploadStatus: CockpitUploadStatus | null;
  onUpload: () => void;
  /** Opens the local file picker with this exact asset as the replacement target. */
  onUploadRevision?: (assetId: string) => void;
  onUploadDismiss?: () => void;
}

type CockpitApprovalStage = Omit<DemoApprovalStage, "status"> & { status: string };
type LiveReviewVersion = Version;

export interface CockpitUploadStatus {
  assetId?: string;
  versionId?: string;
  versionNumber?: number;
  kind?: "new_asset" | "revision";
  fileName: string;
  progress: number;
  phase: "validating" | "transferring" | "proxy" | "indexing" | "complete" | "error";
  completed: number;
  total: number;
  mode: "demo" | "production";
  message?: string;
}

type CockpitReadinessTone = "checking" | "healthy" | "attention" | "neutral";

interface CockpitReadinessState {
  label: "Checking readiness" | "Ready" | "Ready with warnings" | "Needs attention" | "Not checked";
  detail: string;
  tone: CockpitReadinessTone;
}

const DEFAULT_COCKPIT_ROLE: WorkspaceRole = "owner";
const REVIEW_SEEK_STEP_STORAGE_KEY = "co-videopro-review-seek-step";
const LEGACY_REVIEW_SEEK_STEP_STORAGE_KEY = "co-deliver-review-seek-step";
const DEFAULT_COCKPIT_READINESS: CockpitReadinessState = {
  label: "Checking readiness",
  detail: "System probe running",
  tone: "checking",
};

const formatClock = formatSmpteTimecode;

function formatShortClock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function formatActivity(action: string) {
  switch (action) {
    case "added_comment": return "added a comment";
    case "uploaded_new_version": return "uploaded a new version";
    case "uploaded_asset": return "uploaded media";
    case "approved_asset": return "approved a version";
    case "created_review_link": return "created a review link";
    case "archived_asset": return "archived media";
    case "moved_asset_to_trash": return "moved media to Trash";
    default: return action.replaceAll("_", " ");
  }
}

function formatAssetStatus(status: string) {
  switch (status) {
    case "in_review": return "In review";
    case "needs_changes": return "Changes requested";
    case "approved": return "Approved";
    case "final": return "Final";
    default: return "Working on it";
  }
}

function assetFileName(asset: MediaAsset) {
  const extension = asset.file_type === "image"
    ? "jpg"
    : asset.file_type === "audio"
      ? "wav"
      : asset.file_type === "document"
        ? "pdf"
        : "mp4";
  return `${asset.title}.${extension}`;
}

function versionLabel(asset: MediaAsset, demoMode: boolean) {
  if (sourceCatalog?.assets.some((source) => source.id === asset.id)) return "Imported file";
  const version = asset.version_count ?? (demoMode ? 1 : null);
  return version ? `Version ${version}` : "Version not indexed";
}


function mediaResolutionLabel(asset: MediaAsset, demoMode: boolean) {
  if (asset.file_type !== "video") return "Source file";
  const source = sourceCatalog?.assets.find((record) => record.id === asset.id);
  if (source) return `${source.width} × ${source.height}`;
  return demoMode ? "Not probed in demo" : "Not reported";
}

function mediaFrameRateLabel(asset: MediaAsset, demoMode: boolean) {
  if (asset.file_type !== "video") return "Not applicable";
  const source = sourceCatalog?.assets.find((record) => record.id === asset.id);
  if (source?.frame_rate) return `${source.frame_rate.toFixed(3)} fps`;
  return demoMode ? "Not probed in demo" : "Not reported";
}

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function avatarInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="cockpit-empty">
      <Info size={22} />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function isLocalUploadAsset(asset: MediaAsset | undefined): boolean {
  return Boolean(asset?.id.startsWith("local-upload-"));
}

function ProjectAssetThumbnail({
  asset,
  demoMode,
  alt = "",
  width = 56,
  height = 32,
  fill = false,
  showFallback = true,
}: {
  asset: MediaAsset;
  demoMode: boolean;
  alt?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  showFallback?: boolean;
}) {
  const storedThumbnailUrl = useDemoMediaObjectUrl(asset.demo_thumbnail_id ?? null);
  const replacementOfImportedSource = Boolean(
    sourceCatalog?.assets.some((source) => source.id === asset.id) &&
      (asset.version_count ?? 1) > 1,
  );
  // A browser-created thumbnail belongs to the exact current local cut. Do
  // not briefly substitute an imported source poster while that blob loads.
  const source = asset.demo_thumbnail_id
    ? storedThumbnailUrl
    : replacementOfImportedSource
      ? null
    : asset.thumbnail_url
    ?? storedThumbnailUrl
    ?? (demoMode && !sourceCatalog && !isLocalUploadAsset(asset) ? "/demo/ceraweek-speaker.jpg" : null);

  if (!source) {
    return showFallback ? <span aria-hidden="true"><Play size={16} /></span> : null;
  }

  if (fill) {
    return <Image src={source} alt={alt} fill sizes="320px" unoptimized />;
  }

  return <Image src={source} alt={alt} width={width} height={height} unoptimized />;
}

function recordString(record: Record<string, unknown>, key: string, fallback = "") {
  return typeof record[key] === "string" ? (record[key] as string) : fallback;
}

function recordNumber(record: Record<string, unknown>, key: string, fallback = 0) {
  return typeof record[key] === "number" && Number.isFinite(record[key])
    ? (record[key] as number)
    : fallback;
}

function readinessFromHealth(ok: boolean, payload: Record<string, unknown>): CockpitReadinessState {
  const failedDependencies = Array.isArray(payload.failedDependencies)
    ? payload.failedDependencies.filter((dependency): dependency is string => typeof dependency === "string")
    : [];
  const ready = payload.ready === true || payload.status === "ready" || payload.status === "ok";

  if (ok && ready && failedDependencies.length === 0) {
    return { label: "Ready", detail: "Health contract passed", tone: "healthy" };
  }
  if (ok) {
    return { label: "Ready with warnings", detail: "Review health details", tone: "attention" };
  }
  if (failedDependencies.length > 0) {
    return {
      label: "Needs attention",
      detail: `${failedDependencies.slice(0, 2).join(", ")} offline`,
      tone: "attention",
    };
  }
  return { label: "Needs attention", detail: "Readiness check failed", tone: "attention" };
}

function normalizeLiveComment(
  record: Record<string, unknown>,
  projectId: string,
  assetId: string,
): DemoReviewComment {
  const status = record.status === "resolved" ? "resolved" : "open";
  const pinX = typeof record.pin_x === "number" ? record.pin_x : undefined;
  const pinY = typeof record.pin_y === "number" ? record.pin_y : undefined;
  return {
    id: recordString(record, "id", crypto.randomUUID()),
    project_id: projectId,
    asset_id: assetId,
    version_id: typeof record.version_id === "string" ? record.version_id : null,
    author_name: recordString(record, "author_name", "Content Co-op"),
    author_email: typeof record.author_email === "string" ? record.author_email : null,
    body: recordString(record, "body"),
    time_seconds: recordNumber(record, "timecode_seconds"),
    pin_x: pinX,
    pin_y: pinY,
    status,
    created_at: recordString(record, "created_at", new Date().toISOString()),
  };
}

function normalizeLiveReviewVersion(record: Record<string, unknown>): LiveReviewVersion | null {
  if (
    typeof record.id !== "string" || !record.id.trim()
    || typeof record.asset_id !== "string" || !record.asset_id.trim()
    || typeof record.version_number !== "number" || !Number.isFinite(record.version_number)
    || typeof record.file_url !== "string" || !record.file_url.trim()
  ) return null;

  return {
    id: record.id,
    asset_id: record.asset_id,
    version_number: record.version_number,
    file_url: record.file_url,
    file_size: typeof record.file_size === "number" ? record.file_size : null,
    thumbnail_url: typeof record.thumbnail_url === "string" ? record.thumbnail_url : null,
    duration_seconds: typeof record.duration_seconds === "number" ? record.duration_seconds : null,
    resolution: typeof record.resolution === "string" ? record.resolution : null,
    is_current: record.is_current === true,
    notes: typeof record.notes === "string" ? record.notes : null,
    uploaded_by: typeof record.uploaded_by === "string" ? record.uploaded_by : null,
    created_at: typeof record.created_at === "string" ? record.created_at : new Date(0).toISOString(),
  };
}

function normalizeLiveActivity(record: Record<string, unknown>): DemoActivityItem {
  const details = record.details && typeof record.details === "object" && !Array.isArray(record.details)
    ? Object.fromEntries(
        Object.entries(record.details as Record<string, unknown>).flatMap(([key, value]) =>
          typeof value === "string" ? [[key, value]] : [],
        ),
      )
    : {};
  return {
    id: recordString(record, "id", crypto.randomUUID()),
    action: recordString(record, "action", "updated_project"),
    actor_name: recordString(record, "actor_name", "Content Co-op"),
    details,
    created_at: recordString(record, "created_at", new Date().toISOString()),
    project_id: recordString(record, "project_id"),
    asset_id: typeof record.asset_id === "string" ? record.asset_id : null,
  };
}

function normalizeLiveShareLink(
  record: Record<string, unknown>,
  assetId: string,
  reviewOrigin: string,
): DemoShareLink | null {
  const id = recordString(record, "id");
  const token = recordString(record, "token");
  if (!id || !token) return null;
  const permission = record.permissions === "approve"
    ? "approve"
    : record.permissions === "comment"
      ? "comment"
      : "view";
  const shareIntent = recordString(record, "share_intent", "client_review");
  return {
    id,
    token,
    type: "review",
    created_at: recordString(record, "created_at", new Date().toISOString()),
    created_by_name: "Content Co-op",
    message: shareIntent.replaceAll("_", " "),
    asset_ids: [assetId],
    media_count: 1,
    invited_count: record.reviewer_email ? 1 : 0,
    reviewer_name: typeof record.reviewer_name === "string" ? record.reviewer_name : null,
    reviewer_email: typeof record.reviewer_email === "string" ? record.reviewer_email : null,
    permission,
    require_name: Boolean(record.reviewer_name),
    allow_comments: permission !== "view",
    allow_downloads: Boolean(record.download_enabled),
    watermark_enabled: Boolean(record.watermark_enabled),
    expires_at: typeof record.expires_at === "string" ? record.expires_at : null,
    max_views: typeof record.max_views === "number" ? record.max_views : null,
    notification_status: "links_only",
    version_id: typeof record.version_id === "string" && record.version_id.trim()
      ? record.version_id
      : null,
    version_binding_status: typeof record.version_id === "string" && record.version_id.trim()
      ? "bound"
      : "reissue_required",
    is_active: record.authority_status === "active",
    public_url: buildSurfaceUrl(reviewOrigin, `/review/${encodeURIComponent(token)}`),
  };
}

export default function ProjectCockpit({
  project,
  assets,
  demoMode,
  projects = [project],
  viewer,
  workspaceRole = DEFAULT_COCKPIT_ROLE,
  uploading,
  uploadStatus,
  onUpload,
  onUploadRevision,
  onUploadDismiss,
}: ProjectCockpitProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useDemoWorkspace();
  const online = useOnlineStatus();
  const compactViewport = useMediaQuery("(max-width: 900px)");
  const narrowViewport = useMediaQuery("(max-width: 1180px)");
  const {
    layout,
    savedAt,
    setMode,
    toggleRail,
    toggleDock,
    setDockTab,
    saveWorkspace,
  } = useCockpitLayout(project.id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoFrameRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const requestedAssetId = searchParams.get("asset");
  const requestedVersionId = searchParams.get("version");
  const reviewViewRequested = searchParams.get("view") === "review";
  const [reviewViewActive, setReviewViewActive] = useState(reviewViewRequested);
  const [activeSection, setActiveSection] = useState<CockpitSection>(() => cockpitSectionFromSearchParams(searchParams));
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [activeAssetId, setActiveAssetId] = useState(
    assets.find((asset) => asset.id === requestedAssetId)?.id
      ?? assets.find((asset) => asset.status === "in_review")?.id
      ?? assets[0]?.id
      ?? "",
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulatedPlayback, setSimulatedPlayback] = useState(false);
  const [nativeVideoActive, setNativeVideoActive] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [hasEnded, setHasEnded] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [pendingPin, setPendingPin] = useState<{
    x: number;
    y: number;
    timeSeconds: number;
  } | null>(null);
  const [resumeAfterComment, setResumeAfterComment] = useState(false);
  const [seekStepSeconds, setSeekStepSeconds] = useState(() => {
    if (typeof window === "undefined") return 2;
    const saved = Number(
      window.localStorage.getItem(REVIEW_SEEK_STEP_STORAGE_KEY)
        ?? window.localStorage.getItem(LEGACY_REVIEW_SEEK_STEP_STORAGE_KEY),
    );
    return Number.isFinite(saved) && saved > 0 ? normalizeReviewSeekStep(saved) : 2;
  });
  const [commentStatus, setCommentStatus] = useState<"open" | "resolved">("open");
  const [expandedCommentIds, setExpandedCommentIds] = useState<ReadonlySet<string>>(new Set());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileDockOpen, setMobileDockOpen] = useState(false);
  const [reviewDetailsOpen, setReviewDetailsOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const commandButtonRef = useRef<HTMLButtonElement>(null);
  const [notificationsOverlayRef, notificationsOverlayStyle] = useOverlay({
    open: notificationsOpen,
    onClose: () => setNotificationsOpen(false),
    anchorRef: notificationButtonRef,
    align: "end",
    offset: 10,
  });
  const [accountOverlayRef, accountOverlayStyle] = useOverlay({
    open: accountOpen,
    onClose: () => setAccountOpen(false),
    anchorRef: accountButtonRef,
    align: "end",
    offset: 10,
  });
  const liveAssetRequestRef = useRef(0);
  const liveVersionRequestRef = useRef(0);
  const [toast, setToast] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [nativeDuration, setNativeDuration] = useState(0);
  const [liveComments, setLiveComments] = useState<DemoReviewComment[]>([]);
  const [liveCutMarkers, setLiveCutMarkers] = useState<DemoReviewCutMarker[]>([]);
  const [liveAssetDataKey, setLiveAssetDataKey] = useState<string | null>(null);
  const [liveVersions, setLiveVersions] = useState<LiveReviewVersion[]>([]);
  const [liveVersionAssetId, setLiveVersionAssetId] = useState<string | null>(null);
  const [liveVersionsLoading, setLiveVersionsLoading] = useState(false);
  const [liveVersionsError, setLiveVersionsError] = useState(false);
  const [liveTasks] = useState<DemoProjectTask[]>([]);
  const [liveActivity, setLiveActivity] = useState<DemoActivityItem[]>([]);
  const [systemsReadiness, setSystemsReadiness] = useState<CockpitReadinessState>(DEFAULT_COCKPIT_READINESS);

  useEffect(() => {
    setActiveSection(cockpitSectionFromSearchParams(searchParams));
    setReviewViewActive(searchParams.get("view") === "review");
  }, [searchParams]);

  useEffect(() => {
    setReviewDetailsOpen(false);
    setTimelineOpen(false);
    setMobileDockOpen(false);
  }, [activeAssetId, project.id, reviewViewActive]);

  // The stage follows the URL's asset param: deep links and the upload
  // flow's "Review new version" both navigate, and the stage must hot-swap
  // to the asset they name rather than keep playing the previous one.
  // A browser-local upload may arrive after the initial server snapshot.
  // Mark the URL applied only after that asset exists in the hydrated list.
  const appliedUrlAssetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedAssetId || appliedUrlAssetRef.current === requestedAssetId) return;
    if (!assets.some((asset) => asset.id === requestedAssetId)) return;
    appliedUrlAssetRef.current = requestedAssetId;
    setActiveAssetId(requestedAssetId);
    setCurrentTime(0);
    setNativeDuration(0);
    setHasEnded(false);
  }, [requestedAssetId, assets]);

  useEffect(() => {
    const controller = new AbortController();
    setSystemsReadiness(DEFAULT_COCKPIT_READINESS);
    fetch("/api/health/ready", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!controller.signal.aborted) {
          setSystemsReadiness(readinessFromHealth(response.ok, payload));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSystemsReadiness({
            label: "Not checked",
            detail: "Readiness probe unavailable",
            tone: "neutral",
          });
        }
      });
    return () => controller.abort();
  }, []);

  const [liveShareLinks, setLiveShareLinks] = useState<DemoShareLink[]>([]);
  const activeAsset = assets.find((asset) => asset.id === activeAssetId)
    ?? (requestedAssetId === null ? assets[0] : undefined);
  const localUploadActive = isLocalUploadAsset(activeAsset);
  const sourceBackedActive = Boolean(
    activeAsset && sourceCatalog?.assets.some((source) => source.id === activeAsset.id),
  );
  const versionedDemoActive = localUploadActive || sourceBackedActive;
  const requestedDemoVersion = demoMode && activeAsset && requestedVersionId
    ? resolvePinnedDemoMediaVersion(workspace.mediaVersions, activeAsset.id, requestedVersionId)
    : null;
  const activeDemoVersion = demoMode && activeAsset
    ? requestedVersionId
      ? requestedDemoVersion
      : currentDemoMediaVersion(workspace.mediaVersions, activeAsset.id)
    : null;
  const activeDemoVersionId = activeDemoVersion?.id ?? null;
  const liveVersionResolution = !demoMode && activeAsset
    ? resolveExactLiveInternalReviewVersion({
      requestedAssetId,
      activeAssetId: activeAsset.id,
      requestedVersionId,
      versions: liveVersionAssetId === activeAsset.id ? liveVersions : [],
    })
    : null;
  const activeLiveVersion = liveVersionResolution?.status === "resolved"
    ? liveVersionResolution.version
    : null;
  const activeLiveReviewKey = activeAsset && activeLiveVersion
    ? `${activeAsset.id}:${activeLiveVersion.id}`
    : null;
  const activeLiveMediaUrl = activeLiveVersion
    ? activeLiveVersion.file_url.startsWith("/api/assets/")
      ? activeLiveVersion.file_url
      : `/api/media/versions/${encodeURIComponent(activeLiveVersion.id)}`
    : null;
  const activeCommentDraftKey = activeAsset
    ? reviewCommentDraftKey(activeAsset.id, demoMode ? activeDemoVersionId : activeLiveVersion?.id ?? null)
    : null;
  const commentBody = activeCommentDraftKey ? commentDrafts[activeCommentDraftKey] ?? "" : "";
  function setCommentBody(value: string) {
    if (!activeCommentDraftKey) return;
    setCommentDrafts((current) => ({ ...current, [activeCommentDraftKey]: value }));
  }
  const reviewOperationsAllowed = canOperateExactInternalReviewVersion({
    demoMode,
    requestedVersionId,
    activeDemoVersionId,
    requestedAssetId,
    activeAssetId: activeAsset?.id ?? null,
    liveResolvedVersionId: demoMode ? undefined : activeLiveVersion?.id ?? null,
    liveResolvedAssetId: demoMode ? undefined : activeLiveVersion?.asset_id ?? null,
  });
  const requestedReviewVersionUnavailable = !reviewOperationsAllowed;
  const historicalDemoVersion = Boolean(
    demoMode && activeDemoVersion && !activeDemoVersion.is_current,
  );
  const historicalLiveVersion = Boolean(!demoMode && activeLiveVersion && !activeLiveVersion.is_current);
  const versionScopedReview = historicalDemoVersion || historicalLiveVersion || requestedReviewVersionUnavailable;
  const historicalReviewLabel = historicalDemoVersion
    ? `Historical V${activeDemoVersion?.version_number}`
    : historicalLiveVersion
      ? `Historical V${activeLiveVersion?.version_number}`
      : null;
  const activeReviewVersionLabel = demoMode
    ? activeDemoVersion?.source_label ?? (activeDemoVersion ? `V${activeDemoVersion.version_number}` : null)
    : activeLiveVersion ? `V${activeLiveVersion.version_number}${activeLiveVersion.is_current ? " · Current" : ""}` : null;
  // The header's project Share remains intentionally project-scoped. Every
  // asset-context action below must stop here unless it can prove this cut.
  const contextualShareAllowed = Boolean(activeAsset && !versionScopedReview);
  const activeDemoVersions = demoMode && activeAsset
    ? sortDemoMediaVersions(workspace.mediaVersions.filter((version) => version.asset_id === activeAsset.id))
    : [];
  const revisionableActiveAsset = Boolean(
    demoMode &&
      activeAsset &&
      isRevisionableDemoMedia(
        workspace.mediaVersions,
        activeAsset.id,
        Boolean(sourceCatalog?.assets.some((source) => source.id === activeAsset.id)),
      ),
  );
  const demoMediaUrl = useDemoMediaObjectUrl(
    activeDemoVersion?.media_blob_id ?? (versionedDemoActive ? null : activeAsset?.id ?? null),
  );
  const demoPosterUrl = useDemoMediaObjectUrl(
    activeDemoVersion?.thumbnail_blob_id ?? activeAsset?.demo_thumbnail_id ?? null,
  );
  const activeMediaUrl = requestedReviewVersionUnavailable
    ? null
    : demoMode
    ? demoMediaUrl ?? activeDemoVersion?.source_url ?? (
      versionedDemoActive
        ? null
        : activeAsset?.file_url ?? (sourceCatalog ? null : "/demo/ica-ceo-preview.mp4")
    )
    : activeLiveMediaUrl;
  const activePosterUrl = requestedReviewVersionUnavailable
    ? null
    : demoMode
    ? activeDemoVersion?.thumbnail_blob_id
      ? demoPosterUrl
      : activeDemoVersion?.source_label === "Imported file"
        ? activeAsset?.thumbnail_url ?? null
        : activeDemoVersion
          ? null
          : activeAsset?.thumbnail_url ?? (sourceCatalog ? null : "/demo/ceraweek-speaker.jpg")
    : activeLiveVersion?.thumbnail_url ?? activeAsset?.thumbnail_url ?? null;
  const hlsMediaActive = activeMediaUrl?.split(/[?#]/, 1)[0].toLowerCase().endsWith(".m3u8") ?? false;
  useEffect(() => {
    if (!hlsMediaActive) return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
    video.volume = volume;
    const handleLoadedMetadata = () => {
      if (Number.isFinite(video.duration)) setNativeDuration(video.duration);
      video.classList.add("active");
      setNativeVideoActive(true);
    };
    const handlePlay = () => {
      setIsPlaying(true);
      setHasEnded(false);
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setHasEnded(true);
    };
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
    };
  }, [activeMediaUrl, hlsMediaActive, isMuted, volume]);
  const duration = Math.max(1, nativeDuration || (demoMode ? activeAsset?.duration_seconds : activeLiveVersion?.duration_seconds) || (demoMode ? 5 : 1));
  const previewDuration = demoMode && !sourceCatalog && !localUploadActive
    ? activeAsset?.id === "denie-mcdonald-v4"
      ? 5
      : Math.min(duration, 5)
    : duration;
  const compactRail = reviewViewActive
    ? compactViewport || narrowViewport
    : layout.rail === "compact" || narrowViewport;
  const effectiveMode = reviewViewActive ? "review" : layout.mode;
  const effectiveDockTab = reviewViewActive ? "review" : layout.dockTab;
  const dockVisible = compactViewport
    ? mobileDockOpen
    : reviewViewActive
      ? reviewDetailsOpen
      : layout.dockOpen;
  const canUpload = roleCan(workspaceRole, "media:write");
  const canShare = roleCan(workspaceRole, "reviews:comment");

  const comments = demoMode
    ? visibleExactInternalReviewRecords(
      reviewOperationsAllowed,
      activeAsset && activeDemoVersionId
        ? workspace.reviewComments.filter(
      (comment) =>
        comment.asset_id === activeAsset?.id &&
        comment.version_id === activeDemoVersionId,
        )
        : [],
    )
    : activeLiveReviewKey && liveAssetDataKey === activeLiveReviewKey ? liveComments : [];
  const cutMarkers = demoMode
    ? visibleExactInternalReviewRecords(
      reviewOperationsAllowed,
      activeAsset && activeDemoVersionId
        ? workspace.reviewCutMarkers.filter(
      (marker) =>
        marker.asset_id === activeAsset?.id &&
        marker.version_id === activeDemoVersionId,
        )
        : [],
    )
    : activeLiveReviewKey && liveAssetDataKey === activeLiveReviewKey ? liveCutMarkers : [];
  const visibleComments = comments.filter((comment) => comment.status === commentStatus);
  const projectTasks = demoMode
    ? workspace.tasks.filter((task) => task.project_id === project.id)
    : liveTasks;
  const approvalStages: CockpitApprovalStage[] = versionScopedReview
    ? []
    : demoMode
      ? workspace.approvalStages.filter((stage) => stage.asset_id === activeAsset?.id)
      : [...(activeAsset?.approval_records ?? [])]
      .sort((left, right) => (left.step_order ?? 0) - (right.step_order ?? 0))
      .map((approval) => ({
        id: approval.id,
        project_id: project.id,
        asset_id: activeAsset?.id ?? "",
        name: approval.role_label || "Approval",
        reviewer_names: approval.assignee_email ? [approval.assignee_email] : [],
        approved_reviewer_names: approval.status === "approved"
          ? approval.assignee_email ? [approval.assignee_email] : []
          : [],
        status: approval.status,
      }));
  const viewerName = viewer?.name || (demoMode
    ? `${workspace.settings.profile.firstName} ${workspace.settings.profile.lastName}`.trim()
    : "Content Co-op");
  const viewerEmail = viewer?.email || (demoMode ? workspace.session.email : "");
  const collaborators = Array.from(new Set([
    viewerName,
    ...approvalStages.flatMap((stage) => stage.reviewer_names),
  ].filter(Boolean)));
  const projectActivity = demoMode
    ? workspace.activity.filter((item) => item.project_id === project.id)
    : liveActivity;
  const projectLinks = versionScopedReview
    ? []
    : demoMode
      ? workspace.shareLinks.filter((link) =>
        link.asset_ids.some((assetId) => assets.some((asset) => asset.id === assetId)),
        )
      : activeLiveReviewKey && liveAssetDataKey === activeLiveReviewKey
        ? liveShareLinks.filter((link) => link.version_id === activeLiveVersion?.id)
        : [];
  const demoVersionHistory = demoMode
    ? assets.map((asset) => ({
        asset,
        versions: sortDemoMediaVersions(
          workspace.mediaVersions.filter((version) => version.asset_id === asset.id),
        ),
      }))
    : [];
  const inReviewCount = assets.filter((asset) =>
    ["in_review", "needs_changes"].includes(asset.status),
  ).length;
  const approvedCount = assets.filter((asset) =>
    ["approved", "final"].includes(asset.status),
  ).length;
  const dueTodayCount = projectTasks.filter((task) => !task.completed && task.due_label === "Today").length;
  const openCommentCount = comments.filter((comment) => comment.status === "open").length;
  const resolvedCommentCount = comments.filter((comment) => comment.status === "resolved").length;
  const approvedStageCount = approvalStages.filter((stage) => stage.status === "approved").length;
  const reviewerSlotCount = approvalStages.reduce((sum, stage) => sum + stage.reviewer_names.length, 0);
  const approvedReviewerCount = approvalStages.reduce((sum, stage) => sum + stage.approved_reviewer_names.length, 0);
  const activeShareLinkCount = projectLinks.filter((link) => link.is_active).length;
  const systemsHref = demoMode ? "/settings?section=systems&demo=1" : "/settings?section=systems";
  const reviewReadinessItems = activeAsset ? [
    {
      id: "status",
      label: "Status",
      value: requestedReviewVersionUnavailable ? "Version unavailable" : historicalReviewLabel ?? formatAssetStatus(activeAsset.status),
      detail: versionScopedReview ? "Version-specific review" : versionLabel(activeAsset, demoMode),
      icon: Circle,
      tone: !versionScopedReview && (activeAsset.status === "approved" || activeAsset.status === "final") ? "approved" : "active",
    },
    {
      id: "comments",
      label: "Comments",
      value: `${openCommentCount} open`,
      detail: `${resolvedCommentCount} resolved`,
      icon: MessageSquareText,
      tone: openCommentCount > 0 ? "active" : "neutral",
    },
    {
      id: "approvals",
      label: "Approvals",
      value: versionScopedReview ? "Not recorded for this cut" : approvalStages.length > 0 ? `${approvedStageCount}/${approvalStages.length} stages` : "No workflow",
      detail: versionScopedReview ? "Asset-level decisions are not applied to a historical cut." : reviewerSlotCount > 0 ? `${approvedReviewerCount}/${reviewerSlotCount} reviewers` : "Approval link pending",
      icon: CheckCircle2,
      tone: approvalStages.length > 0 && approvedStageCount === approvalStages.length ? "approved" : "neutral",
    },
    {
      id: "transcript",
      label: "Transcript",
      value: demoMode ? "Not processed" : liveAssetDataKey === activeLiveReviewKey ? "Queued" : "Loading",
      detail: "Cleanup suggestions unavailable",
      icon: Info,
      tone: "neutral",
    },
    {
      id: "share",
      label: "Share",
      value: activeShareLinkCount > 0 ? `${activeShareLinkCount} active` : "Not created",
      detail: assets.length > 1 ? `${assets.length} asset batch` : "Single asset",
      icon: Share2,
      tone: activeShareLinkCount > 0 ? "active" : "neutral",
    },
  ] : [];
  const lifecyclePhases = useMemo<CoProduceLifecycleData>(() => {
    const surfaceHref = (surface: CockpitSection) => {
      const params = new URLSearchParams();
      if (demoMode) params.set("demo", "1");
      if (activeAsset?.id) params.set("asset", activeAsset.id);
      params.set("surface", surface);
      return `/projects/${project.id}?${params.toString()}`;
    };
    const readyAssetCount = assets.filter((asset) =>
      ["ready", "in_review", "needs_changes", "approved", "final"].includes(asset.status),
    ).length;
    const reviewAssetCount = assets.filter((asset) =>
      ["in_review", "needs_changes", "approved", "final"].includes(asset.status),
    ).length;
    const recordRatio = (count: number) => assets.length === 0
      ? 0
      : Math.round((count / assets.length) * 100);
    const productionProgress = uploading && uploadStatus
      ? Math.round(uploadStatus.progress)
      : recordRatio(readyAssetCount);
    const postProductionProgress = recordRatio(reviewAssetCount);
    const deliveryProgress = recordRatio(approvedCount);

    return {
      "pre-production": {
        href: null,
        progress: 0,
        progressLabel: "Unavailable",
        status: { label: "Planned", tone: "neutral" },
        agentStatus: { label: "Unavailable", tone: "neutral" },
        humanStatus: { label: "Scope required", tone: "waiting" },
        links: [],
      },
      production: {
        href: surfaceHref("media"),
        progress: productionProgress,
        progressLabel: uploading && uploadStatus
          ? `${Math.round(uploadStatus.progress)}% upload`
          : assets.length > 0
            ? `${readyAssetCount} of ${assets.length} media ready`
            : "No media records",
        status: uploadStatus?.phase === "error"
          ? { label: "Needs attention", tone: "attention" }
          : { label: assets.length > 0 ? "In progress" : "Not started", tone: assets.length > 0 ? "active" : "neutral" },
        agentStatus: { label: "Unavailable", tone: "neutral" },
        humanStatus: uploading
          ? { label: "Upload in progress", tone: "active" }
          : readyAssetCount > 0
            ? { label: `${readyAssetCount} media ready`, tone: "complete" }
            : { label: "Upload media", tone: "waiting" },
        links: [
          { label: "Media", href: surfaceHref("media") },
          { label: "Metadata", href: surfaceHref("metadata") },
        ],
      },
      "post-production": {
        href: surfaceHref("reviews"),
        progress: postProductionProgress,
        progressLabel: assets.length > 0
          ? `${reviewAssetCount} of ${assets.length} review ready`
          : "No media records",
        status: {
          label: inReviewCount > 0 ? "In review" : reviewAssetCount > 0 ? "Review ready" : "Not started",
          tone: inReviewCount > 0 ? "active" : reviewAssetCount > 0 ? "waiting" : "neutral",
        },
        agentStatus: { label: "Proposal only", tone: "neutral" },
        humanStatus: approvedCount > 0
          ? { label: `${approvedCount} approved`, tone: "complete" }
          : inReviewCount > 0
            ? { label: "Review active", tone: "active" }
            : { label: "Waiting on media", tone: "waiting" },
        links: [
          { label: "Reviews", href: surfaceHref("reviews") },
          { label: "Approvals", href: surfaceHref("approvals") },
          { label: "Versions", href: surfaceHref("versions") },
        ],
      },
      "delivery-assets": {
        href: `/library${demoMode ? "?demo=1" : ""}`,
        progress: deliveryProgress,
        progressLabel: assets.length > 0
          ? `${approvedCount} of ${assets.length} approved`
          : "No media records",
        status: {
          label: approvedCount > 0 ? "Approval reached" : "Waiting",
          tone: approvedCount > 0 ? "complete" : "waiting",
        },
        agentStatus: { label: "Unavailable", tone: "neutral" },
        humanStatus: approvedCount > 0
          ? { label: "Package review ready", tone: "complete" }
          : { label: "Waiting on approval", tone: "waiting" },
        links: [
          { label: "Asset library", href: `/library${demoMode ? "?demo=1" : ""}` },
          { label: "Project archive", href: `/projects/archive${demoMode ? "?demo=1" : ""}` },
        ],
      },
    };
  }, [
    activeAsset?.id,
    approvedCount,
    assets,
    demoMode,
    inReviewCount,
    project.id,
    uploadStatus,
    uploading,
  ]);
  const filteredAssets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return assets.filter((asset) => asset.title.toLowerCase().includes(query)).slice(0, 5);
  }, [assets, searchQuery]);

  const loadLiveVersions = useCallback(async () => {
    if (demoMode || !activeAsset) {
      liveVersionRequestRef.current += 1;
      setLiveVersions([]);
      setLiveVersionAssetId(null);
      setLiveVersionsLoading(false);
      setLiveVersionsError(false);
      return;
    }

    const assetId = activeAsset.id;
    const requestId = liveVersionRequestRef.current + 1;
    liveVersionRequestRef.current = requestId;
    setLiveVersionsLoading(true);
    setLiveVersionsError(false);
    setLiveVersions([]);
    setLiveVersionAssetId(null);
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/versions`, { cache: "no-store" });
      const payload = response.ok ? await response.json() : { items: [] };
      if (!shouldApplyLiveInternalReviewResponse({
        requestId,
        latestRequestId: liveVersionRequestRef.current,
        requestedAssetId: assetId,
        activeAssetId: activeAsset.id,
      })) return;
      const items = Array.isArray(payload.items) ? payload.items : [];
      setLiveVersions(items.flatMap((item: Record<string, unknown>) => {
        const version = normalizeLiveReviewVersion(item);
        return version ? [version] : [];
      }));
      setLiveVersionAssetId(assetId);
      setLiveVersionsError(!response.ok);
    } catch {
      if (!shouldApplyLiveInternalReviewResponse({
        requestId,
        latestRequestId: liveVersionRequestRef.current,
        requestedAssetId: assetId,
        activeAssetId: activeAsset.id,
      })) return;
      setLiveVersions([]);
      setLiveVersionAssetId(assetId);
      setLiveVersionsError(true);
    } finally {
      if (shouldApplyLiveInternalReviewResponse({
        requestId,
        latestRequestId: liveVersionRequestRef.current,
        requestedAssetId: assetId,
        activeAssetId: activeAsset.id,
      })) setLiveVersionsLoading(false);
    }
  }, [activeAsset, demoMode]);

  const loadLiveAssetData = useCallback(async () => {
    if (demoMode || !activeAsset || !activeLiveVersion || !activeLiveReviewKey) {
      liveAssetRequestRef.current += 1;
      setLiveAssetDataKey(null);
      setLiveComments([]);
      setLiveCutMarkers([]);
      setLiveShareLinks([]);
      return;
    }

    const assetId = activeAsset.id;
    const versionId = activeLiveVersion.id;
    const requestId = liveAssetRequestRef.current + 1;
    liveAssetRequestRef.current = requestId;
    setLiveAssetDataKey(null);
    setLiveComments([]);
    setLiveCutMarkers([]);
    setLiveShareLinks([]);

    const [commentsResponse, decisionsResponse, linksResponse] = await Promise.all([
      fetch(`/api/assets/${assetId}/comments?version_id=${encodeURIComponent(versionId)}`, { cache: "no-store" }),
      fetch(`/api/assets/${assetId}/edit-decisions?version_id=${encodeURIComponent(versionId)}`, { cache: "no-store" }),
      fetch(`/api/assets/${assetId}/share`, { cache: "no-store" }),
    ]);
    const [commentsPayload, decisionsPayload, linksPayload] = await Promise.all([
      commentsResponse.ok ? commentsResponse.json() : Promise.resolve({ items: [] }),
      decisionsResponse.ok ? decisionsResponse.json() : Promise.resolve({ items: [] }),
      linksResponse.ok ? linksResponse.json() : Promise.resolve({ items: [] }),
    ]);
    if (liveAssetRequestRef.current !== requestId || activeLiveReviewKey !== `${assetId}:${versionId}`) return;

    const commentItems = Array.isArray(commentsPayload.items) ? commentsPayload.items : [];
    setLiveComments(
      commentItems.map((item: Record<string, unknown>) => normalizeLiveComment(item, project.id, assetId)),
    );

    const decisionItems = Array.isArray(decisionsPayload.items)
      ? (decisionsPayload.items as EditDecision[])
      : [];
    setLiveCutMarkers(
      decisionItems
        .filter((decision) => decision.decision_type === "cut" && decision.status !== "rejected")
        .map((decision) => ({
          id: decision.id,
          project_id: project.id,
          asset_id: assetId,
          version_id: decision.version_id,
          time_seconds: decision.start_seconds,
          created_at: decision.created_at,
        })),
    );

    const reviewOrigin = getReviewSiteUrl(window.location.origin);
    const linkItems = Array.isArray(linksPayload.items) ? linksPayload.items : [];
    setLiveShareLinks(
      linkItems.flatMap((item: Record<string, unknown>) => {
        const link = normalizeLiveShareLink(item, assetId, reviewOrigin);
        return link ? [link] : [];
      }),
    );
    setLiveAssetDataKey(`${assetId}:${versionId}`);
  }, [activeAsset, activeLiveReviewKey, activeLiveVersion, demoMode, project.id]);

  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;
    fetch("/api/activity", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((payload) => {
        if (cancelled) return;
        const items = Array.isArray(payload.items) ? payload.items : [];
        setLiveActivity(
          items
            .map((item: Record<string, unknown>) => normalizeLiveActivity(item))
            .filter((item: DemoActivityItem) => item.project_id === project.id),
        );
      })
      .catch(() => {
        if (!cancelled) setLiveActivity([]);
      });
    return () => {
      cancelled = true;
    };
  }, [demoMode, project.id]);

  useEffect(() => {
    if (demoMode) return;
    void loadLiveVersions().catch(() => undefined);
  }, [demoMode, loadLiveVersions]);

  useEffect(() => {
    if (demoMode) return;
    void loadLiveAssetData().catch(() => undefined);
  }, [demoMode, loadLiveAssetData]);

  const leaveReviewView = useCallback(() => {
    if (!reviewViewActive) return;
    setReviewViewActive(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    const query = params.toString();
    router.push(`/projects/${project.id}${query ? `?${query}` : ""}`);
  }, [project.id, reviewViewActive, router, searchParams]);

  const changeMode = useCallback((mode: Parameters<typeof setMode>[0]) => {
    leaveReviewView();
    setLifecycleOpen(false);
    setMode(mode);
  }, [leaveReviewView, setMode]);

  useEffect(() => {
    if (!simulatedPlayback || !isPlaying) return;
    const timer = window.setInterval(() => {
      setCurrentTime((time) => {
        const next = time + 0.1;
        if (next >= previewDuration) {
          setIsPlaying(false);
          setHasEnded(true);
          return previewDuration;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [isPlaying, previewDuration, simulatedPlayback]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setMobileNavOpen(false);
        setMobileDockOpen(false);
        setNotificationsOpen(false);
        setAccountOpen(false);
        setLifecycleOpen(false);
        setCommandOpen(true);
        return;
      }

      const target = event.target;
      const editing = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);
      const insideControl = target instanceof HTMLElement
        && Boolean(target.closest("button, input, select, textarea, a, [contenteditable='true']"));
      if (
        activeAsset
        && activeSection === "overview"
        && handleReviewShortcutEvent(event, insideControl, event.isComposing)
      ) {
        return;
      }
      if (editing) return;

      if (event.altKey && ["1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        changeMode(event.key === "1" ? "review" : event.key === "2" ? "edit" : "focus");
        return;
      }

      if (event.key === "[") {
        event.preventDefault();
        if (compactViewport) setMobileNavOpen((open) => !open);
        else toggleRail();
        return;
      }

      if (event.key === "]") {
        event.preventDefault();
        if (compactViewport) setMobileDockOpen((open) => !open);
        else if (reviewViewActive) setReviewDetailsOpen((open) => !open);
        else toggleDock();
        return;
      }

      // Header popover dismissal (Escape + outside pointer) is owned by
      // useOverlay's dismiss stack — it must fire even while an input holds
      // focus, so it cannot live behind the `editing` guard above.
      if (event.key !== "Escape") return;
      if (mobileNavOpen) setMobileNavOpen(false);
      else if (mobileDockOpen) setMobileDockOpen(false);
      else if (reviewViewActive && reviewDetailsOpen) setReviewDetailsOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    compactViewport,
    mobileDockOpen,
    mobileNavOpen,
    reviewDetailsOpen,
    reviewViewActive,
    changeMode,
    toggleDock,
    toggleRail,
    activeAsset,
    activeSection,
    currentTime,
    seekStepSeconds,
  ]);

  const currentStage: ProjectStage = (
    demoMode ? workspace.projects.find((candidate) => candidate.id === project.id)?.stage : undefined
  ) ?? "inquiry";
  const currentStageIndex = PROJECT_STAGES.indexOf(currentStage);
  const nextStage: ProjectStage | null = currentStageIndex >= 0 && currentStageIndex < PROJECT_STAGES.length - 1
    ? PROJECT_STAGES[currentStageIndex + 1]
    : null;

  function handleAdvanceStage(): { ok: boolean; reason?: string } {
    const result = advanceProjectStage(project.id);
    if (!result.ok) {
      setToast("");
      return { ok: false, reason: result.reason };
    }
    // Report the stage we actually advanced to — the workspace snapshot in
    // this closure still holds the pre-mutation stage.
    setToast(nextStage
      ? `Stage advanced to ${PROJECT_STAGE_META[nextStage].label}.`
      : "Stage advanced.");
    return { ok: true };
  }

  function selectSection(section: CockpitSection) {
    if (reviewViewActive) setReviewViewActive(false);
    setLifecycleOpen(false);
    const href = projectCockpitSurfaceHref(project.id, searchParams, section);
    const currentQuery = searchParams.toString();
    const currentHref = `/projects/${encodeURIComponent(project.id)}${currentQuery ? `?${currentQuery}` : ""}`;
    if (href !== currentHref) router.push(href);
    setActiveSection(section);
    setMobileNavOpen(false);
    setMobileDockOpen(false);
  }

  function handleLifecycleOpenChange(open: boolean) {
    setLifecycleOpen(open);
    if (!open) return;
    setMobileNavOpen(false);
    setMobileDockOpen(false);
    setNotificationsOpen(false);
    setAccountOpen(false);
    setCommandOpen(false);
  }

  function handleLifecycleNavigate(destination: CoProduceLifecycleDestination) {
    const target = new URL(destination.href, window.location.origin);
    const surface = target.searchParams.get("surface");
    const section = COCKPIT_NAVIGATION.find((item) => item.id === surface)?.id;
    if (section) selectSection(section);
  }

  function toggleProjectRail() {
    setLifecycleOpen(false);
    if (compactViewport) setMobileNavOpen((open) => !open);
    else toggleRail();
  }

  function toggleOperatorDock() {
    setLifecycleOpen(false);
    if (reviewViewActive) {
      if (compactViewport) setMobileDockOpen((open) => !open);
      else setReviewDetailsOpen((open) => !open);
      return;
    }
    if (activeSection !== "overview") {
      leaveReviewView();
      selectSection("overview");
      if (compactViewport) setMobileDockOpen(true);
      else if (!layout.dockOpen) toggleDock();
      return;
    }
    if (compactViewport) setMobileDockOpen((open) => !open);
    else {
      leaveReviewView();
      toggleDock();
    }
  }

  function closeOperatorDock() {
    if (reviewViewActive) {
      setMobileDockOpen(false);
      setReviewDetailsOpen(false);
      return;
    }
    if (compactViewport) setMobileDockOpen(false);
    else {
      leaveReviewView();
      toggleDock();
    }
  }

  function selectDockTab(tab: Parameters<typeof setDockTab>[0]) {
    if (reviewViewActive && tab === "review") {
      if (compactViewport) setMobileDockOpen(true);
      else setReviewDetailsOpen(true);
      return;
    }
    leaveReviewView();
    setReviewDetailsOpen(false);
    setDockTab(tab);
    if (compactViewport) setMobileDockOpen(true);
  }

  function selectAsset(asset: MediaAsset) {
    liveAssetRequestRef.current += 1;
    liveVersionRequestRef.current += 1;
    setLiveAssetDataKey(null);
    setLiveComments([]);
    setLiveCutMarkers([]);
    setLiveShareLinks([]);
    setLiveVersions([]);
    setLiveVersionAssetId(null);
    setLiveVersionsError(false);
    setActiveAssetId(asset.id);
    setCurrentTime(0);
    setNativeDuration(0);
    setIsPlaying(false);
    setHasEnded(false);
    setSearchQuery("");
    if (typeof videoRef.current?.pause === "function") videoRef.current.pause();
    if (typeof videoRef.current?.load === "function") videoRef.current.load();
    setNativeVideoActive(false);
    setSimulatedPlayback(false);
    setPendingPin(null);
    setResumeAfterComment(false);
    if (requestedVersionId !== null) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("asset", asset.id);
      params.delete("version");
      router.replace(`/projects/${project.id}?${params.toString()}`);
    }
  }

  function selectDemoReviewVersion(versionId: string) {
    if (!demoMode || !activeAsset) return;
    const version = resolvePinnedDemoMediaVersion(workspace.mediaVersions, activeAsset.id, versionId);
    if (!version) {
      setToast("Requested media version unavailable.");
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("demo", "1");
    params.set("asset", activeAsset.id);
    params.set("version", version.id);
    router.replace(`/projects/${project.id}?${params.toString()}`);
    setCurrentTime(0);
    setNativeDuration(0);
    setIsPlaying(false);
    setHasEnded(false);
    setPendingPin(null);
    setResumeAfterComment(false);
    if (typeof videoRef.current?.pause === "function") videoRef.current.pause();
    if (typeof videoRef.current?.load === "function") videoRef.current.load();
  }

  function selectLiveReviewVersion(versionId: string) {
    if (demoMode || !activeAsset) return;
    const version = liveVersions.find(
      (candidate) => candidate.id === versionId && candidate.asset_id === activeAsset.id,
    );
    if (!version) {
      setToast("Requested media version unavailable.");
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("asset", activeAsset.id);
    params.set("version", version.id);
    router.replace(`/projects/${project.id}?${params.toString()}`);
    setCurrentTime(0);
    setNativeDuration(0);
    setIsPlaying(false);
    setHasEnded(false);
    setPendingPin(null);
    setResumeAfterComment(false);
    if (typeof videoRef.current?.pause === "function") videoRef.current.pause();
    if (typeof videoRef.current?.load === "function") videoRef.current.load();
  }

  function openReviewCockpit() {
    if (!activeAsset) return;
    setLifecycleOpen(false);
    setActiveSection("overview");
    setReviewViewActive(true);
    setReviewDetailsOpen(false);
    setTimelineOpen(false);
    setMode("review");
    setDockTab("review");
    setMobileDockOpen(false);
    const params = new URLSearchParams();
    if (demoMode) params.set("demo", "1");
    params.set("asset", activeAsset.id);
    if (demoMode && activeDemoVersionId) params.set("version", activeDemoVersionId);
    if (!demoMode && activeLiveVersion) params.set("version", activeLiveVersion.id);
    params.set("view", "review");
    router.replace(`/projects/${project.id}?${params.toString()}`);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".cockpit-review-stage")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      videoFrameRef.current?.focus({ preventScroll: true });
    });
  }

  async function togglePlayback() {
    if (!reviewOperationsAllowed) return;
    setPlaybackError(null);
    const video = videoRef.current;
    if (!video || typeof video.play !== "function" || typeof video.pause !== "function") {
      if (sourceCatalog || localUploadActive || !demoMode) { setPlaybackError("Video playback is unavailable. Reload and try again."); return; }
      setSimulatedPlayback(true);
      if (hasEnded) {
        setHasEnded(false);
        setCurrentTime(0);
        setIsPlaying(true);
        return;
      }
      setIsPlaying((playing) => !playing);
      return;
    }
    try {
      if (video.paused) {
        if (video.ended || hasEnded) video.currentTime = 0;
        setHasEnded(false);
        await video.play();
        setNativeVideoActive(true);
      } else {
        video.pause();
      }
    } catch {
      if (sourceCatalog || localUploadActive || !demoMode) { setIsPlaying(false); setPlaybackError("This video could not play. Try again or choose another file."); return; }
      setSimulatedPlayback(true);
      setNativeVideoActive(false);
      setIsPlaying((playing) => !playing);
    }
  }

  async function replayFromStart() {
    if (!reviewOperationsAllowed) return;
    setPlaybackError(null);
    const video = videoRef.current;
    setHasEnded(false);
    setCurrentTime(0);
    if (video) video.currentTime = 0;
    if (video && typeof video.play === "function") {
      try {
        await video.play();
        setNativeVideoActive(true);
        return;
      } catch {
        setNativeVideoActive(false);
      }
    }
    if (sourceCatalog || localUploadActive || !demoMode) { setIsPlaying(false); setPlaybackError("This video could not play. Try again or choose another file."); return; }
    setSimulatedPlayback(true);
    setIsPlaying(true);
  }

  function seekTo(seconds: number) {
    if (!reviewOperationsAllowed) return;
    const normalized = Math.max(0, Math.min(previewDuration, seconds));
    if (videoRef.current) videoRef.current.currentTime = normalized;
    if (normalized < previewDuration) setHasEnded(false);
    setCurrentTime(normalized);
  }

  function changeVolume(nextVolume: number) {
    if (!reviewOperationsAllowed) return;
    const normalized = Math.max(0, Math.min(1, nextVolume));
    setVolume(normalized);
    if (videoRef.current) videoRef.current.volume = normalized;
    if (normalized > 0 && isMuted) setIsMuted(false);
  }

  function toggleMute() {
    if (!reviewOperationsAllowed) return;
    setIsMuted((muted) => !muted);
  }

  function handleReviewFrameClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!reviewOperationsAllowed || !activeAsset) return;
    const frameRect = videoFrameRef.current?.getBoundingClientRect()
      ?? event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - frameRect.left) / frameRect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - frameRect.top) / frameRect.height) * 100));
    const wasPlaying = isPlaying;

    if (typeof videoRef.current?.pause === "function") videoRef.current.pause();
    setIsPlaying(false);
    setResumeAfterComment(wasPlaying);
    setPendingPin({ x, y, timeSeconds: currentTime });
    window.requestAnimationFrame(() => commentInputRef.current?.focus());
  }

  async function addCutDecision() {
    if (!reviewOperationsAllowed || !activeAsset || (!demoMode && !activeLiveVersion)) return;
    if (demoMode) {
      if (!activeDemoVersionId) {
        setToast("Requested media version unavailable.");
        return;
      }
      const saved = addDemoReviewCutMarker({
        projectId: project.id,
        assetId: activeAsset.id,
        versionId: activeDemoVersionId,
        timeSeconds: currentTime,
      });
      setToast(saved
        ? `Cut decision marked at ${formatClock(currentTime)}`
        : "This cut marker could not be bound to the current media version.");
      return;
    }
    const liveVersionId = activeLiveVersion?.id;
    if (!liveVersionId) return;

    const response = await fetch(`/api/assets/${activeAsset.id}/edit-decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version_id: liveVersionId,
        decision_type: "cut",
        source: "keyboard",
        start_seconds: currentTime,
        end_seconds: null,
        label: `Cut at ${formatClock(currentTime)}`,
        confidence: null,
        client_request_id: crypto.randomUUID(),
        status: "proposed",
        metadata: { keyboard_shortcut: "ArrowDown" },
      }),
    });
    if (!response.ok) {
      setToast("The cut marker could not be saved.");
      return;
    }
    const decision = (await response.json()) as EditDecision;
    setLiveCutMarkers((current) => [
      ...current.filter((marker) => marker.id !== decision.id),
      {
        id: decision.id,
        project_id: project.id,
        asset_id: activeAsset.id,
        version_id: decision.version_id,
        time_seconds: decision.start_seconds,
        created_at: decision.created_at,
      },
    ]);
    setToast(`Cut proposal saved at ${formatClock(currentTime)}`);
  }

  function handleReviewShortcutEvent(
    event: {
      key: string;
      defaultPrevented: boolean;
      altKey: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
      repeat: boolean;
      preventDefault: () => void;
    },
    insideControl: boolean,
    isComposing: boolean,
  ) {
    if (!reviewOperationsAllowed) return false;
    const key = normalizeReviewShortcutKey(event.key);
    if (shouldIgnoreReviewShortcut({
      key,
      insideControl,
      defaultPrevented: event.defaultPrevented,
      isComposing,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      repeat: event.repeat,
    })) return false;

    if (key === " " || key.toLowerCase() === "k") {
      event.preventDefault();
      void togglePlayback();
      return true;
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      seekTo(currentTime + (key === "ArrowLeft" ? -seekStepSeconds : seekStepSeconds));
      return true;
    }
    if (key === "ArrowDown") {
      event.preventDefault();
      void addCutDecision();
      return true;
    }
    return false;
  }

  function handleReviewShortcut(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    handleReviewShortcutEvent(
      event,
      Boolean(target.closest("button, input, select, textarea, a, [contenteditable='true']")),
      event.nativeEvent.isComposing,
    );
  }

  async function submitComment() {
    if (!reviewOperationsAllowed || !activeAsset || (!demoMode && !activeLiveVersion) || !commentBody.trim() || commentSubmitting) return;
    if (demoMode && !activeDemoVersionId) {
      setToast("Requested media version unavailable.");
      return;
    }
    const shouldResume = resumeAfterComment;
    const submittedBody = commentBody.trim();
    const submittedTime = pendingPin?.timeSeconds ?? currentTime;
    if (demoMode) {
      addDemoReviewComment({
        projectId: project.id,
        assetId: activeAsset.id,
        versionId: activeDemoVersionId ?? undefined,
        body: submittedBody,
        timeSeconds: submittedTime,
        pinX: pendingPin?.x,
        pinY: pendingPin?.y,
      });
    } else {
      const liveVersionId = activeLiveVersion?.id;
      if (!liveVersionId) return;
      setCommentSubmitting(true);
      try {
        const response = await fetch(`/api/assets/${activeAsset.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version_id: liveVersionId,
            body: submittedBody,
            author_name: viewerName,
            author_email: viewerEmail || undefined,
            timecode_seconds: submittedTime,
            pin_x: pendingPin?.x ?? null,
            pin_y: pendingPin?.y ?? null,
          }),
        });
        if (!response.ok) {
          setToast("The comment could not be saved.");
          return;
        }
        const created = (await response.json()) as Record<string, unknown>;
        setLiveComments((current) => [
          ...current,
          normalizeLiveComment(created, project.id, activeAsset.id),
        ]);
      } catch {
        setToast("The comment could not be saved.");
        return;
      } finally {
        setCommentSubmitting(false);
      }
    }
    setCommentBody("");
    setPendingPin(null);
    setResumeAfterComment(false);
    setCommentStatus("open");
    setToast("Timecoded comment added");
    videoFrameRef.current?.focus({ preventScroll: true });
    if (shouldResume) {
      window.requestAnimationFrame(() => {
        const video = videoRef.current;
        if (video && typeof video.play === "function") {
          void video.play().then(() => setNativeVideoActive(true)).catch(() => {
            setSimulatedPlayback(true);
            setIsPlaying(true);
          });
        } else {
          setSimulatedPlayback(true);
          setIsPlaying(true);
        }
      });
    }
  }

  async function toggleCommentStatus(comment: DemoReviewComment) {
    if (!reviewOperationsAllowed || !activeAsset || (!demoMode && !activeLiveVersion)) return;
    if (demoMode) {
      toggleDemoReviewCommentResolved(comment.id);
      return;
    }
    const liveVersionId = activeLiveVersion?.id;
    if (!liveVersionId) return;
    const status = comment.status === "open" ? "resolved" : "open";
    const response = await fetch(`/api/assets/${activeAsset.id}/comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: comment.id, status, version_id: liveVersionId }),
    });
    if (!response.ok) {
      setToast("The comment status could not be updated.");
      return;
    }
    setLiveComments((current) =>
      current.map((candidate) => candidate.id === comment.id ? { ...candidate, status } : candidate),
    );
  }

  async function setShareLinkActive(link: DemoShareLink) {
    if (demoMode) {
      setDemoShareLinkActive(link.id, !link.is_active);
      return;
    }
    if (!activeAsset || !link.is_active) return;
    const response = await fetch(`/api/assets/${activeAsset.id}/share`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: link.id }),
    });
    if (!response.ok) {
      setToast("The review link could not be revoked.");
      return;
    }
    setLiveShareLinks((current) =>
      current.map((candidate) => candidate.id === link.id ? { ...candidate, is_active: false } : candidate),
    );
  }

  async function signOut() {
    if (demoMode) {
      signOutDemoSession();
      window.location.href = "/login?demo=1";
      return;
    }
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  const commandItems: CommandPaletteItem[] = [
    ...COCKPIT_NAVIGATION.map((item) => ({
      id: `section-${item.id}`,
      label: item.label,
      description: `${project.name} project workspace`,
      keywords: [item.shortLabel, "section", "project"],
      section: "Navigate",
      icon: Compass,
      onSelect: () => selectSection(item.id),
    })),
    ...assets.map((asset) => ({
      id: `asset-${asset.id}`,
      label: asset.title,
      description: `${versionLabel(asset, demoMode)} · ${formatAssetStatus(asset.status)}`,
      keywords: [asset.file_type, asset.status, "media", "deliverable"],
      section: "Media",
      icon: Play,
      onSelect: () => {
        selectAsset(asset);
        selectSection("overview");
      },
    })),
    {
      id: "action-upload",
      label: "Upload media",
      description: "Add media to this project",
      keywords: ["add", "ingest", "file"],
      section: "Actions",
      icon: Upload,
      disabled: uploading || !canUpload,
      onSelect: onUpload,
    },
    {
      id: "action-share",
      label: "Share review",
      description: "Create a permissioned review link",
      keywords: ["client", "link", "review"],
      section: "Actions",
      icon: Share2,
      disabled: !contextualShareAllowed || !canShare,
      onSelect: () => setShareOpen(true),
    },
    {
      id: "layout-rail",
      label: compactRail ? "Expand project rail" : "Compact project rail",
      description: "Change the project navigation density",
      keywords: ["layout", "sidebar", "navigation"],
      section: "Layout",
      icon: PanelLeft,
      onSelect: toggleProjectRail,
    },
    {
      id: "layout-dock",
      label: dockVisible ? "Close operator dock" : "Open operator dock",
      description: "Show review, version, inspector, and activity tools",
      keywords: ["layout", "panel", "details"],
      section: "Layout",
      icon: PanelRight,
      onSelect: toggleOperatorDock,
    },
    {
      id: "layout-save",
      label: "Save workspace layout",
      description: "Persist this project layout on this device",
      keywords: ["layout", "workspace", "remember"],
      section: "Layout",
      icon: Save,
      onSelect: saveWorkspace,
    },
  ];

  const uploadTerminal =
    uploadStatus?.phase === "complete" || uploadStatus?.phase === "error";
  const uploadSteps: Array<[CockpitUploadStatus["phase"], string]> =
    uploadStatus?.mode === "demo"
      ? [
          ["validating", "Read selected media"],
          ["transferring", "Store local source"],
          ["indexing", "Register project record"],
        ]
      : [
          ["validating", "Validate media"],
          ["transferring", "Transfer to media storage"],
          ["proxy", "Prepare review proxy"],
          ["indexing", "Index project metadata"],
        ];

  return (
    <div
      className={`cockpit-shell ${styles.shell}`}
      data-mode={effectiveMode}
      data-rail={compactRail ? "compact" : "expanded"}
      data-dock={dockVisible ? "open" : "closed"}
      data-mobile-dock={mobileDockOpen ? "open" : "closed"}
      data-density={layout.density}
      data-online={online}
    >
      <a className={styles.skipLink} href="#cockpit-workspace-content">Skip to project workspace</a>
      <header className="cockpit-header">
        <Link className="cockpit-brand" href={demoMode ? "/projects?demo=1" : "/projects"} aria-label="Co‑VideoPro projects">
          <CoProductionBrand className={styles.brandLockup} priority />
        </Link>

        <div className="cockpit-project-switcher">
          <button
            className="cockpit-mobile-menu"
            type="button"
            onClick={() => {
              setLifecycleOpen(false);
              setMobileNavOpen(true);
            }}
            aria-label="Open project navigation"
            aria-expanded={mobileNavOpen}
          >
            <Menu size={20} />
          </button>
          <BriefcaseBusiness size={21} />
          <label>
            <span>Projects</span>
            <select
              value={project.id}
              onChange={(event) => router.push(`/projects/${event.target.value}${demoMode ? "?demo=1" : ""}`)}
              aria-label="Current project"
            >
              {(demoMode ? workspace.projects : projects).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </label>
          <ChevronDown size={15} aria-hidden="true" />
        </div>

        {demoMode ? (
          <span
            className={styles.stageChip}
            data-stage-pill
            title={`${PROJECT_STAGE_META[currentStage].summary} Stage changes happen from the Lifecycle drawer.`}
            aria-label={`Project stage: ${PROJECT_STAGE_META[currentStage].label}`}
          >
            <span className={styles.stageChipDot} aria-hidden="true" />
            {PROJECT_STAGE_META[currentStage].label}
          </span>
        ) : null}

        <div className="cockpit-search-wrap">
          <Search size={18} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search project or media"
            aria-label="Search project or media"
          />
          {filteredAssets.length > 0 ? (
            <div className="cockpit-search-results">
              {filteredAssets.map((asset) => (
                <button key={asset.id} type="button" onClick={() => selectAsset(asset)}>
                  <ProjectAssetThumbnail
                    asset={asset}
                    demoMode={demoMode}
                    width={46}
                    height={30}
                  />
                  <span>{asset.title}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="cockpit-header-actions">
          <button
            className="cockpit-action-secondary"
            type="button"
            onClick={() => {
              setLifecycleOpen(false);
              setShareOpen(true);
            }}
            disabled={!canShare || !activeAsset}
            aria-label="Share project"
          >
            <Share2 size={17} /> <span>Share</span>
          </button>
          <button
            className="cockpit-action-primary"
            type="button"
            onClick={() => {
              setLifecycleOpen(false);
              onUpload();
            }}
            disabled={uploading || !canUpload}
            aria-label={uploading ? "Uploading media" : "Upload media"}
          >
            <Plus size={18} /> <span>{uploading ? "Uploading" : "Upload"}</span>
          </button>
          <div className="cockpit-popover-anchor">
            <button
              ref={notificationButtonRef}
              className="cockpit-icon-button"
              type="button"
              onClick={() => {
                setNotificationsOpen((open) => !open);
                setAccountOpen(false);
                setLifecycleOpen(false);
              }}
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              aria-controls="cockpit-notifications"
            >
              <Bell size={19} />
              {projectActivity.length > 0 ? <i /> : null}
            </button>
            {notificationsOpen ? (
              <div
                ref={notificationsOverlayRef}
                style={notificationsOverlayStyle}
                id="cockpit-notifications"
                className="cockpit-popover cockpit-notifications"
                role="region"
                aria-label="Project notifications"
              >
                <header className="cockpit-popover-heading">
                  <span><Bell size={14} aria-hidden="true" /> Audit notifications</span>
                  <small>{projectActivity.length} project events</small>
                </header>
                <div className="cockpit-notification-summary">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>
                    <strong>Project signal is scoped to this workspace.</strong>
                    <small>Email, text, and audit routing stay in preferences.</small>
                  </span>
                </div>
                {projectActivity.length > 0 ? (
                  <div className="cockpit-popover-list">
                    {projectActivity.slice(0, 4).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          selectDockTab("activity");
                          setNotificationsOpen(false);
                        }}
                      >
                        <span>{item.actor_name} {formatActivity(item.action)}</span>
                        <small>{item.details.asset_title ?? project.name} · {timeAgo(item.created_at)}</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="cockpit-popover-empty">No project audit events are waiting.</p>
                )}
                <footer className="cockpit-popover-actions">
                  <Link href={demoMode ? "/settings?demo=1" : "/settings"}>Preferences</Link>
                  <button type="button" onClick={() => setNotificationsOpen(false)}>Done</button>
                </footer>
              </div>
            ) : null}
          </div>
          <div className="cockpit-popover-anchor">
            <button
              ref={accountButtonRef}
              className="cockpit-avatar-button"
              type="button"
              onClick={() => {
                setAccountOpen((open) => !open);
                setNotificationsOpen(false);
                setLifecycleOpen(false);
              }}
              aria-label="Open account menu"
              aria-expanded={accountOpen}
              aria-controls="cockpit-account-menu"
            >
              {avatarInitials(viewerName) || "CC"}
            </button>
            {accountOpen ? (
              <div
                ref={accountOverlayRef}
                style={accountOverlayStyle}
                id="cockpit-account-menu"
                className="cockpit-popover cockpit-account"
                role="menu"
                aria-label="Account menu"
              >
                <header className="cockpit-popover-heading">
                  <span>{viewerName}</span>
                  <small>{workspaceRole} workspace role</small>
                </header>
                <p className="cockpit-account-email">{viewerEmail || "Local demo session"}</p>
                <Link href={demoMode ? "/settings?demo=1" : "/settings"} role="menuitem">Account settings</Link>
                <Link href={demoMode ? "/settings?demo=1" : "/settings"} role="menuitem">Branding and preferences</Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void signOut()}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className={styles.toolbarSlot}>
        <CockpitToolbar
          mode={effectiveMode}
          railExpanded={!compactRail}
          dockOpen={dockVisible}
          online={online}
          savedAt={savedAt}
          collaborators={collaborators}
          lifecycleControl={(
            <CoProduceLifecycleDrawer
              phases={lifecyclePhases}
              open={lifecycleOpen}
              onOpenChange={handleLifecycleOpenChange}
              onNavigate={handleLifecycleNavigate}
              advanceStage={demoMode ? {
                currentLabel: PROJECT_STAGE_META[currentStage].label,
                nextLabel: nextStage ? PROJECT_STAGE_META[nextStage].label : null,
                onAdvance: handleAdvanceStage,
              } : undefined}
            />
          )}
          onModeChange={changeMode}
          onToggleRail={toggleProjectRail}
          onToggleDock={toggleOperatorDock}
          onSave={saveWorkspace}
          onOpenCommandPalette={() => {
            setLifecycleOpen(false);
            setCommandOpen(true);
          }}
          commandButtonRef={commandButtonRef}
        />
      </div>

      <aside className="cockpit-sidebar" aria-label="Project navigation rail">
        <CockpitProjectNavigation
          activeSection={activeSection}
          dueTodayCount={dueTodayCount}
          projectId={project.id}
          projectQuery={searchParams.toString()}
          demoMode={demoMode}
          compact={compactRail}
          onSelect={selectSection}
          onCollapse={toggleRail}
        />
      </aside>
      <CockpitProjectNavigationDrawer
        open={mobileNavOpen}
        activeSection={activeSection}
        dueTodayCount={dueTodayCount}
        projectId={project.id}
        projectQuery={searchParams.toString()}
        demoMode={demoMode}
        onSelect={selectSection}
        onClose={() => setMobileNavOpen(false)}
      />
      <CockpitMobileNavigation
        activeSection={activeSection}
        dueTodayCount={dueTodayCount}
        drawerOpen={mobileNavOpen}
        onSelect={selectSection}
        onOpenDrawer={() => setMobileNavOpen(true)}
      />

      <main id="cockpit-workspace-content" className="cockpit-main" tabIndex={-1}>
        {activeSection === "overview" ? (
          <>
            {demoMode && !reviewViewActive ? <ProjectSourceArchive projectId={project.id} /> : null}
            <div className={`cockpit-overview-grid ${dockVisible ? "" : styles.overviewWithoutDock}`}>
              <div className={`cockpit-center-column ${reviewViewActive ? styles.reviewCenterColumn : ""}`}>
                <div className="cockpit-section-heading">
                  <h2>{
                    !activeAsset ? "Review workspace"
                      : requestedReviewVersionUnavailable ? "Review unavailable"
                        : historicalReviewLabel ? `Review ${historicalReviewLabel.replace("Historical ", "")}`
                          : "Latest review"
                  }</h2>
                  {activeAsset ? (
                    <>
                      <span>{requestedReviewVersionUnavailable ? "Requested cut" : activeReviewVersionLabel ?? versionLabel(activeAsset, demoMode)}</span>
                      <select
                        value={activeAsset.id}
                        onChange={(event) => {
                          const asset = assets.find((candidate) => candidate.id === event.target.value);
                          if (asset) selectAsset(asset);
                        }}
                        aria-label="Review media"
                      >
                        {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
                      </select>
                      {demoMode && activeDemoVersions.length > 0 && !requestedReviewVersionUnavailable ? (
                        <select
                          value={activeDemoVersionId ?? ""}
                          onChange={(event) => selectDemoReviewVersion(event.target.value)}
                          aria-label="Review media version"
                        >
                          {activeDemoVersions.map((version) => (
                            <option key={version.id} value={version.id}>
                              V{version.version_number}{version.source_label ? ` · ${version.source_label}` : ""}
                            </option>
                          ))}
                        </select>
                      ) : !demoMode && liveVersionAssetId === activeAsset.id && liveVersions.length > 0 && activeLiveVersion ? (
                        <select
                          value={activeLiveVersion.id}
                          onChange={(event) => selectLiveReviewVersion(event.target.value)}
                          aria-label="Review media version"
                        >
                          {liveVersions.map((version) => (
                            <option key={version.id} value={version.id}>
                              V{version.version_number}{version.is_current ? " · Current" : " · Historical"}
                            </option>
                          ))}
                        </select>
                      ) : !demoMode && liveVersionsLoading ? (
                        <span>Loading version…</span>
                      ) : !demoMode && liveVersionsError ? (
                        <span>Version history unavailable</span>
                      ) : null}
                    </>
                  ) : (
                    <button className="cockpit-action-primary cockpit-empty-upload" type="button" onClick={onUpload}>
                      <Upload size={15} /> Upload media
                    </button>
                  )}
                </div>

                {activeAsset ? (
                  reviewViewActive ? (
                    <div className={styles.reviewSummary} aria-label="Review summary">
                      <p className={styles.reviewSummaryLine}>
                        <Circle size={12} aria-hidden="true" />
                        <strong>{requestedReviewVersionUnavailable ? "Version unavailable" : historicalReviewLabel ?? formatAssetStatus(activeAsset.status)}</strong>
                        <span aria-hidden="true">·</span>
                        <span>{openCommentCount} open {openCommentCount === 1 ? "comment" : "comments"}</span>
                        {systemsReadiness.tone === "attention" ? (
                          <Link href={systemsHref} title={systemsReadiness.detail}>
                            <ServerCog size={12} aria-hidden="true" />
                            {systemsReadiness.label}
                          </Link>
                        ) : null}
                      </p>
                      <button
                        className={styles.reviewDetailsToggle}
                        type="button"
                        onClick={toggleOperatorDock}
                        aria-expanded={dockVisible}
                        aria-controls={`cockpit-review-details-${project.id}`}
                      >
                        <MessageSquareText size={15} aria-hidden="true" />
                        Comments & review details
                      </button>
                    </div>
                  ) : (
                    <div className="cockpit-review-strip" aria-label="Review readiness">
                      {reviewReadinessItems.map(({ id, value, detail, icon: Icon, tone }) => (
                        <article key={id} data-tone={tone} title={detail}>
                          <Icon size={13} aria-hidden="true" />
                          <strong>{value}</strong>
                        </article>
                      ))}
                      {systemsReadiness.tone === "attention" ? (
                        <Link className="cockpit-system-posture-link" href={systemsHref} data-tone="attention" title={systemsReadiness.detail}>
                          <ServerCog size={13} aria-hidden="true" />
                          <strong>{systemsReadiness.label}</strong>
                        </Link>
                      ) : null}
                    </div>
                  )
                ) : null}

                {activeAsset && requestedReviewVersionUnavailable ? (
                  <section className="cockpit-review-stage" role="alert" aria-label="Requested review version unavailable">
                    <EmptyState
                      title="Requested version unavailable"
                      body={demoMode
                        ? "This review link does not match a saved version for this media. No newer cut was opened."
                        : "This workspace cannot open the requested historical version yet. No substitute media was opened."}
                    />
                  </section>
                ) : activeAsset ? (
                  <section className="cockpit-review-stage" aria-label={`Review ${activeAsset.title}`}>
                    <div
                      ref={videoFrameRef}
                      className="cockpit-video-frame"
                      data-player-root
                      tabIndex={0}
                      onKeyDown={handleReviewShortcut}
                      aria-label="Review player"
                    >
                      {activePosterUrl ? (
                        <Image
                          className="cockpit-video-poster"
                          src={activePosterUrl}
                          alt={`${activeAsset.title} review frame`}
                          fill
                          sizes="(max-width: 900px) 100vw, 760px"
                          priority
                          unoptimized
                        />
                      ) : null}
                      {hlsMediaActive && activeMediaUrl ? (
                        <VideoPlayer
                          src={activeMediaUrl}
                          poster={activePosterUrl ?? undefined}
                          onTimeUpdate={setCurrentTime}
                          videoRef={videoRef}
                        />
                      ) : (
                        <video
                          ref={videoRef}
                          className={nativeVideoActive || (!demoMode && Boolean(activeMediaUrl)) ? "active" : ""}
                          src={activeMediaUrl ?? undefined}
                          poster={activePosterUrl ?? undefined}
                          preload="metadata"
                          playsInline
                          muted={isMuted}
                          onLoadedMetadata={(event) => {
                            setPlaybackError(null);
                            if (Number.isFinite(event.currentTarget.duration)) {
                              setNativeDuration(event.currentTarget.duration);
                              event.currentTarget.playbackRate = playbackSpeed;
                            }
                          }}
                          onError={() => { setIsPlaying(false); setPlaybackError("This video could not load. Check that the source file is available."); }}
                          onPlay={() => {
                            setIsPlaying(true);
                            setHasEnded(false);
                          }}
                          onPause={() => setIsPlaying(false)}
                          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                          onEnded={() => {
                            setIsPlaying(false);
                            setHasEnded(true);
                          }}
                        />
                      )}
                      <time>{formatClock(currentTime)}</time>
                      {playbackError ? <p role="alert">{playbackError}</p> : null}
                      <div
                        className={`cockpit-review-overlay ${styles.stageOverlay}`}
                        data-review-overlay
                        onClick={() => void togglePlayback()}
                        onDoubleClick={handleReviewFrameClick}
                        title="Click to play or pause · double-click to pin a comment"
                        aria-hidden="true"
                      />
                      {hasEnded ? (
                        <button
                          type="button"
                          className={styles.replayOverlay}
                          onClick={() => void replayFromStart()}
                          aria-label="Replay from beginning"
                        >
                          <RotateCcw size={18} aria-hidden="true" />
                          Replay
                        </button>
                      ) : null}
                      {comments.filter((comment) => comment.pin_x != null && comment.pin_y != null).map((comment, index) => (
                        <button
                          key={comment.id}
                          type="button"
                          className="cockpit-frame-pin"
                          style={{ left: `${comment.pin_x}%`, top: `${comment.pin_y}%` }}
                          onClick={() => {
                            seekTo(comment.time_seconds);
                            setToast(
                              comment.body.length > 96
                                ? `Comment: ${comment.body.slice(0, 96)}…`
                                : `Comment: ${comment.body}`,
                            );
                          }}
                          aria-label={`Jump to pinned comment ${index + 1} at ${formatShortClock(comment.time_seconds)}`}
                          title={comment.body}
                        >
                          {index + 1}
                        </button>
                      ))}
                      {pendingPin ? (
                        <span
                          className="cockpit-frame-pin pending"
                          style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%` }}
                          aria-hidden="true"
                        >
                          <MapPin size={14} fill="currentColor" />
                        </span>
                      ) : null}
                      <div className={`cockpit-video-controls ${styles.playerControls}`}>
                        <button type="button" onClick={togglePlayback} aria-label={isPlaying ? "Pause" : "Play"}>
                          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                        </button>
                        <span data-transport-time>{formatClock(currentTime)} / {formatClock(previewDuration)}</span>
                        <input
                          type="range"
                          min={0}
                          max={previewDuration}
                          step={0.01}
                          value={Math.min(currentTime, previewDuration)}
                          onChange={(event) => seekTo(Number(event.target.value))}
                          className={styles.playerSeek}
                          aria-label="Review playback position"
                        />
                        <select
                          value={seekStepSeconds}
                          onChange={(event) => {
                            const next = normalizeReviewSeekStep(Number(event.target.value));
                            setSeekStepSeconds(next);
                            window.localStorage.setItem(REVIEW_SEEK_STEP_STORAGE_KEY, String(next));
                          }}
                          aria-label="Keyboard seek interval"
                          title="Arrow key seek interval"
                        >
                          {[1, 2, 5, 10].map((seconds) => (
                            <option key={seconds} value={seconds}>{seconds}s</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={toggleMute}
                          aria-label={isMuted ? "Unmute" : "Mute"}
                        >
                          {isMuted ? <VolumeX size={19} /> : <Volume2 size={19} />}
                        </button>
                        <input
                          className={styles.volumeSlider}
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isMuted ? 0 : volume}
                          onChange={(event) => changeVolume(Number(event.target.value))}
                          aria-label="Volume"
                        />
                        <select aria-label="Playback speed" value={playbackSpeed}
                          onChange={(event) => {
                            const rate = Number(event.target.value);
                            setPlaybackSpeed(rate);
                            if (videoRef.current) videoRef.current.playbackRate = rate;
                          }}>
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
                            const nativeFullscreen = () => { try { video?.webkitEnterFullscreen?.(); } catch { /* Browser may require a new gesture. */ } };
                            if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
                            else if (video?.requestFullscreen) void video.requestFullscreen().catch(nativeFullscreen);
                            else nativeFullscreen();
                          }}
                          aria-label="Enter fullscreen"
                        >
                          <Maximize2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div className={`cockpit-comment-composer ${pendingPin ? "is-pinning" : ""}`}>
                      <span className="cockpit-avatar">{avatarInitials(viewerName) || "CC"}</span>
                      <div className="cockpit-comment-field">
                        {pendingPin ? (
                          <span className="cockpit-pin-chip">
                            <MapPin size={13} fill="currentColor" />
                            Frame pin
                          </span>
                        ) : null}
                        <input
                          ref={commentInputRef}
                          value={commentBody}
                          onChange={(event) => setCommentBody(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void submitComment();
                          }}
                          placeholder={pendingPin ? "Describe what should change at this frame" : "Add a timecoded comment"}
                          aria-label="Comment"
                        />
                      </div>
                      <button className="cockpit-timecode" type="button" onClick={() => seekTo(currentTime)}>
                        {formatClock(pendingPin?.timeSeconds ?? currentTime)}
                      </button>
                      <button className="cockpit-add-comment" type="button" onClick={() => void submitComment()} disabled={!commentBody.trim() || commentSubmitting}>
                        {commentSubmitting ? "Saving" : "Add comment"}
                      </button>
                    </div>
                  </section>
                ) : (
                  <EmptyState title="No review media" body="Upload a video to begin the review." />
                )}

                {activeAsset ? (
                  <div className={styles.timelineDisclosure}>
                    <button
                      className={styles.timelineToggle}
                      type="button"
                      onClick={() => setTimelineOpen((open) => !open)}
                      aria-expanded={timelineOpen}
                      aria-controls={`cockpit-review-timeline-${project.id}`}
                    >
                      <History size={16} aria-hidden="true" />
                      <span>Timeline</span>
                      <small>{comments.length} {comments.length === 1 ? "comment" : "comments"}</small>
                      <ChevronDown size={16} aria-hidden="true" />
                    </button>
                    {timelineOpen ? (
                      <div id={`cockpit-review-timeline-${project.id}`}>
                        <CockpitReviewTimeline
                          durationSeconds={previewDuration}
                          currentTimeSeconds={currentTime}
                          sourceMedia={[{
                            id: activeAsset.id,
                            label: activeAsset.title,
                            startSeconds: 0,
                            endSeconds: previewDuration,
                          }]}
                          showAnalysisLanes
                          audioLaneLabel={demoMode ? "Demo waveform queued" : "Waveform pending"}
                          titleLaneLabel={demoMode ? "Demo title pass queued" : "Title pass pending"}
                          comments={comments.map((comment) => ({
                            id: comment.id,
                            timeSeconds: comment.time_seconds,
                            label: comment.body,
                            status: comment.status,
                          }))}
                          cutDecisions={cutMarkers.map((marker) => ({
                            id: marker.id,
                            timeSeconds: marker.time_seconds,
                            status: "proposed" as const,
                          }))}
                          onSeek={seekTo}
                          onMarkerActivate={(marker) => seekTo(marker.timeSeconds)}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {demoMode && reviewViewActive ? (
                  <div className={styles.reviewArchive}>
                    <ProjectSourceArchive projectId={project.id} />
                  </div>
                ) : null}

                {activeAsset && !reviewViewActive ? (
                  <div className="cockpit-mobile-review-strip" aria-label="Mobile review tools">
                    <button
                      type="button"
                      onClick={() => {
                        selectDockTab("review");
                        setMobileDockOpen(true);
                      }}
                    >
                      <MessageSquareText size={15} />
                      <span>Comments</span>
                    </button>
                    {contextualShareAllowed ? (
                      <button type="button" onClick={() => setShareOpen(true)} disabled={!canShare}>
                        <Share2 size={15} />
                        <span>Share</span>
                      </button>
                    ) : null}
                  </div>
                ) : null}

              </div>

              {dockVisible ? (
                <aside
                  id={`cockpit-review-details-${project.id}`}
                  className={`cockpit-detail-rail ${styles.operatorDock}`}
                >
                  <CockpitDock
                    idPrefix={project.id}
                    open={dockVisible}
                    mobileModal={compactViewport}
                    activeTab={effectiveDockTab}
                    reviewCount={comments.filter((comment) => comment.status === "open").length}
                    versionCount={activeAsset?.version_count ?? 0}
                    onTabChange={selectDockTab}
                    onClose={closeOperatorDock}
                  >
                    {!activeAsset ? (
                      <div className={styles.emptyDock}>
                        <Upload size={22} />
                        <strong>No media yet</strong>
                        <p>Upload the first file to start review, comments, versions, and approvals.</p>
                        <button className="cockpit-rail-primary" type="button" onClick={onUpload} disabled={!canUpload}>
                          <Upload size={14} /> Upload media
                        </button>
                      </div>
                    ) : effectiveDockTab === "review" ? (
                      <div className={styles.dockStack}>
                        <section className={styles.dockSection}>
                          <h2>{versionScopedReview ? "Review context" : "Review status"}</h2>
                          {versionScopedReview ? (
                            <>
                              <p className="cockpit-review-status"><i /> {requestedReviewVersionUnavailable ? "Version unavailable" : historicalReviewLabel}</p>
                              <p className="cockpit-rail-empty">
                                This cut keeps its own notes and markers. Current approval and share state are not applied here; new share links use the latest cut.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="cockpit-review-status"><i /> {formatAssetStatus(activeAsset.status)}</p>
                              {approvalStages.length > 0 ? (
                            <>
                              <div className="cockpit-progress">
                                <span
                                  style={{
                                    width: `${reviewerSlotCount
                                      ? (approvedReviewerCount / reviewerSlotCount) * 100
                                      : 0}%`,
                                  }}
                                />
                              </div>
                              <div className="cockpit-progress-copy">
                                <strong>{approvedStageCount} of {approvalStages.length} steps approved</strong>
                                <span>{approvedReviewerCount}/{reviewerSlotCount} reviewers</span>
                              </div>
                              {approvedStageCount === approvalStages.length ? (
                                <button
                                  className="cockpit-rail-primary"
                                  type="button"
                                  onClick={() => handleLifecycleOpenChange(true)}
                                >
                                  Advance stage
                                </button>
                              ) : (
                                <button
                                  className="cockpit-rail-primary"
                                  type="button"
                                  onClick={openReviewCockpit}
                                >
                                  View review
                                </button>
                              )}
                            </>
                              ) : (
                            <>
                              <p className="cockpit-rail-empty">No approval workflow has been requested.</p>
                              <button className="cockpit-rail-secondary" type="button" onClick={() => setShareOpen(true)} disabled={!canShare}>
                                Start review
                              </button>
                            </>
                              )}
                            </>
                          )}
                        </section>

                        <section className={styles.dockSection}>
                          <header><h2>Comments</h2><button type="button" onClick={() => selectSection("reviews")}>View all</button></header>
                          <div className="cockpit-comment-tabs">
                            <button type="button" className={commentStatus === "open" ? "active" : ""} onClick={() => setCommentStatus("open")}>Open ({comments.filter((comment) => comment.status === "open").length})</button>
                            <button type="button" className={commentStatus === "resolved" ? "active" : ""} onClick={() => setCommentStatus("resolved")}>Resolved ({comments.filter((comment) => comment.status === "resolved").length})</button>
                          </div>
                          <div className="cockpit-comment-list">
                            {visibleComments.slice(0, 4).map((comment) => {
                              const expanded = expandedCommentIds.has(comment.id);
                              const clampable = comment.body.length > 140;
                              return (
                                <article key={comment.id}>
                                  <button type="button" onClick={() => seekTo(comment.time_seconds)}>{formatShortClock(comment.time_seconds)}</button>
                                  <div>
                                    <strong>{comment.author_name}</strong>
                                    <p className={expanded ? undefined : "cockpit-comment-clamped"}>{comment.body}</p>
                                    {clampable || expanded ? (
                                      <button
                                        type="button"
                                        className="cockpit-comment-expand"
                                        aria-expanded={expanded}
                                        onClick={() =>
                                          setExpandedCommentIds((current) => {
                                            const next = new Set(current);
                                            if (next.has(comment.id)) next.delete(comment.id);
                                            else next.add(comment.id);
                                            return next;
                                          })
                                        }
                                      >
                                        {expanded ? "Show less" : "Read full comment"}
                                      </button>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    className="cockpit-resolve"
                                    onClick={() => void toggleCommentStatus(comment)}
                                    title={comment.status === "open" ? "Resolve comment" : "Reopen comment"}
                                    aria-label={comment.status === "open" ? "Resolve comment" : "Reopen comment"}
                                  >
                                    {comment.status === "open" ? <Circle size={14} /> : <Check size={14} />}
                                  </button>
                                </article>
                              );
                            })}
                            {visibleComments.length === 0 ? <p className="cockpit-rail-empty">No {commentStatus} comments.</p> : null}
                          </div>
                          <button
                            className="cockpit-rail-secondary"
                            type="button"
                            onClick={() => {
                              setMobileDockOpen(false);
                              window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".cockpit-comment-composer input")?.focus());
                            }}
                          >
                            Add comment
                          </button>
                        </section>

                        <section className={styles.dockSection}>
                          <header><h2>Approvals</h2><button type="button" onClick={() => selectSection("approvals")}>View all</button></header>
                          {approvalStages.length > 0 ? approvalStages.map((stage, index) => {
                            const approved = stage.approved_reviewer_names.length;
                            const total = stage.reviewer_names.length;
                            return (
                              <article className="cockpit-approval-stage" key={stage.id}>
                                <strong>Step {index + 1}: <span>{stage.name}</span></strong>
                                <div><span>{stage.status.replaceAll("_", " ")}</span><small>{total ? `${approved}/${total}` : "Unassigned"}</small></div>
                                <div className="cockpit-reviewer-row">
                                  <div>{stage.reviewer_names.map((name) => <i key={name}>{avatarInitials(name)}</i>)}</div>
                                  <div className="cockpit-progress"><span style={{ width: `${total ? (approved / total) * 100 : 0}%` }} /></div>
                                </div>
                                {demoMode && stage.status !== "approved" ? <button type="button" onClick={() => approveDemoStage(stage.id)}>Record approval</button> : null}
                              </article>
                            );
                          }) : <p className="cockpit-rail-empty">No approval stages for this asset.</p>}
                        </section>

                        <section className={styles.dockSection}>
                          <header><h2>Recent assets</h2><button type="button" onClick={() => selectSection("media")}>View all</button></header>
                          <div className="cockpit-recent-assets">
                            {assets.slice(0, 5).map((asset) => (
                              <button
                                key={asset.id}
                                type="button"
                                className={asset.id === activeAsset?.id ? "active" : ""}
                                onClick={() => selectAsset(asset)}
                                title={`${asset.title} — ${formatAssetStatus(asset.status)}`}
                              >
                                <ProjectAssetThumbnail asset={asset} demoMode={demoMode} />
                                <span>
                                  <strong>{asset.title}</strong>
                                  <small>{formatAssetStatus(asset.status)}</small>
                                </span>
                              </button>
                            ))}
                            {assets.length === 0 ? <p className="cockpit-rail-empty">No media in this project yet.</p> : null}
                          </div>
                        </section>

                        <section className={styles.dockSection}>
                          <header><h2>Transcript and cleanup</h2><button type="button" onClick={() => selectSection("metadata")}>Details</button></header>
                          <div className="cockpit-ai-review">
                            <article>
                              <strong>Transcript</strong>
                              <span>{sourceBackedActive
                                ? "Transcript has not been processed for this imported source"
                                : demoMode
                                  ? "No transcript is available in this local preview"
                                  : "Waiting for transcript job"}</span>
                            </article>
                            <article>
                              <strong>AI cleanup</strong>
                              <span>Suggestions appear after analysis finishes</span>
                            </article>
                            <ul>
                              <li>Filler words: unavailable</li>
                              <li>Long silences: unavailable</li>
                              <li>Pacing pauses: unavailable</li>
                            </ul>
                          </div>
                        </section>

                        {!versionScopedReview ? (
                          <section className={styles.dockSection}>
                            <header><h2>Share readiness</h2><button type="button" onClick={() => selectSection("reviews")}>Links</button></header>
                            <dl className="cockpit-details">
                              <div><dt>Asset link</dt><dd>{projectLinks.some((link) => link.is_active) ? "Active" : "Not created"}</dd></div>
                              <div><dt>Batch share</dt><dd>{assets.length > 1 ? `${assets.length} assets ready` : "Single asset"}</dd></div>
                              <div><dt>Downloads</dt><dd>{workspaceRole === "viewer" ? "Restricted" : "Permission aware"}</dd></div>
                            </dl>
                            <button className="cockpit-rail-secondary" type="button" onClick={() => setShareOpen(true)} disabled={!canShare}>
                              Open share controls
                            </button>
                          </section>
                        ) : null}
                      </div>
                    ) : effectiveDockTab === "versions" ? (
                      <VersionCompareDock
                        key={activeAsset.id}
                        activeAsset={activeAsset}
                        assets={assets}
                        demoMode={demoMode}
                        onSelectAsset={selectAsset}
                        onOpenVersionHistory={() => selectSection("versions")}
                      />
                    ) : effectiveDockTab === "inspector" ? (
                      <div className={styles.dockStack}>
                        <section className={styles.dockSection}>
                          <h2>Media inspector</h2>
                          <dl className="cockpit-details">
                            <div><dt>File name</dt><dd>{assetFileName(activeAsset)}</dd></div>
                            <div><dt>Duration</dt><dd>{formatShortClock(activeAsset.duration_seconds ?? 0)}</dd></div>
                            <div><dt>Resolution</dt><dd>{mediaResolutionLabel(activeAsset, demoMode)}</dd></div>
                            <div><dt>Frame rate</dt><dd>{mediaFrameRateLabel(activeAsset, demoMode)}</dd></div>
                            <div><dt>Versions</dt><dd>{activeAsset.version_count ?? (demoMode ? 1 : "Not indexed")}</dd></div>
                            <div><dt>Owner</dt><dd>Content Co-op</dd></div>
                          </dl>
                          <button className="cockpit-rail-secondary" type="button" onClick={() => selectSection("metadata")}>View all metadata</button>
                        </section>
                        <section className={styles.dockSection}>
                          <h2>Project authority</h2>
                          <dl className="cockpit-details">
                            <div><dt>Project</dt><dd>{project.name}</dd></div>
                            <div><dt>Review links</dt><dd>{projectLinks.filter((link) => link.is_active).length} active</dd></div>
                            <div><dt>Approval stages</dt><dd>{approvalStages.length}</dd></div>
                            <div><dt>Workspace role</dt><dd>{workspaceRole}</dd></div>
                          </dl>
                        </section>
                      </div>
                    ) : (
                      <section className={styles.dockSection}>
                        <header><h2>Project activity</h2><button type="button" onClick={() => router.push(demoMode ? "/activity?demo=1" : "/activity")}>View all</button></header>
                        <div className={styles.dockActivity}>
                          {projectActivity.slice(0, 8).map((item) => (
                            <article key={item.id}>
                              <span><Link2 size={14} /></span>
                              <div><strong>{item.actor_name} {formatActivity(item.action)}</strong><small>{item.details.asset_title ?? project.name}</small></div>
                              <time>{timeAgo(item.created_at)}</time>
                            </article>
                          ))}
                          {projectActivity.length === 0 ? <p className="cockpit-rail-empty">No project activity yet.</p> : null}
                        </div>
                      </section>
                    )}
                  </CockpitDock>
                </aside>
              ) : null}
            </div>
          </>
        ) : (
          <section className="cockpit-secondary-view">
            {activeSection === "creative" ? (
              <CreativeSection projectId={project.id} demoMode={demoMode} onNotice={setToast} />
            ) : null}

            {activeSection === "proposal" ? (
              <ProposalSection projectId={project.id} demoMode={demoMode} onNotice={setToast} />
            ) : null}

            {activeSection === "plan" ? (
              <PlanSection projectId={project.id} demoMode={demoMode} onNotice={setToast} />
            ) : null}

            {activeSection === "media" ? (
              <>
                <header><div><h2>Project media</h2><p>Versions, status, comments, and review readiness in one place.</p></div><button type="button" onClick={onUpload}><Upload size={16} /> Upload media</button></header>
                <div className="cockpit-media-grid">
                  {assets.map((asset) => (
                    <article key={asset.id}>
                      <button type="button" className="cockpit-media-thumb" onClick={() => { selectAsset(asset); selectSection("overview"); }}>
                        <ProjectAssetThumbnail
                          asset={asset}
                          demoMode={demoMode}
                          alt={asset.title}
                          fill
                          showFallback={false}
                        />
                        <Play size={24} fill="currentColor" />
                      </button>
                      <div><strong>{asset.title}</strong><span>{versionLabel(asset, demoMode)}</span><small>{asset.comment_count ?? 0} comments</small></div>
                    </article>
                  ))}
                  {assets.length === 0 ? <EmptyState title="No project media" body="Upload a file to begin this project." /> : null}
                </div>
              </>
            ) : null}

            {activeSection === "sequences" ? (
              <SequencesSection projectId={project.id} demoMode={demoMode} onNotice={setToast} />
            ) : null}

            {activeSection === "reviews" ? (
              <>
                <header><div><h2>Review links</h2><p>Active and revocable links for client review and delivery.</p></div><button type="button" onClick={activeAsset ? () => setShareOpen(true) : onUpload} disabled={Boolean(activeAsset && (!contextualShareAllowed || !canShare))}>{activeAsset ? <Share2 size={16} /> : <Upload size={16} />} {activeAsset ? "Create link" : "Upload media"}</button></header>
                <div className="cockpit-table-list">
                  {projectLinks.map((link) => (
                    <article key={link.id}>
                      <span className="cockpit-list-icon"><Link2 size={18} /></span>
                      <div>
                        <strong>{link.message}</strong>
                        <small>
                          {link.reviewer_email ?? "Anyone with the link"} · {link.is_active ? "Active" : "Revoked"} · {link.notification_status === "dry_run" ? "Delivery dry run" : "Links only"}
                        </small>
                      </div>
                      <button type="button" onClick={() => void setShareLinkActive(link)} disabled={!demoMode && !link.is_active}>
                        {link.is_active ? "Revoke" : demoMode ? "Restore" : "Revoked"}
                      </button>
                      <Link href={link.public_url} aria-disabled={!link.is_active}>
                        Open
                      </Link>
                    </article>
                  ))}
                  {projectLinks.length === 0 ? <EmptyState title="No review links" body="Create a permissioned link for this project." /> : null}
                </div>
                <ReviewConsolidationSection projectId={project.id} demoMode={demoMode} onNotice={setToast} />
                <DecisionLedgerSection projectId={project.id} demoMode={demoMode} onNotice={setToast} />
                <NotificationOutboxSection projectId={project.id} demoMode={demoMode} onNotice={setToast} />
              </>
            ) : null}

            {activeSection === "approvals" ? (
              <>
                <header><div><h2>Approval workflow</h2><p>Sequential review stages and accountable sign-off.</p></div></header>
                <div className="cockpit-table-list">
                  {approvalStages.map((stage, index) => <article key={stage.id}><span className="cockpit-list-icon"><CheckCircle2 size={18} /></span><div><strong>Step {index + 1}: {stage.name}</strong><small>{stage.reviewer_names.length ? `${stage.approved_reviewer_names.length}/${stage.reviewer_names.length} reviewers approved` : "Unassigned"}</small></div><span className={stage.status === "approved" ? "status-active" : "status-pending"}>{stage.status.replaceAll("_", " ")}</span>{stage.status !== "approved" && demoMode ? <button type="button" onClick={() => approveDemoStage(stage.id)}>Approve</button> : stage.status === "approved" ? <Check size={17} /> : null}</article>)}
                  {approvalStages.length === 0 ? <EmptyState title="No approval workflow" body="Create a review link with approval access to start one." /> : null}
                </div>
              </>
            ) : null}

            {activeSection === "delivery" ? (
              <DeliverySection projectId={project.id} demoMode={demoMode} onNotice={setToast} />
            ) : null}

            {activeSection === "tasks" ? (
              <>
                <header><div><h2>Tasks</h2><p>Actionable work pulled from review feedback.</p></div></header>
                <div className="cockpit-task-list">
                  {projectTasks.map((task) => <label key={task.id}><input type="checkbox" checked={task.completed} disabled={!demoMode} onChange={() => { if (demoMode) toggleDemoTask(task.id); }} /><span><strong>{task.title}</strong><small>{task.assignee_name} · {task.due_label}</small></span><Clock3 size={17} /></label>)}
                  {projectTasks.length === 0 ? <EmptyState title="No tasks" body="Tasks created from review feedback will appear here." /> : null}
                </div>
              </>
            ) : null}

            {activeSection === "versions" ? (
              <>
                <header>
                  <div>
                    <h2>Version history</h2>
                    <p>{demoMode ? "Known imported bases and browser-local cuts. Existing links stay pinned to their cut." : "All current project deliverables and revision depth."}</p>
                  </div>
                  {demoMode && activeAsset && revisionableActiveAsset && onUploadRevision ? (
                    <button type="button" onClick={() => onUploadRevision(activeAsset.id)} disabled={uploading || !canUpload}>
                      <Upload size={16} /> Upload new version
                    </button>
                  ) : null}
                </header>
                <div className="cockpit-table-list">
                  {demoMode ? demoVersionHistory.flatMap(({ asset, versions }) => {
                    if (versions.length === 0) {
                      return [
                        <article key={asset.id}>
                          <span className="cockpit-list-icon"><History size={18} /></span>
                          <div><strong>{asset.title}</strong><small>No browser-local revision history is established for this media.</small></div>
                          <span className="status-version">Unversioned</span>
                          <button type="button" onClick={() => { selectAsset(asset); selectSection("overview"); }}>Review current</button>
                        </article>,
                      ];
                    }
                    return versions.map((knownVersion) => (
                      <article key={knownVersion.id}>
                        <span className="cockpit-list-icon"><History size={18} /></span>
                        <div>
                          <strong>{asset.title}</strong>
                          <small>
                            {knownVersion.source_label === "Imported file"
                              ? "Imported file · measured source base"
                              : `V${knownVersion.version_number} · ${knownVersion.file_name ?? "Browser-local cut"}`}
                            {knownVersion.is_current ? " · Current" : " · Pinned review history remains on this cut"}
                          </small>
                        </div>
                        <span className="status-version">{knownVersion.source_label === "Imported file" ? "Imported file" : `V${knownVersion.version_number}`}</span>
                        {knownVersion.is_current ? (
                          <button type="button" onClick={() => { selectAsset(asset); selectSection("overview"); }}>Review current</button>
                        ) : <span aria-label="Pinned historical version">Pinned</span>}
                      </article>
                    ));
                  }) : activeAsset && liveVersionAssetId === activeAsset.id ? liveVersions.map((version) => (
                    <article key={version.id}>
                      <span className="cockpit-list-icon"><History size={18} /></span>
                      <div><strong>{activeAsset.title}</strong><small>V{version.version_number}{version.is_current ? " · Current" : " · Historical cut"} · Updated {timeAgo(version.created_at)}</small></div>
                      <span className="status-version">V{version.version_number}</span>
                      <button type="button" onClick={() => { selectLiveReviewVersion(version.id); selectSection("overview"); }}>Review</button>
                    </article>
                  )) : liveVersionsLoading ? <EmptyState title="Loading versions" body="Checking the media versions you can review." /> : <EmptyState title="Version history unavailable" body="This media did not return a reviewable version." />}
                  {assets.length === 0 ? <EmptyState title="No versions" body="The first uploaded file will create version 1." /> : null}
                </div>
              </>
            ) : null}

            {activeSection === "metadata" ? (
              <>
                <header><div><h2>Project metadata</h2><p>Delivery, ownership, technical, and brand details.</p></div></header>
                <div className="cockpit-metadata-grid">
                  <section><h3>Project</h3><dl><div><dt>Name</dt><dd>{project.name}</dd></div><div><dt>Status</dt><dd>Active</dd></div><div><dt>Owner</dt><dd>Content Co-op</dd></div><div><dt>Storage</dt><dd>CCNAS media authority</dd></div></dl></section>
                  <section><h3>Active media</h3>{activeAsset ? <dl><div><dt>Title</dt><dd>{activeAsset.title}</dd></div><div><dt>Duration</dt><dd>{formatShortClock(activeAsset.duration_seconds ?? 0)}</dd></div><div><dt>Resolution</dt><dd>{mediaResolutionLabel(activeAsset, demoMode)}</dd></div><div><dt>Frame rate</dt><dd>{mediaFrameRateLabel(activeAsset, demoMode)}</dd></div></dl> : <p className="cockpit-rail-empty">No media has been uploaded.</p>}</section>
                  <section><h3>Review authority</h3><dl><div><dt>Open comments</dt><dd>{comments.filter((comment) => comment.status === "open").length}</dd></div><div><dt>Approval stages</dt><dd>{approvalStages.length}</dd></div><div><dt>Active links</dt><dd>{projectLinks.filter((link) => link.is_active).length}</dd></div><div><dt>Brand</dt><dd>{demoMode ? workspace.settings.brand.displayName : "Content Co-op"}</dd></div></dl></section>
                </div>
              </>
            ) : null}
          </section>
        )}
      </main>

      {commandOpen ? (
        <CommandPalette
          open
          items={commandItems}
          onClose={() => setCommandOpen(false)}
          placeholder="Search project commands and media"
          returnFocusRef={commandButtonRef}
        />
      ) : null}

      {shareOpen && activeAsset ? (
        demoMode ? (
          <DemoShareModal
            assets={assets}
            initialSelectedAssetIds={[activeAsset.id]}
            onClose={() => setShareOpen(false)}
            onShared={(input) => {
              const links = createDemoShareLinks(input);
              setToast(`${links.length} review ${links.length === 1 ? "link" : "links"} created in Reviews`);
              return links;
            }}
          />
        ) : (
          <ShareModal
            open
            assetId={activeAsset.id}
            assetTitle={activeAsset.title}
            assetStatus={activeAsset.status}
            onClose={() => {
              setShareOpen(false);
              void loadLiveAssetData();
            }}
          />
        )
      ) : null}

      {uploadStatus ? (
        <div className="cockpit-upload-overlay" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cockpit-upload-title"
            aria-live="polite"
            data-state={uploadStatus.phase}
          >
            {uploadTerminal && onUploadDismiss ? (
              <button
                type="button"
                className="cockpit-upload-close"
                onClick={onUploadDismiss}
                aria-label="Dismiss upload status"
              >
                <X size={15} />
              </button>
            ) : null}
            <div className="cockpit-upload-icon">
              {uploadStatus.phase === "complete" ? (
                <CheckCircle2 size={28} />
              ) : uploadStatus.phase === "error" ? (
                <AlertTriangle size={28} />
              ) : (
                <LoaderCircle size={28} />
              )}
            </div>
            <p>{uploadStatus.mode === "demo" ? "Local preview ingest" : "Media ingest"}</p>
            <h2 id="cockpit-upload-title">
              {uploadStatus.phase === "complete" ? "Ready for review" : uploadStatus.phase === "error" ? "Upload needs attention" : "Preparing your media"}
            </h2>
            <strong title={uploadStatus.fileName}>{uploadStatus.fileName}</strong>
            <div className="cockpit-upload-progress" aria-label={`Upload ${uploadStatus.progress}% complete`}>
              <span style={{ width: `${uploadStatus.progress}%` }} />
            </div>
            <div className="cockpit-upload-progress-copy">
              <span>{uploadStatus.message ?? "Keep this window open while Co‑VideoPro prepares the review asset."}</span>
              <b>{uploadStatus.progress}%</b>
                </div>
                <ol className="cockpit-upload-steps">
                  {uploadSteps.map(([phase, label], index, all) => {
                    const currentIndex = all.findIndex(([candidate]) => candidate === uploadStatus.phase);
                const complete = uploadStatus.phase === "complete" || currentIndex > index;
                const current = currentIndex === index;
                return (
                  <li key={phase} className={complete ? "complete" : current ? "current" : ""}>
                    <i>{complete ? <Check size={12} /> : index + 1}</i>
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>
            <footer>
              <span>{uploadStatus.completed} of {uploadStatus.total} file{uploadStatus.total === 1 ? "" : "s"} prepared</span>
              {uploadStatus.mode === "demo" ? (
                <small>
                      {uploadStatus.phase === "complete"
                        ? uploadStatus.kind === "revision"
                          ? `V${uploadStatus.versionNumber ?? "?"} is ready. Existing links, comments, and approvals remain pinned to their earlier cut.`
                          : "A new browser-local deliverable is ready in Project Browser and Version history."
                        : uploadStatus.phase === "error"
                          ? uploadStatus.completed > 0
                            ? `${uploadStatus.completed} file${uploadStatus.completed === 1 ? " was" : "s were"} stored before this upload stopped. Retry the remaining media from Upload.`
                            : "No version was added. Retry from Upload when the issue is fixed."
                          : "Preview mode uses browser-local media storage when available; production uses the configured CCNAS or cloud media authority."}
                </small>
              ) : null}
              {uploadTerminal && onUploadDismiss ? (
                <button type="button" onClick={onUploadDismiss}>
                  {uploadStatus.phase === "complete"
                    ? uploadStatus.kind === "revision"
                      ? `Review V${uploadStatus.versionNumber ?? "?"}`
                      : "Review uploaded media"
                    : "Close upload status"}
                </button>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}

      {toast ? (
        <div className="cockpit-toast" role="status">
          <Check size={16} /> {toast}
          <button type="button" onClick={() => setToast("")} aria-label="Dismiss notification"><X size={14} /></button>
        </div>
      ) : null}
    </div>
  );
}
