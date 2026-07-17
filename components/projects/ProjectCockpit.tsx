"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
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
  Cpu,
  Gauge,
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
  Save,
  Search,
  ScreenShare,
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
import { roleCan, type WorkspaceRole } from "@/components/navigation/navigation-model";
import { useMediaQuery, useOnlineStatus } from "@/components/navigation/useEnvironmentStatus";
import CockpitDock from "@/components/cockpit/CockpitDock";
import CoProduceLifecycleDrawer, {
  type CoProduceLifecycleData,
  type CoProduceLifecycleDestination,
} from "@/components/cockpit/CoProduceLifecycleDrawer";
import CockpitOverviewDrawer from "@/components/cockpit/CockpitOverviewDrawer";
import CockpitReviewTimeline from "@/components/cockpit/CockpitReviewTimeline";
import {
  CockpitMobileNavigation,
  CockpitProjectNavigation,
  CockpitProjectNavigationDrawer,
} from "@/components/cockpit/CockpitNavigation";
import CockpitToolbar from "@/components/cockpit/CockpitToolbar";
import VersionCompareDock from "@/components/cockpit/VersionCompareDock";
import { COCKPIT_NAVIGATION, type CockpitSection } from "@/components/cockpit/cockpit-navigation";
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
import { PROJECT_STAGE_META, type ProjectStage } from "@/lib/covideopro/record.ts";
import {
  CreativeSection,
  DeliverySection,
  NotificationOutboxSection,
  PlanSection,
  ProposalSection,
  ReviewConsolidationSection,
  SequencesSection,
} from "@/components/projects/ProjectRecordSections";
import { useDemoMediaObjectUrl } from "@/lib/demo/media-blob-store";
import { normalizeReviewSeekStep, normalizeReviewShortcutKey, shouldIgnoreReviewShortcut } from "@/lib/review/player-policy";
import { buildSurfaceUrl, getBrowserClientSiteUrl } from "@/lib/surface-origins";
import type { EditDecision } from "@/lib/types/codeliver";
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
  onUploadDismiss?: () => void;
}

type CockpitApprovalStage = Omit<DemoApprovalStage, "status"> & { status: string };

export interface CockpitUploadStatus {
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

function isCockpitSection(value: string | null): value is CockpitSection {
  return COCKPIT_NAVIGATION.some((item) => item.id === value);
}

function formatClock(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const whole = Math.floor(safeSeconds);
  const frames = Math.floor((safeSeconds - whole) * 24);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return [hours, minutes, secs, frames].map((part) => String(part).padStart(2, "0")).join(":");
}

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
  const version = asset.version_count ?? (demoMode ? 1 : null);
  return version ? `Version ${version}` : "Version not indexed";
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
  clientOrigin: string,
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
    is_active: record.authority_status === "active",
    public_url: buildSurfaceUrl(clientOrigin, `/review/${encodeURIComponent(token)}`),
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
  const notificationRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const requestedAssetId = searchParams.get("asset");
  const reviewViewRequested = searchParams.get("view") === "review";
  const [reviewViewActive, setReviewViewActive] = useState(reviewViewRequested);
  const [activeSection, setActiveSection] = useState<CockpitSection>(() => {
    const requestedSection = searchParams.get("surface");
    return isCockpitSection(requestedSection) ? requestedSection : "overview";
  });
  const [overviewOpen, setOverviewOpen] = useState(false);
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
  const [isMuted, setIsMuted] = useState(false);
  const [commentBody, setCommentBody] = useState("");
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileDockOpen, setMobileDockOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const commandButtonRef = useRef<HTMLButtonElement>(null);
  const liveAssetRequestRef = useRef(0);
  const [toast, setToast] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [nativeDuration, setNativeDuration] = useState(0);
  const [liveComments, setLiveComments] = useState<DemoReviewComment[]>([]);
  const [liveCutMarkers, setLiveCutMarkers] = useState<DemoReviewCutMarker[]>([]);
  const [liveAssetDataId, setLiveAssetDataId] = useState<string | null>(null);
  const [liveTasks] = useState<DemoProjectTask[]>([]);
  const [liveActivity, setLiveActivity] = useState<DemoActivityItem[]>([]);
  const [systemsReadiness, setSystemsReadiness] = useState<CockpitReadinessState>(DEFAULT_COCKPIT_READINESS);

