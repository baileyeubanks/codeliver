"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlertTriangle,
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
  MessageSquarePlus,
  MessageSquareText,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Save,
  Search,
  Send,
  Share2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import DemoShareModal from "@/components/demo/DemoShareModal";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import NotificationBell from "@/components/notifications/NotificationBell";
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
import { useProjectProductionPlan } from "@/lib/hooks/useProjectProductionPlan";
import type { MediaAsset } from "@/components/projects/MediaCard";
import type { FolderNode } from "@/components/projects/FolderTree";
import ProjectOverviewHome, { ProjectSequenceLibrary } from "@/components/projects/ProjectOverviewHome";
import { ProjectScriptWorkspace } from "@/components/projects/ProjectScriptWorkspace";
import { ProjectShotPlanWorkspace } from "@/components/projects/ProjectShotPlanWorkspace";
import { ProjectProductionScheduleWorkspace } from "@/components/projects/ProjectProductionScheduleWorkspace";
import { ProjectCallSheetWorkspace } from "@/components/projects/ProjectCallSheetWorkspace";
import {
  addDemoReviewComment,
  addDemoReviewCutMarker,
  approveDemoStage,
  createDemoShareLinks,
  getDemoProjectVersionReviewComments,
  getDemoVersionCutMarkers,
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
import { useDemoMediaObjectUrl } from "@/lib/demo/media-blob-store";
import { formatActivityAction } from "@/lib/activity-copy";
import { normalizeReviewSeekStep, normalizeReviewShortcutKey, shouldIgnoreReviewShortcut } from "@/lib/review/player-policy";
import {
  reviewPinNormalizedToPercent,
  reviewPinPercentToNormalized,
} from "@/lib/review/pin-coordinates";
import { canReplyToReviewThread } from "@/lib/review/thread-policy";
import { buildSurfaceUrl, getBrowserClientSiteUrl } from "@/lib/surface-origins";
import { useNotificationStore } from "@/lib/stores/notificationStore";
import type { EditDecision, Version } from "@/lib/types/codeliver";
import {
  DEMO_PROJECT_ORIGIN,
  deriveProjectOriginDisplay,
  type ProjectOriginDisplay,
} from "@/lib/co-produce/project-origin-display";
import {
  canAccessProjectBriefDisplay,
  parseProjectBriefDisplay,
  type ProjectBriefDisplay,
} from "@/lib/co-produce/project-brief-display";
import styles from "./ProjectCockpit.module.css";

function customBrandSource(source: string | undefined) {
  return source && !source.startsWith("/brand/co-videopro-") ? source : undefined;
}

interface ProjectCockpitProps {
  project: DemoProject;
  assets: MediaAsset[];
  folders: FolderNode[];
  demoMode: boolean;
  projects?: DemoProject[];
  viewer?: {
    name: string;
    email: string;
  };
  workspaceRole: WorkspaceRole;
  uploading: boolean;
  uploadStatus: CockpitUploadStatus | null;
  onUpload: () => void;
}

type CockpitApprovalStage = Omit<DemoApprovalStage, "status"> & { status: string };
type ProjectBriefLoadState = "idle" | "loading" | "ready" | "unavailable";
type PlanWorkspaceMode = "script" | "shots" | "tasks" | "schedule" | "call-sheet";
type ReviewVersion = Pick<
  Version,
  "id" | "asset_id" | "version_number" | "file_url" | "thumbnail_url" | "duration_seconds" | "is_current" | "created_at"
>;

type PendingReviewComment = {
  anchor: {
    x: number;
    y: number;
  };
  pin: {
    x: number;
    y: number;
  } | null;
  timeSeconds: number;
};

export interface CockpitUploadStatus {
  fileName: string;
  progress: number;
  phase: "validating" | "transferring" | "proxy" | "indexing" | "complete" | "error";
  completed: number;
  total: number;
  mode: "demo" | "production";
  message?: string;
}

function isCockpitSection(value: string | null): value is CockpitSection {
  return COCKPIT_NAVIGATION.some((item) => item.id === value);
}

function planWorkspaceMode(value: string | null): PlanWorkspaceMode {
  if (
    value === "script" ||
    value === "shots" ||
    value === "schedule" ||
    value === "call-sheet"
  ) return value;
  return "tasks";
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

function taskDueLabel(dueDate: string | null, completed: boolean) {
  if (completed) return "Completed";
  if (!dueDate) return "No due date";
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  if (dueDate === today) return "Today";
  if (dueDate < today) return "Overdue";
  const parsed = new Date(`${dueDate}T12:00:00`);
  return Number.isFinite(parsed.valueOf())
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(parsed)
    : "No due date";
}

function formatShortClock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
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

function isReviewVersion(value: unknown): value is ReviewVersion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string"
    && typeof record.asset_id === "string"
    && typeof record.version_number === "number"
    && Number.isInteger(record.version_number)
    && typeof record.file_url === "string"
    && typeof record.is_current === "boolean"
    && typeof record.created_at === "string";
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

function normalizeLiveComment(
  record: Record<string, unknown>,
  projectId: string,
  assetId: string,
): DemoReviewComment {
  const status = record.status === "resolved" ? "resolved" : "open";
  const pinX = reviewPinNormalizedToPercent(record.pin_x);
  const pinY = reviewPinNormalizedToPercent(record.pin_y);
  return {
    id: recordString(record, "id", crypto.randomUUID()),
    project_id: projectId,
    asset_id: assetId,
    version_id: typeof record.version_id === "string" ? record.version_id : null,
    parent_id: typeof record.parent_id === "string" ? record.parent_id : null,
    author_name: recordString(record, "author_name", "Content Co-op"),
    author_email: typeof record.author_email === "string" ? record.author_email : null,
    body: recordString(record, "body"),
    time_seconds: recordNumber(record, "timecode_seconds"),
    frame_number: typeof record.frame_number === "number" && Number.isInteger(record.frame_number)
      ? record.frame_number
      : null,
    pin_x: pinX,
    pin_y: pinY,
    visibility: record.visibility === "external" ? "external" : "internal",
    status,
    resolved_at: typeof record.resolved_at === "string" ? record.resolved_at : null,
    updated_at: typeof record.updated_at === "string" ? record.updated_at : null,
    created_at: recordString(record, "created_at", new Date().toISOString()),
  };
}

function commentsForReplyLookup(
  projectId: string,
  assetId: string | undefined,
  versionId: string | null,
  liveComments: DemoReviewComment[],
  demoComments: DemoReviewComment[],
  demoMode: boolean,
  commentId: string,
) {
  const comments = demoMode ? demoComments : liveComments;
  return comments.find((comment) =>
    comment.id === commentId
    && (!demoMode || comment.project_id === projectId)
    && comment.asset_id === assetId
    && comment.version_id === versionId,
  ) ?? null;
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
    password_protected: Boolean(record.password_protected),
    notification_status: "links_only",
    is_active: record.authority_status === "active",
    public_url: buildSurfaceUrl(clientOrigin, `/review/${encodeURIComponent(token)}`),
  };
}

function ApprovedProjectBrief({ brief }: { brief: ProjectBriefDisplay }) {
  const groups = [
    { label: "Objectives", items: brief.objectives },
    { label: "Audiences", items: brief.audiences },
    { label: "Key messages", items: brief.keyMessages },
    { label: "Requested deliverables", items: brief.requestedDeliverables },
    { label: "Constraints", items: brief.constraints },
    { label: "References", items: brief.references },
    { label: "Success criteria", items: brief.successCriteria },
  ].filter((group) => group.items.length > 0);

  return (
    <details className={styles.approvedBrief}>
      <summary
        aria-label={`Approved brief: ${brief.title}, revision ${brief.revisionNumber}`}
      >
        <span className={styles.approvedBriefSummary}>
          <span className={styles.approvedBriefLabel}>Approved brief</span>
          <strong>{brief.title}</strong>
        </span>
        <span className={styles.approvedBriefRevision}>
          Revision {brief.revisionNumber}
        </span>
        <ChevronDown
          className={styles.approvedBriefChevron}
          size={16}
          aria-hidden="true"
        />
      </summary>
      {groups.length > 0 ? (
        <div className={styles.approvedBriefDetails}>
          {groups.map((group) => (
            <section className={styles.approvedBriefGroup} key={group.label}>
              <h3>{group.label}</h3>
              <ul>
                {group.items.map((item, index) => (
                  <li key={`${group.label}-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </details>
  );
}

export default function ProjectCockpit({
  project,
  assets,
  folders,
  demoMode,
  projects = [project],
  viewer,
  workspaceRole,
  uploading,
  uploadStatus,
  onUpload,
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
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const setNotificationsOpen = useNotificationStore((state) => state.setOpen);
  const requestedAssetId = searchParams.get("asset");
  const requestedVersionId = searchParams.get("version");
  const selectedSequenceId = searchParams.get("sequence");
  const reviewViewRequested = searchParams.get("view") === "review";
  const [reviewViewActive, setReviewViewActive] = useState(reviewViewRequested);
  const [activeSection, setActiveSection] = useState<CockpitSection>(() => {
    const requestedSection = searchParams.get("surface");
    return isCockpitSection(requestedSection) ? requestedSection : "overview";
  });
  const [activePlanWorkspace, setActivePlanWorkspace] = useState<PlanWorkspaceMode>(() =>
    planWorkspaceMode(searchParams.get("plan")),
  );
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [activeAssetId, setActiveAssetId] = useState(
    assets.find((asset) => asset.id === requestedAssetId)?.id ?? "",
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulatedPlayback, setSimulatedPlayback] = useState(false);
  const [nativeVideoActive, setNativeVideoActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [pendingReviewComment, setPendingReviewComment] = useState<PendingReviewComment | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [resumeAfterComment, setResumeAfterComment] = useState(false);
  const [seekStepSeconds, setSeekStepSeconds] = useState(2);
  const [commentStatus, setCommentStatus] = useState<"open" | "resolved">("open");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileDockOpen, setMobileDockOpen] = useState(false);
  const [mobileDockTarget, setMobileDockTarget] = useState<"comments" | "transcript" | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const commandButtonRef = useRef<HTMLButtonElement>(null);
  const commentsDockSectionRef = useRef<HTMLElement>(null);
  const transcriptDockSectionRef = useRef<HTMLElement>(null);
  const liveAssetRequestRef = useRef(0);
  const [toast, setToast] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [nativeDuration, setNativeDuration] = useState(0);
  const [liveComments, setLiveComments] = useState<DemoReviewComment[]>([]);
  const [liveCutMarkers, setLiveCutMarkers] = useState<DemoReviewCutMarker[]>([]);
  const [liveAssetDataId, setLiveAssetDataId] = useState<string | null>(null);
  const [liveAssetDataVersionId, setLiveAssetDataVersionId] = useState<string | null>(null);
  const [liveVersions, setLiveVersions] = useState<ReviewVersion[]>([]);
  const [liveVersionAssetId, setLiveVersionAssetId] = useState<string | null>(null);
  const [reviewDataError, setReviewDataError] = useState("");
  const [liveActivity, setLiveActivity] = useState<DemoActivityItem[]>([]);
  const [liveProjectOrigin, setLiveProjectOrigin] = useState<ProjectOriginDisplay | null>(null);
  const [projectOriginLoading, setProjectOriginLoading] = useState(false);
  const [liveProjectBrief, setLiveProjectBrief] = useState<ProjectBriefDisplay | null>(null);
  const [projectBriefState, setProjectBriefState] = useState<ProjectBriefLoadState>("idle");
  const productionPlan = useProjectProductionPlan(project.id, !demoMode);
  const [planTitle, setPlanTitle] = useState(() => `${project.name} plan`);
  const [planSummary, setPlanSummary] = useState("");
  const [firstPlanTaskTitle, setFirstPlanTaskTitle] = useState("Confirm production scope");
  const planInitializationRequestRef = useRef<{
    fingerprint: string;
    requestId: string;
    clientTaskId: string;
  } | null>(null);

  useEffect(() => {
    const requestedSection = searchParams.get("surface");
    setActiveSection(isCockpitSection(requestedSection) ? requestedSection : "overview");
    setActivePlanWorkspace(planWorkspaceMode(searchParams.get("plan")));
    setReviewViewActive(searchParams.get("view") === "review");
  }, [searchParams]);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem("co-deliver-review-seek-step"));
      if (Number.isFinite(saved) && saved > 0) {
        setSeekStepSeconds(normalizeReviewSeekStep(saved));
      }
    } catch {
      // Keep the deterministic two-second default when browser storage is blocked.
    }
  }, []);
  const [liveShareLinks, setLiveShareLinks] = useState<DemoShareLink[]>([]);
  const activeAsset = assets.find((asset) => asset.id === activeAssetId);
  const activeAssetRecordId = activeAsset?.id ?? null;
  const versionListReady = demoMode || liveVersionAssetId === activeAssetRecordId;
  const selectedLiveVersion = !demoMode && versionListReady
    ? requestedVersionId
      ? liveVersions.find((version) => version.id === requestedVersionId) ?? null
      : liveVersions.find((version) => version.is_current) ?? liveVersions[0] ?? null
    : null;
  const demoVersionId = activeAsset ? `demo-version-${activeAsset.version_count ?? 1}` : null;
  const activeVersionId = demoMode
    ? requestedVersionId ?? demoVersionId
    : selectedLiveVersion?.id ?? null;
  const versionUnavailable = !demoMode
    && Boolean(activeAsset)
    && versionListReady
    && !selectedLiveVersion;
  const replyToComment = replyToCommentId
    ? commentsForReplyLookup(project.id, activeAssetRecordId ?? undefined, activeVersionId, liveComments, workspace.reviewComments, demoMode, replyToCommentId)
    : null;
  const demoMediaUrl = useDemoMediaObjectUrl(activeAsset?.id ?? null);
  const activeMediaUrl = demoMode
    ? demoMediaUrl ?? "/demo/ica-ceo-preview.mp4"
    : selectedLiveVersion?.file_url ?? null;
  const activePosterUrl = demoMode
    ? activeAsset?.thumbnail_url ?? "/demo/ceraweek-speaker.jpg"
    : selectedLiveVersion?.thumbnail_url ?? null;
  const versionDuration = demoMode
    ? activeAsset?.duration_seconds
    : selectedLiveVersion?.duration_seconds;
  const duration = Math.max(1, nativeDuration || versionDuration || (demoMode ? 5 : 1));
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
  const canViewProjectOrigin = ["owner", "admin", "producer"].includes(workspaceRole);
  const canViewProjectBrief = canAccessProjectBriefDisplay(workspaceRole);
  const canFetchOperatingRecord = canViewProjectOrigin || canViewProjectBrief;
  const projectOrigin = demoMode ? DEMO_PROJECT_ORIGIN : liveProjectOrigin;
  const projectBrief = canViewProjectBrief ? liveProjectBrief : null;

  useEffect(() => {
    if (demoMode || !canFetchOperatingRecord) {
      setLiveProjectOrigin(null);
      setProjectOriginLoading(false);
      setLiveProjectBrief(null);
      setProjectBriefState("idle");
      return;
    }

    const controller = new AbortController();
    let current = true;
    setLiveProjectOrigin(null);
    setProjectOriginLoading(canViewProjectOrigin);
    setLiveProjectBrief(null);
    setProjectBriefState(canViewProjectBrief ? "loading" : "idle");
    fetch(`/api/projects/${encodeURIComponent(project.id)}/operating-record`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Project operating record is unavailable");
        }
        const record: unknown = await response.json();
        return {
          origin: canViewProjectOrigin
            ? deriveProjectOriginDisplay(record)
            : null,
          brief: parseProjectBriefDisplay(record, workspaceRole),
        };
      })
      .then(({ origin, brief }) => {
        if (!current) return;
        setLiveProjectOrigin(origin);
        setLiveProjectBrief(canViewProjectBrief ? brief : null);
        setProjectBriefState(canViewProjectBrief ? "ready" : "idle");
      })
      .catch((error: unknown) => {
        if (
          current &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setLiveProjectOrigin(null);
          setLiveProjectBrief(null);
          setProjectBriefState(canViewProjectBrief ? "unavailable" : "idle");
        }
      })
      .finally(() => {
        if (current) setProjectOriginLoading(false);
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [canFetchOperatingRecord, canViewProjectBrief, canViewProjectOrigin, demoMode, project.id, workspaceRole]);

  const comments = useMemo(() => demoMode
    ? activeAssetRecordId && activeVersionId
      ? getDemoProjectVersionReviewComments(
          { reviewComments: workspace.reviewComments },
          {
            projectId: project.id,
            assetId: activeAssetRecordId,
            versionId: activeVersionId,
          },
        )
      : []
    : liveAssetDataId === activeAssetRecordId && liveAssetDataVersionId === activeVersionId
      ? liveComments
      : [], [
    activeAssetRecordId,
    activeVersionId,
    demoMode,
    liveAssetDataId,
    liveAssetDataVersionId,
    liveComments,
    project.id,
    workspace.reviewComments,
  ]);
  const cutMarkers = demoMode
    ? activeAssetRecordId && activeVersionId
      ? getDemoVersionCutMarkers(
          { reviewCutMarkers: workspace.reviewCutMarkers },
          {
            projectId: project.id,
            assetId: activeAssetRecordId,
            versionId: activeVersionId,
          },
        )
      : []
    : liveAssetDataId === activeAssetRecordId && liveAssetDataVersionId === activeVersionId
      ? liveCutMarkers
      : [];
  const visibleComments = useMemo(
    () => comments.filter((comment) => comment.status === commentStatus),
    [commentStatus, comments],
  );
  const visibleCommentThreads = useMemo(() => {
    const repliesByParent = new Map<string, DemoReviewComment[]>();
    for (const comment of comments) {
      if (!comment.parent_id) continue;
      const replies = repliesByParent.get(comment.parent_id) ?? [];
      replies.push(comment);
      repliesByParent.set(comment.parent_id, replies);
    }
    const threads = visibleComments
      .filter((comment) => !comment.parent_id)
      .map((comment) => ({ comment, replies: repliesByParent.get(comment.id) ?? [] }));
    if (!selectedCommentId) return threads;

    return [...threads].sort((left, right) =>
      Number(right.comment.id === selectedCommentId) - Number(left.comment.id === selectedCommentId),
    );
  }, [comments, selectedCommentId, visibleComments]);
  const openCommentCount = comments.filter((comment) => comment.status === "open").length;
  const resolvedCommentCount = comments.filter((comment) => comment.status === "resolved").length;
  const liveTasks = useMemo<DemoProjectTask[]>(() =>
    (productionPlan.snapshot?.tasks ?? []).map((task) => {
      const completed = task.status === "completed";
      return {
        id: task.id,
        project_id: task.projectId,
        asset_id: task.sourceKind === "review_comment" ? task.sourceRef : null,
        title: task.title,
        assignee_name: task.assigneeId ? "Assigned teammate" : "Unassigned",
        due_label: taskDueLabel(task.dueDate, completed),
        completed,
      };
    }), [productionPlan.snapshot?.tasks]);
  const projectTasks = useMemo(() => demoMode
    ? workspace.tasks.filter((task) => task.project_id === project.id)
    : liveTasks, [demoMode, liveTasks, project.id, workspace.tasks]);
  const productionTaskById = useMemo(
    () => new Map((productionPlan.snapshot?.tasks ?? []).map((task) => [task.id, task])),
    [productionPlan.snapshot?.tasks],
  );
  const canInitializeProductionPlan = !demoMode && Boolean(
    productionPlan.ready &&
    productionPlan.snapshot &&
    !productionPlan.snapshot.plan &&
    productionPlan.snapshot.canInitialize,
  );
  const productionPlanNeedsProducer = !demoMode && Boolean(
    productionPlan.ready &&
    productionPlan.snapshot &&
    !productionPlan.snapshot.plan &&
    !productionPlan.snapshot.canInitialize,
  );
  const approvalStages: CockpitApprovalStage[] = demoMode
    ? (() => {
        const explicitStages = workspace.approvalStages.filter(
          (stage) => stage.asset_id === activeAsset?.id,
        );
        const linkedStages = workspace.shareLinks
          .filter(
            (link) =>
              link.is_active &&
              link.share_intent === "approval_needed" &&
              Boolean(activeAsset?.id && link.asset_ids.includes(activeAsset.id)),
          )
          .map((link) => {
            const reviewer = link.reviewer_name ?? link.reviewer_email ?? "Client approver";
            const publicState = workspace.publicReviewStates.find(
              (state) =>
                state.asset_id === activeAsset?.id && state.review_invite_id === link.id,
            );
            const decisions = publicState?.approvals ?? [];
            const approved =
              decisions.length > 0 &&
              decisions.every(
                (approval) =>
                  approval.status === "approved" || approval.status === "approved_with_changes",
              );

            return {
              id: `share-approval-${link.id}`,
              project_id: project.id,
              asset_id: activeAsset?.id ?? "",
              name: "Client approval",
              reviewer_names: [reviewer],
              approved_reviewer_names: approved ? [reviewer] : [],
              status: approved ? "approved" : "pending",
            };
          });

        return [...explicitStages, ...linkedStages];
      })()
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
  const approvedReviewerCount = approvalStages.reduce(
    (sum, stage) => sum + stage.approved_reviewer_names.length,
    0,
  );
  const assignedReviewerCount = approvalStages.reduce(
    (sum, stage) => sum + stage.reviewer_names.length,
    0,
  );
  const approvalSummary = approvalStages.length === 0
    ? "Not assigned"
    : assignedReviewerCount > 0
      ? `${approvedReviewerCount}/${assignedReviewerCount}`
      : "Unassigned";
  const viewerName = viewer?.name || (demoMode
    ? `${workspace.settings.profile.firstName} ${workspace.settings.profile.lastName}`.trim()
    : "Content Co-op");
  const viewerEmail = viewer?.email || (demoMode ? workspace.session.email : "");
  const profileAvatarPath = demoMode ? workspace.settings.profile.avatarPath : "";
  const brandLogoPath = customBrandSource(
    demoMode ? workspace.settings.brand.logoPath : undefined,
  );
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
  const activeProjectLinks = projectLinks.filter((link) => link.is_active);
  const activeAssetLinkCount = activeAsset
    ? activeProjectLinks.filter((link) => link.asset_ids.includes(activeAsset.id)).length
    : 0;
  const batchShareLinkCount = projectLinks.filter((link) =>
    link.media_count > 1 || link.asset_ids.length > 1 || Boolean(link.batch_id)
  ).length;
  const downloadShareLinkCount = projectLinks.filter((link) => link.allow_downloads).length;
  const expiringShareLinkCount = projectLinks.filter((link) => Boolean(link.expires_at)).length;
  const identityGatedShareLinkCount = projectLinks.filter((link) => link.require_name).length;
  const passwordProtectedShareLinkCount = projectLinks.filter(
    (link) => link.password_protected,
  ).length;
  const shareScopeLabel = demoMode
    ? assets.length > 1 ? `${assets.length} selectable assets` : "Single asset demo"
    : "Selected asset";
  const batchShareStatus = demoMode
    ? batchShareLinkCount > 0
      ? `${batchShareLinkCount} batch ${batchShareLinkCount === 1 ? "link" : "links"}`
      : "Available in share picker"
    : "Batch share from project library";
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
  const activeProductionTasks = demoMode
    ? projectTasks
    : projectTasks.filter((task) =>
        productionPlan.snapshot?.tasks.find((candidate) => candidate.id === task.id)?.status !== "cancelled",
      );
  const completedProductionTaskCount = activeProductionTasks.filter((task) => task.completed).length;
  const preProductionProgress = activeProductionTasks.length > 0
    ? Math.round((completedProductionTaskCount / activeProductionTasks.length) * 100)
    : 0;
  const overviewMetrics = [
    { label: "In review", value: inReviewCount, unit: "Items" },
    { label: "Approved", value: approvedCount, unit: "Items" },
    {
      label: "Due today",
      value: dueTodayCount,
      unit: "Tasks",
    },
    { label: "Total comments", value: commentCount, unit: "Comments" },
  ];
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
        href: surfaceHref("tasks"),
        progress: preProductionProgress,
        progressLabel: !demoMode && productionPlan.loading && !productionPlan.ready
          ? "Loading plan"
          : activeProductionTasks.length > 0
            ? `${completedProductionTaskCount} of ${activeProductionTasks.length} tasks complete`
            : "No active task plan",
        status: productionPlan.error && !demoMode
          ? { label: "Needs attention", tone: "attention" }
          : activeProductionTasks.length > 0
            ? {
                label: preProductionProgress === 100 ? "Complete" : "In progress",
                tone: preProductionProgress === 100 ? "complete" : "active",
              }
            : { label: "Not started", tone: "neutral" },
        agentStatus: { label: "Proposal only", tone: "neutral" },
        humanStatus: activeProductionTasks.length > 0
          ? { label: `${activeProductionTasks.length - completedProductionTaskCount} remaining`, tone: preProductionProgress === 100 ? "complete" : "active" }
          : { label: "Plan required", tone: "waiting" },
        links: [{ label: "Tasks", href: surfaceHref("tasks") }],
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
        // Approved media is useful evidence, but it is not a final-delivery
        // record. Keep the phase unavailable until release authority exists.
        href: null,
        progress: deliveryProgress,
        progressLabel: assets.length > 0
          ? `${approvedCount} of ${assets.length} approved media`
          : "No media records",
        status: {
          label: "Not configured",
          tone: "neutral",
        },
        agentStatus: { label: "Unavailable", tone: "neutral" },
        humanStatus: approvedCount > 0
          ? { label: "Delivery setup required", tone: "waiting" }
          : { label: "Waiting on approval", tone: "waiting" },
        links: [
          { label: "Asset library", href: `/library${demoMode ? "?demo=1" : ""}` },
        ],
      },
    };
  }, [
    activeAsset?.id,
    activeProductionTasks.length,
    approvedCount,
    assets,
    completedProductionTaskCount,
    demoMode,
    inReviewCount,
    preProductionProgress,
    productionPlan.error,
    productionPlan.loading,
    productionPlan.ready,
    project.id,
    uploadStatus,
    uploading,
  ]);
  const filteredAssets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return assets.filter((asset) => asset.title.toLowerCase().includes(query)).slice(0, 5);
  }, [assets, searchQuery]);

  useEffect(() => {
    if (demoMode || !activeAssetRecordId) {
      setLiveVersions([]);
      setLiveVersionAssetId(null);
      return;
    }

    const assetId = activeAssetRecordId;
    const controller = new AbortController();
    let current = true;
    setLiveVersions([]);
    setLiveVersionAssetId(null);
    setReviewDataError("");

    fetch(`/api/assets/${encodeURIComponent(assetId)}/versions`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Version history could not be loaded.");
        const payload = await response.json() as { items?: unknown[] };
        if (!current) return;
        setLiveVersions((payload.items ?? []).filter(isReviewVersion));
        setLiveVersionAssetId(assetId);
      })
      .catch((error: unknown) => {
        if (!current || error instanceof DOMException && error.name === "AbortError") return;
        setLiveVersions([]);
        setLiveVersionAssetId(assetId);
        setReviewDataError(error instanceof Error ? error.message : "Version history could not be loaded.");
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [activeAssetRecordId, demoMode]);

  const loadLiveAssetData = useCallback(async () => {
    if (demoMode || !activeAsset || !selectedLiveVersion) {
      liveAssetRequestRef.current += 1;
      setLiveAssetDataId(null);
      setLiveAssetDataVersionId(null);
      setLiveComments([]);
      setLiveCutMarkers([]);
      setLiveShareLinks([]);
      return;
    }

    const assetId = activeAsset.id;
    const versionId = selectedLiveVersion.id;
    const requestId = liveAssetRequestRef.current + 1;
    liveAssetRequestRef.current = requestId;
    setLiveAssetDataId(null);
    setLiveAssetDataVersionId(null);
    setLiveComments([]);
    setLiveCutMarkers([]);
    setLiveShareLinks([]);
    setReviewDataError("");

    const versionQuery = `version_id=${encodeURIComponent(versionId)}`;
    let commentsResponse: Response;
    let decisionsResponse: Response;
    let linksResponse: Response;
    try {
      [commentsResponse, decisionsResponse, linksResponse] = await Promise.all([
        fetch(`/api/assets/${assetId}/comments?${versionQuery}`, { cache: "no-store" }),
        fetch(`/api/assets/${assetId}/edit-decisions?${versionQuery}`, { cache: "no-store" }),
        fetch(`/api/assets/${assetId}/share`, { cache: "no-store" }),
      ]);
    } catch {
      if (liveAssetRequestRef.current === requestId) {
        setReviewDataError("Comments and edit decisions could not be loaded. Try again before changing this review.");
      }
      return;
    }
    if (!commentsResponse.ok || !decisionsResponse.ok) {
      if (liveAssetRequestRef.current === requestId) {
        setReviewDataError("Comments and edit decisions could not be loaded. Try again before changing this review.");
      }
      return;
    }
    const [commentsPayload, decisionsPayload, linksPayload] = await Promise.all([
      commentsResponse.json(),
      decisionsResponse.json(),
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
          version_id: versionId,
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
    setLiveAssetDataVersionId(versionId);
  }, [activeAsset, demoMode, project.id, selectedLiveVersion]);

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

  const handleGlobalReviewShortcut = useEffectEvent((event: KeyboardEvent, insideControl: boolean) => (
    handleReviewShortcutEvent(event, insideControl, event.isComposing)
  ));

  useEffect(() => {
    if (!compactViewport || !mobileDockOpen || effectiveDockTab !== "review" || !mobileDockTarget) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const target = mobileDockTarget === "comments"
        ? commentsDockSectionRef.current
        : transcriptDockSectionRef.current;
      target?.scrollIntoView({ block: "start" });
      target?.focus({ preventScroll: true });
      setMobileDockTarget(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [compactViewport, effectiveDockTab, mobileDockOpen, mobileDockTarget]);

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
        && handleGlobalReviewShortcut(event, insideControl)
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
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    accountOpen,
    compactViewport,
    mobileDockOpen,
    mobileNavOpen,
    changeMode,
    setNotificationsOpen,
    toggleDock,
    toggleRail,
    activeAsset,
    activeSection,
  ]);

  function selectSection(section: CockpitSection) {
    if (reviewViewActive) setReviewViewActive(false);
    setLifecycleOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.delete("sequence");
    if (["overview", "media", "sequences"].includes(section)) {
      params.delete("asset");
      params.delete("version");
      setActiveAssetId("");
    }
    if (section === "overview") params.delete("surface");
    else params.set("surface", section);
    if (section !== "tasks") params.delete("plan");
    const query = params.toString();
    router.push(`/projects/${project.id}${query ? `?${query}` : ""}`);
    if (section === "overview") {
      setActiveSection("overview");
      setOverviewOpen(false);
    } else {
      setOverviewOpen(false);
      setActiveSection(section);
    }
    setMobileNavOpen(false);
    setMobileDockOpen(false);
  }

  function selectPlanWorkspace(mode: PlanWorkspaceMode) {
    setActivePlanWorkspace(mode);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.set("surface", "tasks");
    if (mode !== "tasks") params.set("plan", mode);
    else params.delete("plan");
    router.replace(`/projects/${project.id}?${params.toString()}`, { scroll: false });
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

  const selectAsset = useCallback((asset: MediaAsset) => {
    liveAssetRequestRef.current += 1;
    setLiveAssetDataId(null);
    setLiveAssetDataVersionId(null);
    setLiveComments([]);
    setLiveCutMarkers([]);
    setLiveShareLinks([]);
    setLiveVersions([]);
    setLiveVersionAssetId(null);
    setReviewDataError("");
    setActiveAssetId(asset.id);
    setCurrentTime(0);
    setNativeDuration(0);
    setIsPlaying(false);
    setSearchQuery("");
    if (typeof videoRef.current?.pause === "function") videoRef.current.pause();
    if (typeof videoRef.current?.load === "function") videoRef.current.load();
    setNativeVideoActive(false);
    setSimulatedPlayback(false);
    setCommentBody("");
    setPendingReviewComment(null);
    setSelectedCommentId(null);
    setReplyToCommentId(null);
    setResumeAfterComment(false);
  }, []);

  useEffect(() => {
    if (!requestedAssetId) {
      if (activeAssetId) setActiveAssetId("");
      return;
    }
    if (requestedAssetId === activeAssetId) return;
    const requestedAsset = assets.find((asset) => asset.id === requestedAssetId);
    if (requestedAsset) selectAsset(requestedAsset);
  }, [activeAssetId, assets, requestedAssetId, selectAsset]);

  function openAssetWorkspace(asset: MediaAsset) {
    selectAsset(asset);
    setActiveSection("overview");
    setOverviewOpen(false);
    setReviewViewActive(true);
    setMode("review");
    setDockTab("review");
    setMobileNavOpen(false);
    setMobileDockOpen(false);
    const params = new URLSearchParams();
    if (demoMode) params.set("demo", "1");
    params.set("asset", asset.id);
    params.set("view", "review");
    router.push(`/projects/${project.id}?${params.toString()}`);
  }

  function openSequenceLibrary(sequenceId?: string) {
    setActiveAssetId("");
    setReviewViewActive(false);
    setActiveSection("sequences");
    setOverviewOpen(false);
    setMobileNavOpen(false);
    setMobileDockOpen(false);
    const params = new URLSearchParams();
    if (demoMode) params.set("demo", "1");
    params.set("surface", "sequences");
    if (sequenceId) params.set("sequence", sequenceId);
    router.push(`/projects/${project.id}?${params.toString()}`);
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
    if (activeVersionId) params.set("version", activeVersionId);
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

  function selectReviewVersion(versionId: string) {
    if (!activeAsset || demoMode || !versionId || versionId === activeVersionId) return;
    setCurrentTime(0);
    setNativeDuration(0);
    setIsPlaying(false);
    setNativeVideoActive(false);
    setSimulatedPlayback(false);
    setCommentBody("");
    setPendingReviewComment(null);
    setSelectedCommentId(null);
    setReplyToCommentId(null);
    setResumeAfterComment(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("asset", activeAsset.id);
    params.set("version", versionId);
    params.set("view", "review");
    router.push(`/projects/${project.id}?${params.toString()}`);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (currentTime >= previewDuration) seekTo(0);
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

  function selectReviewComment(comment: DemoReviewComment, seek = true) {
    const rootComment = comment.parent_id
      ? comments.find((candidate) => candidate.id === comment.parent_id) ?? comment
      : comment;
    setSelectedCommentId(rootComment.id);
    if (seek) seekTo(rootComment.time_seconds);
  }

  function openReviewCommentComposer({
    anchor,
    pin,
    replyToId = null,
    selectedThreadId = null,
    timeSeconds,
  }: {
    anchor: { x: number; y: number };
    pin: { x: number; y: number } | null;
    replyToId?: string | null;
    selectedThreadId?: string | null;
    timeSeconds: number;
  }) {
    if (!activeAsset || !activeVersionId) return false;

    if (pendingReviewComment) {
      window.requestAnimationFrame(() => commentInputRef.current?.focus());
      return false;
    }

    if (typeof videoRef.current?.pause === "function") videoRef.current.pause();
    setIsPlaying(false);
    setResumeAfterComment(true);
    setSelectedCommentId(selectedThreadId ?? replyToId);
    setReplyToCommentId(replyToId);
    setPendingReviewComment({ anchor, pin, timeSeconds });
    window.requestAnimationFrame(() => commentInputRef.current?.focus());
    return true;
  }

  function dismissReviewCommentComposer() {
    setCommentBody("");
    setPendingReviewComment(null);
    setReplyToCommentId(null);
    setResumeAfterComment(false);
    window.requestAnimationFrame(() => videoFrameRef.current?.focus({ preventScroll: true }));
  }

  function openReviewCommentAtPlayhead() {
    openReviewCommentComposer({
      anchor: { x: 18, y: 72 },
      pin: null,
      timeSeconds: currentTime,
    });
  }

  function handleReviewFrameClick(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeAsset || !activeVersionId) return;
    // The annotation overlay excludes the playback controls, but pins are positioned
    // against the full player frame. Measure against that shared coordinate system.
    const rect = videoFrameRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    openReviewCommentComposer({
      anchor: { x, y },
      pin: { x, y },
      timeSeconds: currentTime,
    });
  }

  async function addCutDecision() {
    if (!activeAsset || !activeVersionId) return;
    if (demoMode) {
      addDemoReviewCutMarker({
        projectId: project.id,
        assetId: activeAsset.id,
        versionId: activeVersionId,
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
        version_id: activeVersionId,
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
        version_id: activeVersionId,
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
    if (!activeAsset || !activeVersionId || !commentBody.trim() || commentSubmitting) return;
    const shouldResume = resumeAfterComment;
    const submittedBody = commentBody.trim();
    const submittedTime = replyToComment?.time_seconds ?? pendingReviewComment?.timeSeconds ?? currentTime;
    let createdComment: DemoReviewComment | null = null;
    if (demoMode) {
      createdComment = addDemoReviewComment({
        projectId: project.id,
        assetId: activeAsset.id,
        versionId: activeVersionId,
        parentId: replyToComment?.id ?? null,
        reviewInviteId: replyToComment?.review_invite_id ?? undefined,
        visibility: replyToComment?.visibility ?? "internal",
        body: submittedBody,
        timeSeconds: submittedTime,
        pinX: replyToComment ? undefined : pendingReviewComment?.pin?.x,
        pinY: replyToComment ? undefined : pendingReviewComment?.pin?.y,
      });
      if (!createdComment) {
        setToast("The comment could not be saved.");
        return;
      }
    } else {
      setCommentSubmitting(true);
      try {
        const response = await fetch(`/api/assets/${activeAsset.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: submittedBody,
            version_id: activeVersionId,
            parent_id: replyToComment?.id ?? undefined,
            timecode_seconds: submittedTime,
            pin_x: replyToComment ? undefined : reviewPinPercentToNormalized(pendingReviewComment?.pin?.x),
            pin_y: replyToComment ? undefined : reviewPinPercentToNormalized(pendingReviewComment?.pin?.y),
          }),
        });
        if (!response.ok) {
          setToast("The comment could not be saved.");
          return;
        }
        const created = (await response.json()) as Record<string, unknown>;
        const normalizedCreated = normalizeLiveComment(created, project.id, activeAsset.id);
        createdComment = normalizedCreated;
        setLiveComments((current) => [
          ...current,
          normalizedCreated,
        ]);
      } catch {
        setToast("The comment could not be saved.");
        return;
      } finally {
        setCommentSubmitting(false);
      }
    }
    setCommentBody("");
    setPendingReviewComment(null);
    setReplyToCommentId(null);
    setResumeAfterComment(false);
    setCommentStatus("open");
    setSelectedCommentId(
      replyToComment?.parent_id
      ?? replyToComment?.id
      ?? createdComment?.id
      ?? null,
    );
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

  function startReply(comment: DemoReviewComment) {
    if (
      !activeVersionId ||
      !canReplyToReviewThread({
        audience: comment.visibility ?? "internal",
        actorRole: workspaceRole,
      })
    ) {
      return;
    }
    const opened = openReviewCommentComposer({
      anchor: { x: 18, y: 72 },
      pin: null,
      replyToId: comment.id,
      selectedThreadId: comment.parent_id ?? comment.id,
      timeSeconds: comment.time_seconds,
    });
    if (opened) seekTo(comment.time_seconds);
  }

  async function toggleCommentStatus(comment: DemoReviewComment) {
    if (!activeAsset || !activeVersionId) return;
    setSelectedCommentId(comment.parent_id ?? comment.id);
    if (demoMode) {
      toggleDemoReviewCommentResolved(comment.id);
      return;
    }
    const status = comment.status === "open" ? "resolved" : "open";
    const response = await fetch(`/api/assets/${activeAsset.id}/comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: comment.id, status, version_id: activeVersionId }),
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
    setAccountOpen(false);
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    }).catch(() => null);
    if (!response?.ok) {
      setToast("Sign out did not complete. Try again.");
      return;
    }
    window.location.href = "/login";
  }

  function requestUpload() {
    if (!canUpload || uploading) return;
    onUpload();
  }

  async function initializeProductionPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const snapshot = productionPlan.snapshot;
    const title = planTitle.trim();
    const summary = planSummary.trim();
    const firstTaskTitle = firstPlanTaskTitle.trim();
    if (!snapshot || snapshot.plan || !snapshot.canInitialize) {
      setToast("Plan setup is unavailable. Reload the project and try again.");
      return;
    }
    if (!title || !firstTaskTitle) {
      setToast("Enter a plan title and first task.");
      return;
    }

    const fingerprint = JSON.stringify({ title, summary, firstTaskTitle });
    let request = planInitializationRequestRef.current;
    if (!request || request.fingerprint !== fingerprint) {
      const requestId = crypto.randomUUID();
      request = {
        fingerprint,
        requestId,
        clientTaskId: `initial-plan-${requestId}`,
      };
      planInitializationRequestRef.current = request;
    }

    const initialized = await productionPlan.initializePlan({
      expectedPlanRevision: 0,
      requestId: request.requestId,
      title,
      summary: summary || null,
      tasks: [{
        clientTaskId: request.clientTaskId,
        title: firstTaskTitle,
        description: null,
        priority: "normal",
        assigneeId: null,
        dueDate: null,
        sourceKind: "manual",
        sourceRef: null,
        dependsOnClientTaskIds: [],
      }],
    });
    if (initialized) setToast("Production plan initialized");
  }

  function openShareControls() {
    if (!canShare || !activeAsset) return;
    setShareOpen(true);
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
      onSelect: () => openAssetWorkspace(asset),
    })),
    {
      id: "action-upload",
      label: "Upload media",
      description: "Add media to this project",
      keywords: ["add", "ingest", "file"],
      section: "Actions",
      icon: Upload,
      disabled: uploading || !canUpload,
      onSelect: requestUpload,
    },
    {
      id: "action-share",
      label: "Share review",
      description: "Create a permissioned review link",
      keywords: ["client", "link", "review"],
      section: "Actions",
      icon: Share2,
      disabled: !activeAsset || !canShare,
      onSelect: openShareControls,
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
          <CoProductionBrand
            className={styles.brandLockup}
            source={brandLogoPath}
            variant={brandLogoPath ? "horizontal" : "wordmark"}
            priority
          />
          <CoProductionBrand className={styles.brandMark} source={brandLogoPath} variant="compact-mark" label="Co-VideoPro" />
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
                <button key={asset.id} type="button" onClick={() => openAssetWorkspace(asset)}>
                  {asset.thumbnail_url || demoMode ? (
                    <Image
                      src={asset.thumbnail_url ?? "/demo/ceraweek-speaker.jpg"}
                      alt=""
                      width={46}
                      height={30}
                      unoptimized
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
              openShareControls();
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
              requestUpload();
            }}
            disabled={uploading || !canUpload}
            aria-label={uploading ? "Uploading media" : "Upload media"}
          >
            <Upload size={18} /> <span>{uploading ? "Uploading" : "Upload"}</span>
          </button>
          <NotificationBell
            projectId={project.id}
            wrapperClassName="cockpit-popover-anchor"
            buttonClassName="cockpit-icon-button"
            onOpenChange={(open) => {
              if (!open) return;
              setAccountOpen(false);
              setLifecycleOpen(false);
            }}
          />
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
              {profileAvatarPath ? (
                <Image src={profileAvatarPath} alt="" width={38} height={38} unoptimized />
              ) : avatarInitials(viewerName) || "CC"}
            </button>
            {accountOpen ? (
              <div id="cockpit-account-menu" className="cockpit-popover cockpit-account" role="menu">
                <strong>{viewerName}</strong>
                <small>{viewerEmail}</small>
                <Link href={demoMode ? "/settings?demo=1" : "/settings"} role="menuitem">Account settings</Link>
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
          activeAsset ? (
            <>
            <div className={`cockpit-overview-grid ${dockVisible ? "" : styles.overviewWithoutDock}`}>
              <div className="cockpit-center-column">
                <div className="cockpit-section-heading">
                  <h2>{activeAsset ? "Latest review" : "Review workspace"}</h2>
                  {activeAsset ? (
                    <>
                      <span>{selectedLiveVersion ? `Version ${selectedLiveVersion.version_number}` : versionLabel(activeAsset, demoMode)}</span>
                      {!demoMode ? (
                        <select
                          value={activeVersionId ?? ""}
                          onChange={(event) => selectReviewVersion(event.target.value)}
                          disabled={!versionListReady || liveVersions.length === 0}
                          aria-label="Review media version"
                        >
                          {!versionListReady ? <option value="">Loading versions...</option> : null}
                          {liveVersions.map((version) => (
                            <option key={version.id} value={version.id}>
                              Version {version.version_number}{version.is_current ? " (current)" : ""}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <select
                        value={activeAsset.id}
                        onChange={(event) => {
                          const asset = assets.find((candidate) => candidate.id === event.target.value);
                          if (asset) openAssetWorkspace(asset);
                        }}
                        aria-label="Latest review media"
                      >
                        {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
                      </select>
                    </>
                  ) : (
                    <button className="cockpit-action-primary cockpit-empty-upload" type="button" onClick={requestUpload} disabled={!canUpload || uploading}>
                      <Upload size={15} /> Upload media
                    </button>
                  )}
                </div>

                {activeAsset && (reviewViewActive || effectiveMode === "focus") ? (
                  <div className="cockpit-focus-strip" aria-label="Current review summary">
                    <span><strong>Status</strong><em>{formatAssetStatus(activeAsset.status)}</em></span>
                    <span><strong>Open notes</strong><em>{openCommentCount}</em></span>
                    <span><strong>Approvals</strong><em>{approvalSummary}</em></span>
                    <span><strong>Timecode</strong><em>{formatShortClock(currentTime)} / {formatShortClock(previewDuration)}</em></span>
                    <span><strong>Step</strong><em>{seekStepSeconds}s</em></span>
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
                      {comments
                        .filter((comment) => !comment.parent_id && comment.pin_x != null && comment.pin_y != null)
                        .map((comment, index) => (
                        <button
                          key={comment.id}
                          type="button"
                          className="cockpit-frame-pin"
                          data-selected={comment.id === selectedCommentId ? "true" : undefined}
                          style={{ left: `${comment.pin_x}%`, top: `${comment.pin_y}%` }}
                          onClick={() => selectReviewComment(comment)}
                          aria-current={comment.id === selectedCommentId ? "true" : undefined}
                          aria-label={`Jump to pinned comment ${index + 1} at ${formatShortClock(comment.time_seconds)}`}
                          title={comment.body}
                        >
                          {index + 1}
                        </button>
                      ))}
                      {pendingReviewComment ? (
                        <>
                          {pendingReviewComment.pin ? (
                            <span
                              className="cockpit-frame-pin pending"
                              style={{ left: `${pendingReviewComment.pin.x}%`, top: `${pendingReviewComment.pin.y}%` }}
                              aria-hidden="true"
                            >
                              <MapPin size={14} fill="currentColor" />
                            </span>
                          ) : null}
                          <div
                            className="cockpit-inline-comment"
                            data-horizontal={pendingReviewComment.anchor.x > 56 ? "left" : "right"}
                            data-vertical={pendingReviewComment.anchor.y > 56 ? "above" : "below"}
                            style={{ left: `${pendingReviewComment.anchor.x}%`, top: `${pendingReviewComment.anchor.y}%` }}
                            role="dialog"
                            aria-label={
                              replyToComment
                                ? `Reply to ${replyToComment.author_name} at ${formatClock(pendingReviewComment.timeSeconds)}`
                                : `Add a comment at ${formatClock(pendingReviewComment.timeSeconds)}`
                            }
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            <header>
                              <strong>{replyToComment ? `Reply to ${replyToComment.author_name}` : viewerName}</strong>
                              <time>{formatClock(pendingReviewComment.timeSeconds)}</time>
                              <button
                                type="button"
                                onClick={dismissReviewCommentComposer}
                                aria-label="Cancel comment"
                                title="Cancel comment"
                              >
                                <X size={14} />
                              </button>
                            </header>
                            <div>
                              <input
                                ref={commentInputRef}
                                value={commentBody}
                                onChange={(event) => setCommentBody(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void submitComment();
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    dismissReviewCommentComposer();
                                  }
                                }}
                                placeholder={replyToComment ? `Reply to ${replyToComment.author_name}` : "Describe what should change"}
                                aria-label={replyToComment ? `Reply to ${replyToComment.author_name}` : "Comment"}
                              />
                              <button
                                type="button"
                                onClick={() => void submitComment()}
                                disabled={!commentBody.trim() || commentSubmitting}
                                aria-label="Send comment and continue playback"
                                title="Send comment and continue playback"
                              >
                                {commentSubmitting ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
                              </button>
                            </div>
                          </div>
                        </>
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
                            window.localStorage.setItem("co-deliver-review-seek-step", String(next));
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
                          onClick={openReviewCommentAtPlayhead}
                          disabled={!activeVersionId}
                          aria-label={`Add a comment at ${formatClock(currentTime)}`}
                          title="Add comment at current time"
                        >
                          <MessageSquarePlus size={18} />
                        </button>
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

                    {!activeVersionId ? (
                      <p className="cockpit-review-feedback" role="status">
                        {reviewDataError || (versionUnavailable
                          ? "This media version is unavailable. Choose another version before adding a review note."
                          : "Loading the exact media version for this review.")}
                      </p>
                    ) : null}
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
                    comments={comments
                      .filter((comment) => !comment.parent_id)
                      .map((comment) => ({
                      id: comment.id,
                      timeSeconds: comment.time_seconds,
                      label: comment.body,
                      status: comment.status,
                    }))}
                    selectedCommentId={selectedCommentId}
                    cutDecisions={cutMarkers.map((marker) => ({
                      id: marker.id,
                      timeSeconds: marker.time_seconds,
                      status: "proposed" as const,
                    }))}
                    seekStepSeconds={seekStepSeconds}
                    onSeek={seekTo}
                    onMarkerActivate={(marker) => {
                      const comment = comments.find((candidate) => candidate.id === marker.id);
                      if (comment) selectReviewComment(comment, false);
                    }}
                  />
                ) : null}

                {activeAsset ? (
                  <div className="cockpit-mobile-review-strip" aria-label="Mobile review tools">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileDockTarget("comments");
                        selectDockTab("review");
                      }}
                    >
                      <MessageSquareText size={15} />
                      <span>Comments</span>
                    </button>
                    <button type="button" onClick={openShareControls} disabled={!canShare}>
                      <Share2 size={15} />
                      <span>Share</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileDockTarget("transcript");
                        selectDockTab("review");
                      }}
                    >
                      <Info size={15} />
                      <span>Transcript</span>
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
                    reviewCount={openCommentCount}
                    versionCount={activeAsset?.version_count ?? 0}
                    onTabChange={selectDockTab}
                    onClose={closeOperatorDock}
                  >
                    {!activeAsset ? (
                      <div className={styles.emptyDock}>
                        <Upload size={22} />
                        <strong>No media yet</strong>
                        <p>Upload the first file to start review, comments, versions, and approvals.</p>
                        <button className="cockpit-rail-primary" type="button" onClick={requestUpload} disabled={!canUpload || uploading}>
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
                              <button className="cockpit-rail-secondary" type="button" onClick={openShareControls} disabled={!canShare}>
                                Start review
                              </button>
                            </>
                          )}
                        </section>

                        <section ref={commentsDockSectionRef} className={styles.dockSection} tabIndex={-1}>
                          <header><h2>Comments</h2><button type="button" onClick={() => selectSection("reviews")}>View all</button></header>
                          <div className="cockpit-comment-tabs">
                            <button type="button" className={commentStatus === "open" ? "active" : ""} onClick={() => setCommentStatus("open")}>Open ({openCommentCount})</button>
                            <button type="button" className={commentStatus === "resolved" ? "active" : ""} onClick={() => setCommentStatus("resolved")}>Resolved ({resolvedCommentCount})</button>
                          </div>
                          <div className="cockpit-comment-list">
                            {visibleCommentThreads.slice(0, 4).map(({ comment, replies }) => (
                              <article
                                className="cockpit-comment-thread"
                                key={comment.id}
                                data-selected={comment.id === selectedCommentId ? "true" : undefined}
                              >
                                <div className="cockpit-comment-row">
                                  <button
                                    type="button"
                                    onClick={() => selectReviewComment(comment)}
                                    aria-current={comment.id === selectedCommentId ? "true" : undefined}
                                  >
                                    {formatShortClock(comment.time_seconds)}
                                  </button>
                                  <div><strong>{comment.author_name}</strong><p>{comment.body}</p></div>
                                  <div className="cockpit-comment-actions">
                                    {canReplyToReviewThread({
                                      audience: comment.visibility ?? "internal",
                                      actorRole: workspaceRole,
                                    }) ? (
                                      <button
                                        type="button"
                                        className="cockpit-reply"
                                        onClick={() => startReply(comment)}
                                        title={`Reply to ${comment.author_name}`}
                                        aria-label={`Reply to ${comment.author_name}`}
                                      >
                                        <MessageSquareText size={14} />
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="cockpit-resolve"
                                      onClick={() => void toggleCommentStatus(comment)}
                                      title={comment.status === "open" ? "Resolve comment" : "Reopen comment"}
                                      aria-label={comment.status === "open" ? "Resolve comment" : "Reopen comment"}
                                    >
                                      {comment.status === "open" ? <Circle size={14} /> : <Check size={14} />}
                                    </button>
                                  </div>
                                </div>
                                {replies.length > 0 ? (
                                  <div className="cockpit-comment-replies">
                                    {replies.map((reply) => (
                                      <div className="cockpit-comment-reply" key={reply.id}>
                                        <button type="button" onClick={() => selectReviewComment(reply)}>{formatShortClock(reply.time_seconds)}</button>
                                        <div><strong>{reply.author_name}</strong><p>{reply.body}</p></div>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </article>
                            ))}
                            {visibleCommentThreads.length === 0 ? <p className="cockpit-rail-empty">No {commentStatus} comments.</p> : null}
                          </div>
                          <button
                            className="cockpit-rail-secondary"
                            type="button"
                            onClick={() => {
                              setMobileDockOpen(false);
                              openReviewCommentAtPlayhead();
                            }}
                          >
                            <MessageSquarePlus size={14} /> Add comment
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

                        <section ref={transcriptDockSectionRef} className={styles.dockSection} tabIndex={-1}>
                          <header><h2>Transcript & cleanup</h2><button type="button" onClick={() => selectSection("metadata")}>Details</button></header>
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
                            <div><dt>Asset link</dt><dd>{activeAssetLinkCount > 0 ? `${activeAssetLinkCount} active` : "Not created"}</dd></div>
                            <div><dt>Batch share</dt><dd>{batchShareStatus}</dd></div>
                            <div><dt>Downloads</dt><dd>{downloadShareLinkCount > 0 ? `${downloadShareLinkCount} enabled` : workspaceRole === "viewer" ? "Restricted" : "Off by default"}</dd></div>
                            <div><dt>Expiry</dt><dd>{expiringShareLinkCount > 0 ? `${expiringShareLinkCount} expiring` : "Set at create"}</dd></div>
                            <div><dt>Password gate</dt><dd>{passwordProtectedShareLinkCount > 0 ? `${passwordProtectedShareLinkCount} protected` : "Optional at create"}</dd></div>
                          </dl>
                          <button className="cockpit-rail-secondary" type="button" onClick={openShareControls} disabled={!canShare}>
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
                        onSelectAsset={openAssetWorkspace}
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
                            {canViewProjectOrigin ? <div><dt>Project origin</dt><dd>{projectOriginLoading ? "Checking…" : projectOrigin?.authority ?? "Unavailable"}</dd></div> : null}
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
                              <div><strong>{item.actor_name} {formatActivityAction(item.action)}</strong><small>{item.details.asset_title ?? project.name}</small></div>
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
            <ProjectOverviewHome
              project={project}
              assets={assets}
              folders={folders}
              activity={projectActivity}
              coverPath={demoMode ? workspace.settings.brand.coverPath : "/brand/co-videopro-project-cover.jpg"}
              canUpload={canUpload}
              uploading={uploading}
              demoMode={demoMode}
              onUpload={requestUpload}
              onOpenAsset={openAssetWorkspace}
              onOpenSequence={openSequenceLibrary}
            />
          )
        ) : (
          <section className={activeSection === "sequences" ? styles.sequenceSurface : "cockpit-secondary-view"}>
            {activeSection === "media" ? (
              <>
                <header><div><h2>Project media</h2><p>Versions, status, comments, and review readiness in one place.</p></div><button type="button" onClick={requestUpload} disabled={!canUpload || uploading}><Upload size={16} /> Upload media</button></header>
                <div className="cockpit-media-grid">
                  {assets.map((asset) => (
                    <article key={asset.id}>
                      <button type="button" className="cockpit-media-thumb" onClick={() => openAssetWorkspace(asset)}>
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
              <ProjectSequenceLibrary
                project={project}
                assets={assets}
                folders={folders}
                selectedSequenceId={selectedSequenceId}
                demoMode={demoMode}
                canUpload={canUpload}
                uploading={uploading}
                onUpload={requestUpload}
                onOpenAsset={openAssetWorkspace}
                onSelectSequence={openSequenceLibrary}
              />
            ) : null}

            {activeSection === "reviews" ? (
              <>
                <header><div><h2>Review links</h2><p>Active and revocable links for client review, approval, and delivery readiness.</p></div><button type="button" onClick={activeAsset ? openShareControls : requestUpload} disabled={activeAsset ? !canShare : !canUpload || uploading}>{activeAsset ? <Share2 size={16} /> : <Upload size={16} />} {activeAsset ? "Create link" : "Upload media"}</button></header>
                <div className="cockpit-share-readiness-grid" aria-label="Share readiness">
                  <article>
                    <span>Selected asset</span>
                    <strong>{activeAsset?.title ?? "No asset selected"}</strong>
                    <small>{activeAssetLinkCount > 0 ? `${activeAssetLinkCount} active link${activeAssetLinkCount === 1 ? "" : "s"}` : "No active asset link"}</small>
                  </article>
                  <article>
                    <span>Share scope</span>
                    <strong>{shareScopeLabel}</strong>
                    <small>{batchShareStatus}</small>
                  </article>
                  <article>
                    <span>Authority</span>
                    <strong>{activeProjectLinks.length > 0 ? `${activeProjectLinks.length} active` : "No active links"}</strong>
                    <small>{downloadShareLinkCount} download-enabled · {identityGatedShareLinkCount} identity-gated</small>
                  </article>
                  <article>
                    <span>Expiry / password</span>
                    <strong>{expiringShareLinkCount > 0 ? `${expiringShareLinkCount} expiring` : "Expiry set on create"}</strong>
                    <small>{passwordProtectedShareLinkCount} password-protected</small>
                  </article>
                </div>
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

            {activeSection === "tasks" ? (
              <>
                <header>
                  <div>
                    <h2>Plan</h2>
                    <p>Approved intent, scripts, shots, schedules, and production tasks stay connected to this project.</p>
                  </div>
                  <div className={styles.planHeaderControls}>
                    <div
                      className={styles.planWorkspaceSwitcher}
                      role="group"
                      aria-label="Plan workspace"
                    >
                      <button
                        type="button"
                        aria-pressed={activePlanWorkspace === "script"}
                        onClick={() => selectPlanWorkspace("script")}
                      >
                        Script
                      </button>
                      <button
                        type="button"
                        aria-pressed={activePlanWorkspace === "shots"}
                        onClick={() => selectPlanWorkspace("shots")}
                      >
                        Shots
                      </button>
                      <button
                        type="button"
                        aria-pressed={activePlanWorkspace === "tasks"}
                        onClick={() => selectPlanWorkspace("tasks")}
                      >
                        Tasks
                      </button>
                      <button
                        type="button"
                        aria-pressed={activePlanWorkspace === "schedule"}
                        onClick={() => selectPlanWorkspace("schedule")}
                      >
                        Schedule
                      </button>
                      <button
                        type="button"
                        aria-pressed={activePlanWorkspace === "call-sheet"}
                        onClick={() => selectPlanWorkspace("call-sheet")}
                      >
                        Call sheet
                      </button>
                    </div>
                    {activePlanWorkspace === "tasks" && projectTasks.length > 0 ? (
                      <span className="cockpit-task-progress">
                        {projectTasks.filter((task) => task.completed).length}/{projectTasks.length} complete
                      </span>
                    ) : null}
                  </div>
                </header>
                {canViewProjectBrief && projectBriefState === "loading" ? (
                  <p className={styles.approvedBriefStatus} role="status">
                    Loading approved brief…
                  </p>
                ) : canViewProjectBrief && projectBriefState === "unavailable" ? (
                  <p className={styles.approvedBriefStatus} role="status">
                    Approved brief is temporarily unavailable.
                  </p>
                ) : projectBrief ? (
                  <ApprovedProjectBrief brief={projectBrief} />
                ) : null}
                {activePlanWorkspace === "script" ? (
                  <ProjectScriptWorkspace
                    projectId={project.id}
                    projectName={project.name}
                    demoMode={demoMode}
                    workspaceRole={workspaceRole}
                    onPlanMaterialized={async () => {
                      if (!demoMode) await productionPlan.reload();
                      selectPlanWorkspace("tasks");
                      setToast("Production tasks activated from the approved script");
                    }}
                  />
                ) : activePlanWorkspace === "shots" ? (
                  <ProjectShotPlanWorkspace
                    projectId={project.id}
                    projectName={project.name}
                    demoMode={demoMode}
                    workspaceRole={workspaceRole}
                  />
                ) : activePlanWorkspace === "schedule" ? (
                  <ProjectProductionScheduleWorkspace
                    projectId={project.id}
                    projectName={project.name}
                    demoMode={demoMode}
                    workspaceRole={workspaceRole}
                  />
                ) : activePlanWorkspace === "call-sheet" ? (
                  <ProjectCallSheetWorkspace
                    projectId={project.id}
                    projectName={project.name}
                    demoMode={demoMode}
                    workspaceRole={workspaceRole}
                  />
                ) : (
                  <>
                {!demoMode && productionPlan.error ? (
                  <div className="cockpit-task-alert" role="alert">
                    <AlertTriangle size={17} />
                    <span>{productionPlan.error}</span>
                    <button type="button" onClick={() => void productionPlan.reload()}>Retry</button>
                  </div>
                ) : null}
                <p className="cockpit-sr-only" aria-live="polite">
                  {productionPlan.announcement}
                </p>
                {!demoMode && productionPlan.loading && !productionPlan.ready ? (
                  <ul className="cockpit-task-list" aria-label="Loading production tasks">
                    {[0, 1, 2].map((item) => (
                      <li className="cockpit-task-skeleton" key={item} aria-hidden="true">
                        <span /><span /><span />
                      </li>
                    ))}
                  </ul>
                ) : projectTasks.length > 0 ? (
                  <ul className="cockpit-task-list" aria-label="Production tasks">
                    {projectTasks.map((task) => {
                      const productionTask = productionTaskById.get(task.id);
                      const pending = !demoMode && productionPlan.pendingTaskIds.has(task.id);
                      const canToggle = demoMode || Boolean(
                        productionPlan.snapshot?.canUpdateStatus &&
                        productionTask?.status !== "cancelled",
                      );
                      const detailId = `task-${task.id}-detail`;
                      return (
                        <li key={task.id} aria-busy={pending || undefined}>
                          <label>
                            <input
                              type="checkbox"
                              checked={task.completed}
                              disabled={pending || !canToggle}
                              aria-describedby={detailId}
                              onChange={() => {
                                if (demoMode) {
                                  toggleDemoTask(task.id);
                                  return;
                                }
                                void productionPlan.setTaskStatus(
                                  task.id,
                                  task.completed ? "todo" : "completed",
                                );
                              }}
                            />
                            <span>
                              <strong>{task.title}</strong>
                              <small id={detailId}>
                                {task.assignee_name} · {task.due_label}
                                {productionTask ? ` · ${productionTask.status.replaceAll("_", " ")}` : ""}
                              </small>
                            </span>
                            {pending ? (
                              <LoaderCircle className="cockpit-task-spinner" size={17} aria-label="Saving task" />
                            ) : (
                              <Clock3 size={17} aria-hidden="true" />
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : canInitializeProductionPlan ? (
                  <form
                    className="cockpit-plan-initializer"
                    onSubmit={initializeProductionPlan}
                    aria-busy={productionPlan.initializing || undefined}
                  >
                    <div className="cockpit-plan-initializer-heading">
                      <h3>Initialize production plan</h3>
                      <p>No governed plan exists for this production.</p>
                    </div>
                    <div className="cockpit-plan-initializer-fields">
                      <label>
                        <span>Plan title</span>
                        <input
                          type="text"
                          value={planTitle}
                          onChange={(event) => setPlanTitle(event.target.value)}
                          maxLength={240}
                          required
                        />
                      </label>
                      <label>
                        <span>First task</span>
                        <input
                          type="text"
                          value={firstPlanTaskTitle}
                          onChange={(event) => setFirstPlanTaskTitle(event.target.value)}
                          maxLength={240}
                          required
                        />
                      </label>
                      <label className="cockpit-plan-initializer-summary">
                        <span>Scope note</span>
                        <textarea
                          value={planSummary}
                          onChange={(event) => setPlanSummary(event.target.value)}
                          maxLength={4000}
                          rows={3}
                        />
                      </label>
                    </div>
                    <div className="cockpit-plan-initializer-actions">
                      <button type="submit" disabled={productionPlan.initializing}>
                        {productionPlan.initializing ? <LoaderCircle size={15} aria-hidden="true" /> : null}
                        {productionPlan.initializing ? "Initializing" : "Initialize plan"}
                      </button>
                    </div>
                  </form>
                ) : productionPlan.ready || demoMode ? (
                  <EmptyState
                    title="No tasks"
                    body={productionPlanNeedsProducer
                      ? "Plan setup requires a producer."
                      : "No governed plan is available for this project."}
                  />
                ) : null}
                  </>
                )}
              </>
            ) : null}

            {activeSection === "versions" ? (
              <>
                <header><div><h2>Version history</h2><p>All current project deliverables and revision depth.</p></div></header>
                <div className="cockpit-table-list">
                  {assets.map((asset) => <article key={asset.id}><span className="cockpit-list-icon"><History size={18} /></span><div><strong>{asset.title}</strong><small>Updated {timeAgo(asset.created_at)} · {asset.comment_count ?? 0} comments</small></div><span className="status-version">{asset.version_count ?? (demoMode ? 1 : "Not indexed")}</span><button type="button" onClick={() => openAssetWorkspace(asset)}>Review</button></article>)}
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
                  {canViewProjectOrigin ? (
                    <section>
                      <h3>Project origin</h3>
                      {projectOriginLoading ? (
                        <p className="cockpit-rail-empty">Checking project authority…</p>
                      ) : projectOrigin ? (
                        <dl>
                          <div><dt>Source</dt><dd>{projectOrigin.source}</dd></div>
                          <div><dt>Authority</dt><dd>{projectOrigin.authority}</dd></div>
                          <div><dt>Reference</dt><dd>{projectOrigin.reference}</dd></div>
                          <div><dt>Verification</dt><dd>{projectOrigin.verification}</dd></div>
                        </dl>
                      ) : (
                        <p className="cockpit-rail-empty">Project origin is unavailable.</p>
                      )}
                    </section>
                  ) : null}
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

      {uploading && uploadStatus ? (
        <div className="cockpit-upload-overlay" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="cockpit-upload-title" aria-live="polite">
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
              {uploadStatus.mode === "demo" ? <small>Preview mode uses browser-local media storage when available; production uses the configured CCNAS or cloud media authority.</small> : null}
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