  useEffect(() => {
    const requestedSection = searchParams.get("surface");
    setActiveSection(isCockpitSection(requestedSection) ? requestedSection : "overview");
    setReviewViewActive(searchParams.get("view") === "review");
  }, [searchParams]);

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
  const activeAsset = assets.find((asset) => asset.id === activeAssetId) ?? assets[0];
  const demoMediaUrl = useDemoMediaObjectUrl(activeAsset?.id ?? null);
  const activeMediaUrl = demoMode
    ? demoMediaUrl ?? "/demo/ica-ceo-preview.mp4"
    : activeAsset?.file_url ?? null;
  const activePosterUrl = activeAsset?.thumbnail_url ?? (demoMode ? "/demo/ceraweek-speaker.jpg" : null);
  const duration = Math.max(1, nativeDuration || activeAsset?.duration_seconds || (demoMode ? 5 : 1));
  const previewDuration = demoMode
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
    : reviewViewActive || layout.dockOpen;
  const canUpload = roleCan(workspaceRole, "media:write");
  const canShare = roleCan(workspaceRole, "reviews:comment");

  const comments = demoMode
    ? workspace.reviewComments.filter((comment) => comment.asset_id === activeAsset?.id)
    : liveAssetDataId === activeAsset?.id ? liveComments : [];
  const cutMarkers = demoMode
    ? workspace.reviewCutMarkers.filter((marker) => marker.asset_id === activeAsset?.id)
    : liveAssetDataId === activeAsset?.id ? liveCutMarkers : [];
  const visibleComments = comments.filter((comment) => comment.status === commentStatus);
  const projectTasks = demoMode
    ? workspace.tasks.filter((task) => task.project_id === project.id)
    : liveTasks;
  const approvalStages: CockpitApprovalStage[] = demoMode
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
  const projectLinks = demoMode
    ? workspace.shareLinks.filter((link) =>
        link.asset_ids.some((assetId) => assets.some((asset) => asset.id === assetId)),
      )
    : liveAssetDataId === activeAsset?.id ? liveShareLinks : [];
  const inReviewCount = assets.filter((asset) =>
    ["in_review", "needs_changes"].includes(asset.status),
  ).length;
  const approvedCount = assets.filter((asset) =>
    ["approved", "final"].includes(asset.status),
  ).length;
  const commentCount = assets.reduce(
    (sum, asset) => sum + (asset.id === activeAsset?.id ? comments.length : asset.comment_count ?? 0),
    0,
  );
  const dueTodayCount = projectTasks.filter((task) => !task.completed && task.due_label === "Today").length;
  const overviewMetrics = [
    { label: "In review", value: inReviewCount, unit: "Items" },
    { label: "Approved", value: approvedCount, unit: "Items" },
    {
      label: "Due today",
      value: demoMode ? dueTodayCount : "—",
      unit: demoMode ? "Tasks" : "Not indexed",
    },
    { label: "Total comments", value: commentCount, unit: "Comments" },
  ];
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
      value: formatAssetStatus(activeAsset.status),
      detail: versionLabel(activeAsset, demoMode),
      icon: Circle,
      tone: activeAsset.status === "approved" || activeAsset.status === "final" ? "approved" : "active",
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
      value: approvalStages.length > 0 ? `${approvedStageCount}/${approvalStages.length} stages` : "No workflow",
      detail: reviewerSlotCount > 0 ? `${approvedReviewerCount}/${reviewerSlotCount} reviewers` : "Approval link pending",
      icon: CheckCircle2,
      tone: approvalStages.length > 0 && approvedStageCount === approvalStages.length ? "approved" : "neutral",
    },
    {
      id: "transcript",
      label: "Transcript",
      value: demoMode ? "Not processed" : liveAssetDataId === activeAsset.id ? "Queued" : "Loading",
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
  const systemPostureItems = activeAsset ? [
    {
      id: "network",
      label: "Network",
      value: online ? "Browser online only" : "Browser offline",
      detail: online ? "System health checked separately" : "Review controls remain local",
      icon: Gauge,
      tone: online ? "neutral" : "attention",
    },
    {
      id: "live-room",
      label: "Collaboration",
      value: `${collaborators.length} listed`,
      detail: "presence unverified",
      icon: Circle,
      tone: "neutral",
    },
    {
      id: "media-worker",
      label: "Media worker",
      value: demoMode ? "Not used in demo" : "Credential gated",
      detail: demoMode ? "FFmpeg backend not claimed" : "FFmpeg worker requires service role",
      icon: Cpu,
      tone: "neutral",
    },
  ] : [];
  const liveSessionItems = activeAsset ? [
    {
      id: "presence",
      label: "Presence",
      value: `${collaborators.length} listed`,
      detail: "Roster only; realtime unverified",
      icon: Circle,
      tone: "neutral",
    },
    {
      id: "quality",
      label: "Quality",
      value: online ? "Browser online" : "Browser offline",
      detail: online ? systemsReadiness.label : "Reconnect before live sync",
      icon: Gauge,
      tone: online && systemsReadiness.tone === "healthy" ? "healthy" : online ? "neutral" : "attention",
    },
    {
      id: "screenshare",
      label: "Screen share",
      value: "Planned",
      detail: "Disabled until session contract",
      icon: ScreenShare,
      tone: "planned",
    },
    {
      id: "authority",
      label: "Authority",
      value: "Comments are record",
      detail: "Presence is ephemeral",
      icon: MessageSquareText,
      tone: "neutral",
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

  const loadLiveAssetData = useCallback(async () => {
    if (demoMode || !activeAsset) {
      liveAssetRequestRef.current += 1;
      setLiveAssetDataId(null);
      setLiveComments([]);
      setLiveCutMarkers([]);
      setLiveShareLinks([]);
      return;
    }

    const assetId = activeAsset.id;
    const requestId = liveAssetRequestRef.current + 1;
    liveAssetRequestRef.current = requestId;
    setLiveAssetDataId(null);
    setLiveComments([]);
    setLiveCutMarkers([]);
    setLiveShareLinks([]);

    const [commentsResponse, decisionsResponse, linksResponse] = await Promise.all([
      fetch(`/api/assets/${assetId}/comments`, { cache: "no-store" }),
      fetch(`/api/assets/${assetId}/edit-decisions`, { cache: "no-store" }),
      fetch(`/api/assets/${assetId}/share`, { cache: "no-store" }),
    ]);
    const [commentsPayload, decisionsPayload, linksPayload] = await Promise.all([
      commentsResponse.ok ? commentsResponse.json() : Promise.resolve({ items: [] }),
      decisionsResponse.ok ? decisionsResponse.json() : Promise.resolve({ items: [] }),
      linksResponse.ok ? linksResponse.json() : Promise.resolve({ items: [] }),
    ]);
    if (liveAssetRequestRef.current !== requestId) return;

    const commentItems = Array.isArray(commentsPayload.items) ? commentsPayload.items : [];
    setLiveComments(
      commentItems.map((item: Record<string, unknown>) =>
        normalizeLiveComment(item, project.id, assetId),
      ),
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
          time_seconds: decision.start_seconds,
          created_at: decision.created_at,
        })),
    );

    const clientOrigin = getBrowserClientSiteUrl(window.location.origin);
    const linkItems = Array.isArray(linksPayload.items) ? linksPayload.items : [];
    setLiveShareLinks(
      linkItems.flatMap((item: Record<string, unknown>) => {
        const link = normalizeLiveShareLink(item, assetId, clientOrigin);
        return link ? [link] : [];
      }),
    );
    setLiveAssetDataId(assetId);
  }, [activeAsset, demoMode, project.id]);

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
    setOverviewOpen(false);
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
          return previewDuration;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [isPlaying, previewDuration, simulatedPlayback]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (notificationRef.current && !notificationRef.current.contains(target)) setNotificationsOpen(false);
      if (accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
        else toggleDock();
        return;
      }

      if (event.key !== "Escape") return;
      if (mobileNavOpen) setMobileNavOpen(false);
      else if (mobileDockOpen) setMobileDockOpen(false);
      else if (accountOpen) {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
      } else if (notificationsOpen) {
        setNotificationsOpen(false);
        notificationButtonRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    accountOpen,
    compactViewport,
    mobileDockOpen,
    mobileNavOpen,
    notificationsOpen,
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

  function handleAdvanceStage() {
    const result = advanceProjectStage(project.id);
    if (!result.ok) {
      setToast(result.reason);
      return;
    }
    const nextStage = workspace.projects.find((candidate) => candidate.id === project.id)?.stage;
    setToast(nextStage ? `Stage advanced to ${PROJECT_STAGE_META[nextStage].label}.` : "Stage advanced.");
  }

  function selectSection(section: CockpitSection) {
    if (reviewViewActive) setReviewViewActive(false);
    setLifecycleOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    if (section === "overview") params.delete("surface");
    else params.set("surface", section);
    const query = params.toString();
    router.push(`/projects/${project.id}${query ? `?${query}` : ""}`);
    if (section === "overview") {
      setActiveSection("overview");
      setOverviewOpen((open) => !open);
    } else {
      setOverviewOpen(false);
      setActiveSection(section);
    }
    setMobileNavOpen(false);
    setMobileDockOpen(false);
  }

  function handleLifecycleOpenChange(open: boolean) {
    setLifecycleOpen(open);
    if (!open) return;
    setOverviewOpen(false);
    setMobileNavOpen(false);
    setMobileDockOpen(false);
    setNotificationsOpen(false);
    setAccountOpen(false);
    setCommandOpen(false);
  }

  function handleLifecycleNavigate(destination: CoProduceLifecycleDestination) {
    const target = new URL(destination.href, window.location.origin);
    const surface = target.searchParams.get("surface");
    if (isCockpitSection(surface)) selectSection(surface);
  }

  function toggleProjectRail() {
    setLifecycleOpen(false);
    if (compactViewport) setMobileNavOpen((open) => !open);
    else toggleRail();
  }

  function toggleOperatorDock() {
    setOverviewOpen(false);
    setLifecycleOpen(false);
    if (activeSection !== "overview") {
      leaveReviewView();
      setActiveSection("overview");
      if (compactViewport) setMobileDockOpen(true);
      else if (!layout.dockOpen) toggleDock();
      return;
    }
    if (compactViewport) setMobileDockOpen((open) => !open);
    else if (reviewViewActive && !layout.dockOpen) leaveReviewView();
    else {
      leaveReviewView();
      toggleDock();
    }
  }

  function closeOperatorDock() {
    if (compactViewport) setMobileDockOpen(false);
    else if (reviewViewActive && !layout.dockOpen) leaveReviewView();
    else {
      leaveReviewView();
      toggleDock();
    }
  }

  function selectDockTab(tab: Parameters<typeof setDockTab>[0]) {
    leaveReviewView();
    setDockTab(tab);
    if (compactViewport) setMobileDockOpen(true);
  }

  function selectAsset(asset: MediaAsset) {
    liveAssetRequestRef.current += 1;
    setLiveAssetDataId(null);
    setLiveComments([]);
    setLiveCutMarkers([]);
    setLiveShareLinks([]);
    setActiveAssetId(asset.id);
    setCurrentTime(0);
    setNativeDuration(0);
    setIsPlaying(false);
    setSearchQuery("");
    if (typeof videoRef.current?.pause === "function") videoRef.current.pause();
    if (typeof videoRef.current?.load === "function") videoRef.current.load();
    setNativeVideoActive(false);
    setSimulatedPlayback(false);
    setPendingPin(null);
    setResumeAfterComment(false);
  }

  function openReviewCockpit() {
    if (!activeAsset) return;
    setLifecycleOpen(false);
    setActiveSection("overview");
    setReviewViewActive(true);
    setMode("review");
    setDockTab("review");
    if (compactViewport) setMobileDockOpen(false);
    else if (!layout.dockOpen) toggleDock();
    const params = new URLSearchParams();
    if (demoMode) params.set("demo", "1");
    params.set("asset", activeAsset.id);
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
    const video = videoRef.current;
    if (!video || typeof video.play !== "function" || typeof video.pause !== "function") {
      setSimulatedPlayback(true);
      setIsPlaying((playing) => !playing);
      return;
    }
    try {
      if (video.paused) {
        await video.play();
        setNativeVideoActive(true);
      } else {
        video.pause();
      }
    } catch {
      setSimulatedPlayback(true);
      setNativeVideoActive(false);
      setIsPlaying((playing) => !playing);
    }
  }

  function seekTo(seconds: number) {
    const normalized = Math.max(0, Math.min(previewDuration, seconds));
    if (videoRef.current) videoRef.current.currentTime = normalized;
    setCurrentTime(normalized);
  }

  function handleReviewFrameClick(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeAsset) return;
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
    if (!activeAsset) return;
    if (demoMode) {
      addDemoReviewCutMarker({
        projectId: project.id,
        assetId: activeAsset.id,
        timeSeconds: currentTime,
      });
      setToast(`Cut decision marked at ${formatClock(currentTime)}`);
      return;
    }

    const response = await fetch(`/api/assets/${activeAsset.id}/edit-decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
    if (!activeAsset || !commentBody.trim() || commentSubmitting) return;
    const shouldResume = resumeAfterComment;
    const submittedBody = commentBody.trim();
    const submittedTime = pendingPin?.timeSeconds ?? currentTime;
    if (demoMode) {
      addDemoReviewComment({
        projectId: project.id,
        assetId: activeAsset.id,
        body: submittedBody,
        timeSeconds: submittedTime,
        pinX: pendingPin?.x,
        pinY: pendingPin?.y,
      });
    } else {
      setCommentSubmitting(true);
      try {
        const response = await fetch(`/api/assets/${activeAsset.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
    if (!activeAsset) return;
    if (demoMode) {
      toggleDemoReviewCommentResolved(comment.id);
      return;
    }
    const status = comment.status === "open" ? "resolved" : "open";
    const response = await fetch(`/api/assets/${activeAsset.id}/comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: comment.id, status }),
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
      disabled: !activeAsset || !canShare,
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
        <Link className="cockpit-brand" href={demoMode ? "/projects?demo=1" : "/projects"} aria-label="Co-VideoPro projects">
          <CoProductionBrand className={styles.brandLockup} priority />
          <CoProductionBrand className={styles.brandMark} variant="compact-mark" label="Co-VideoPro" />
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
          <button
            type="button"
            className={styles.stageChip}
            onClick={handleAdvanceStage}
            title={`${PROJECT_STAGE_META[currentStage].summary} Select to advance the lifecycle stage.`}
            aria-label={`Project stage: ${PROJECT_STAGE_META[currentStage].label}. Advance stage.`}
          >
            <span className={styles.stageChipDot} aria-hidden="true" />
            {PROJECT_STAGE_META[currentStage].label}
          </button>
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
                  {asset.thumbnail_url || demoMode ? (
                    <Image
                      src={asset.thumbnail_url ?? "/demo/ceraweek-speaker.jpg"}
                      alt=""
                      width={46}
                      height={30}
                    />
                  ) : (
                    <span aria-hidden="true"><Play size={16} /></span>
                  )}
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
          <div className="cockpit-popover-anchor" ref={notificationRef}>
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
              <div id="cockpit-notifications" className="cockpit-popover cockpit-notifications" role="region" aria-label="Project notifications">
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
          <div className="cockpit-popover-anchor" ref={accountRef}>
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
              <div id="cockpit-account-menu" className="cockpit-popover cockpit-account" role="menu" aria-label="Account menu">
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
          demoMode={demoMode}
          compact={compactRail}
          overviewOpen={overviewOpen}
          onSelect={selectSection}
          onCollapse={toggleRail}
        />
      </aside>
        <CockpitProjectNavigationDrawer
          open={mobileNavOpen}
          activeSection={activeSection}
          dueTodayCount={dueTodayCount}
          demoMode={demoMode}
          overviewOpen={overviewOpen}
        onSelect={selectSection}
        onClose={() => setMobileNavOpen(false)}
      />
        <CockpitMobileNavigation
          activeSection={activeSection}
          dueTodayCount={dueTodayCount}
        overviewOpen={overviewOpen}
        drawerOpen={mobileNavOpen}
        onSelect={selectSection}
        onOpenDrawer={() => setMobileNavOpen(true)}
      />

      <CockpitOverviewDrawer
        compactRail={compactRail}
        metrics={overviewMetrics}
        open={overviewOpen}
        projectName={project.name}
        viewerName={demoMode ? "Content Co-op" : viewerName}
        onClose={() => setOverviewOpen(false)}
      />

      <main id="cockpit-workspace-content" className="cockpit-main" tabIndex={-1}>
        {activeSection === "overview" ? (
          <>
            <div className={`cockpit-overview-grid ${dockVisible ? "" : styles.overviewWithoutDock}`}>
              <div className="cockpit-center-column">
                <div className="cockpit-section-heading">
                  <h2>{activeAsset ? "Latest review" : "Review workspace"}</h2>
                  {activeAsset ? (
                    <>
                      <span>{versionLabel(activeAsset, demoMode)}</span>
                      <select
                        value={activeAsset.id}
                        onChange={(event) => {
                          const asset = assets.find((candidate) => candidate.id === event.target.value);
                          if (asset) selectAsset(asset);
                        }}
                        aria-label="Latest review media"
                      >
                        {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
                      </select>
                    </>
                  ) : (
                    <button className="cockpit-action-primary cockpit-empty-upload" type="button" onClick={onUpload}>
                      <Upload size={15} /> Upload media
                    </button>
                  )}
                </div>

                {activeAsset ? (
                  <div className="cockpit-review-strip" aria-label="Review readiness">
                    {reviewReadinessItems.map(({ id, label, value, detail, icon: Icon, tone }) => (
                      <article key={id} data-tone={tone}>
                        <Icon size={14} aria-hidden="true" />
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <small>{detail}</small>
                      </article>
                    ))}
                  </div>
                ) : null}

                {activeAsset ? (
                  <div className="cockpit-system-posture" aria-label="Studio systems posture">
                    <Link className="cockpit-system-posture-link" href={systemsHref} data-tone={systemsReadiness.tone}>
                      <ServerCog size={14} aria-hidden="true" />
                      <span>Systems</span>
                      <strong>{systemsReadiness.label}</strong>
                      <small>{systemsReadiness.detail}</small>
                    </Link>
                    {systemPostureItems.map(({ id, label, value, detail, icon: Icon, tone }) => (
                      <article key={id} data-tone={tone}>
                        <Icon size={14} aria-hidden="true" />
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <small>{detail}</small>
                      </article>
                    ))}
                  </div>
                ) : null}

                {activeAsset ? (
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
                      <video
                        ref={videoRef}
                        className={nativeVideoActive || (!demoMode && Boolean(activeMediaUrl)) ? "active" : ""}
                        src={activeMediaUrl ?? undefined}
                        poster={activePosterUrl ?? undefined}
                        preload="metadata"
                        playsInline
                        muted={isMuted}
                        onLoadedMetadata={(event) => {
                          if (Number.isFinite(event.currentTarget.duration)) {
                            setNativeDuration(event.currentTarget.duration);
                          }
                        }}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                        onEnded={() => setIsPlaying(false)}
                      />
                      <time>{formatClock(currentTime)}</time>
                      <div
                        className="cockpit-review-overlay"
                        data-review-overlay
                        onPointerDown={handleReviewFrameClick}
                        aria-hidden="true"
                      />
                      {comments.filter((comment) => comment.pin_x != null && comment.pin_y != null).map((comment, index) => (
                        <button
                          key={comment.id}
                          type="button"
                          className="cockpit-frame-pin"
                          style={{ left: `${comment.pin_x}%`, top: `${comment.pin_y}%` }}
                          onClick={() => seekTo(comment.time_seconds)}
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
                      <div className="cockpit-video-controls">
                        <button type="button" onClick={togglePlayback} aria-label={isPlaying ? "Pause" : "Play"}>
                          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                        </button>
                        <span>{formatShortClock(currentTime)} / {formatShortClock(previewDuration)}</span>
                        <input
                          type="range"
                          min={0}
                          max={previewDuration}
                          step={0.01}
                          value={Math.min(currentTime, previewDuration)}
                          onChange={(event) => seekTo(Number(event.target.value))}
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
                          onClick={() => setIsMuted((muted) => !muted)}
                          aria-label={isMuted ? "Unmute" : "Mute"}
                        >
                          {isMuted ? <VolumeX size={19} /> : <Volume2 size={19} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => videoRef.current?.requestFullscreen?.()}
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
                ) : null}

                {activeAsset ? (
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
                    <button type="button" onClick={() => setShareOpen(true)} disabled={!canShare}>
                      <Share2 size={15} />
                      <span>Share</span>
                    </button>
                  </div>
                ) : null}

              </div>

              {dockVisible ? (
                <aside className={`cockpit-detail-rail ${styles.operatorDock}`}>
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
                          <h2>Review status</h2>
                          <p className="cockpit-review-status"><i /> {formatAssetStatus(activeAsset.status)}</p>
                          {approvalStages.length > 0 ? (
                            <>
                              <div className="cockpit-progress">
                                <span
                                  style={{
                                    width: `${approvalStages[0].reviewer_names.length
                                      ? (approvalStages[0].approved_reviewer_names.length / approvalStages[0].reviewer_names.length) * 100
                                      : 0}%`,
                                  }}
                                />
                              </div>
                              <div className="cockpit-progress-copy">
                                <strong>Step 1 of {approvalStages.length}</strong>
                                <span>{approvalStages[0].approved_reviewer_names.length}/{approvalStages[0].reviewer_names.length} approved</span>
                              </div>
                              <button
                                className="cockpit-rail-primary"
                                type="button"
                                onClick={openReviewCockpit}
                              >
                                View review
                              </button>
                            </>
                          ) : (
                            <>
                              <p className="cockpit-rail-empty">No approval workflow has been requested.</p>
                              <button className="cockpit-rail-secondary" type="button" onClick={() => setShareOpen(true)} disabled={!canShare}>
                                Start review
                              </button>
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
                            {visibleComments.slice(0, 4).map((comment) => (
                              <article key={comment.id}>
                                <button type="button" onClick={() => seekTo(comment.time_seconds)}>{formatShortClock(comment.time_seconds)}</button>
                                <div><strong>{comment.author_name}</strong><p>{comment.body}</p></div>
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
                            ))}
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
                          <header><h2>Live session</h2><button type="button" onClick={() => router.push(systemsHref)}>Systems</button></header>
                          <div className="cockpit-live-session" aria-label="Live collaboration readiness">
                            {liveSessionItems.map(({ id, label, value, detail, icon: Icon, tone }) => (
                              <article key={id} data-tone={tone}>
                                <Icon size={14} aria-hidden="true" />
                                <span>{label}</span>
                                <strong>{value}</strong>
                                <small>{detail}</small>
                              </article>
                            ))}
                          </div>
                          <div className="cockpit-live-actions" aria-label="Live session controls">
                            <button
                              type="button"
                              onClick={() => {
                                setMobileDockOpen(false);
                                window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".cockpit-comment-composer input")?.focus());
                              }}
                            >
                              Pin comment
                            </button>
                            <button type="button" disabled aria-disabled="true">
                              Start screen share
                            </button>
                          </div>
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
                          <header><h2>Transcript and cleanup</h2><button type="button" onClick={() => selectSection("metadata")}>Details</button></header>
                          <div className="cockpit-ai-review">
                            <article>
                              <strong>Transcript</strong>
                              <span>{demoMode ? "Demo transcript not processed" : "Waiting for transcript job"}</span>
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
                            <div><dt>Resolution</dt><dd>{activeAsset.file_type === "video" ? demoMode ? "1920 x 1080" : "Not reported" : "Source file"}</dd></div>
                            <div><dt>Frame rate</dt><dd>{activeAsset.file_type === "video" ? demoMode ? "23.98 fps" : "Not reported" : "Not applicable"}</dd></div>
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
                        {asset.thumbnail_url || demoMode ? <Image src={asset.thumbnail_url ?? "/demo/ceraweek-speaker.jpg"} alt={asset.title} fill sizes="320px" unoptimized /> : null}
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
                <header><div><h2>Review links</h2><p>Active and revocable links for client review and delivery.</p></div><button type="button" onClick={activeAsset ? () => setShareOpen(true) : onUpload}>{activeAsset ? <Share2 size={16} /> : <Upload size={16} />} {activeAsset ? "Create link" : "Upload media"}</button></header>
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
                <header><div><h2>Version history</h2><p>All current project deliverables and revision depth.</p></div></header>
                <div className="cockpit-table-list">
                  {assets.map((asset) => <article key={asset.id}><span className="cockpit-list-icon"><History size={18} /></span><div><strong>{asset.title}</strong><small>Updated {timeAgo(asset.created_at)} · {asset.comment_count ?? 0} comments</small></div><span className="status-version">{asset.version_count ?? (demoMode ? 1 : "Not indexed")}</span><button type="button" onClick={() => { selectAsset(asset); selectSection("overview"); }}>Review</button></article>)}
                  {assets.length === 0 ? <EmptyState title="No versions" body="The first uploaded file will create version 1." /> : null}
                </div>
              </>
            ) : null}

            {activeSection === "metadata" ? (
              <>
                <header><div><h2>Project metadata</h2><p>Delivery, ownership, technical, and brand details.</p></div></header>
                <div className="cockpit-metadata-grid">
                  <section><h3>Project</h3><dl><div><dt>Name</dt><dd>{project.name}</dd></div><div><dt>Status</dt><dd>Active</dd></div><div><dt>Owner</dt><dd>Content Co-op</dd></div><div><dt>Storage</dt><dd>CCNAS media authority</dd></div></dl></section>
                  <section><h3>Active media</h3>{activeAsset ? <dl><div><dt>Title</dt><dd>{activeAsset.title}</dd></div><div><dt>Duration</dt><dd>{formatShortClock(activeAsset.duration_seconds ?? 0)}</dd></div><div><dt>Resolution</dt><dd>{activeAsset.file_type === "video" ? demoMode ? "1920 x 1080" : "Not reported" : "Source file"}</dd></div><div><dt>Frame rate</dt><dd>{activeAsset.file_type === "video" ? demoMode ? "23.98 fps" : "Not reported" : "Not applicable"}</dd></div></dl> : <p className="cockpit-rail-empty">No media has been uploaded.</p>}</section>
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
              <span>{uploadStatus.message ?? "Keep this window open while Co-VideoPro prepares the review asset."}</span>
              <b>{uploadStatus.progress}%</b>
            </div>
            <ol className="cockpit-upload-steps">
              {[
                ["validating", "Validate media"],
                ["transferring", uploadStatus.mode === "demo" ? "Register local preview" : "Transfer to media storage"],
                ["proxy", "Prepare review proxy"],
                ["indexing", "Index project metadata"],
              ].map(([phase, label], index, all) => {
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
                    ? "A new version is now available in Project Browser and Version history."
                    : uploadStatus.phase === "error"
                      ? "No version was added. Retry from Upload when the issue is fixed."
                      : "Preview mode uses browser-local media storage when available; production uses the configured CCNAS or cloud media authority."}
                </small>
              ) : null}
              {uploadTerminal && onUploadDismiss ? (
                <button type="button" onClick={onUploadDismiss}>
                  {uploadStatus.phase === "complete" ? "Review new version" : "Close upload status"}
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
