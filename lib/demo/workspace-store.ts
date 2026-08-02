"use client";

import { useSyncExternalStore } from "react";
import type { FolderNode } from "@/components/projects/FolderTree";
import type { MediaAsset } from "@/components/projects/MediaCard";
import {
  getShareIntentDefinition,
  resolveShareIntentDefaults,
  type ShareIntent,
} from "@/lib/sharing/share-intent";
import {
  buildInternalDemoAssetHref,
  demoAssets,
  demoFolders,
  demoProjects,
  type DemoProject,
} from "./workspace";
import { replyAudienceFromParent, replySourceFromParent } from "@/lib/review/thread-policy";
import type {
  ApprovalDecision,
  ApprovalStep,
  WorkflowMode,
} from "@/lib/types/codeliver";
import type { ProductionPlanTaskSeed } from "@/lib/preproduction/production-plan";

export const DEMO_WORKSPACE_STORAGE_KEY = "co-deliver.demo-workspace.v1";

export type DemoSharePermission = "view" | "comment" | "approve";
export type DemoShareNotificationChannel = "email" | "sms" | "imessage";

export interface DemoShareLink {
  id: string;
  token: string;
  type: "review";
  created_at: string;
  created_by_name: string;
  message: string;
  asset_ids: string[];
  media_count: number;
  invited_count: number;
  reviewer_name?: string | null;
  reviewer_email: string | null;
  permission: DemoSharePermission;
  share_intent?: ShareIntent;
  require_name: boolean;
  allow_comments: boolean;
  allow_downloads: boolean;
  watermark_enabled?: boolean;
  expires_at?: string | null;
  max_views?: number | null;
  password_protected?: boolean;
  batch_id?: string | null;
  notification_channels?: DemoShareNotificationChannel[];
  notification_status?: "links_only" | "dry_run";
  is_active: boolean;
  public_url: string;
}

export interface DemoActivityItem {
  id: string;
  action: string;
  actor_name: string;
  details: Record<string, string>;
  created_at: string;
  project_id: string;
  asset_id: string | null;
}

export interface DemoReviewComment {
  id: string;
  project_id: string;
  asset_id: string;
  version_id?: string | null;
  parent_id?: string | null;
  review_invite_id?: string | null;
  author_name: string;
  author_email?: string | null;
  body: string;
  time_seconds: number;
  frame_number?: number | null;
  pin_x?: number;
  pin_y?: number;
  visibility?: "internal" | "external";
  status: "open" | "resolved";
  resolved_at?: string | null;
  updated_at?: string | null;
  created_at: string;
}

export interface DemoPublicReviewState {
  project_id: string;
  asset_id: string;
  version_id: string;
  review_invite_id: string;
  approval_id: string | null;
  reviewer_name: string;
  reviewer_email: string;
  workflow_mode: WorkflowMode | null;
  approvals: ApprovalStep[];
  asset_status: string;
  active_approval_ids: string[];
  approval_access_message: string | null;
  updated_at: string;
}

export interface DemoReviewCompletion {
  id: string;
  project_id: string;
  asset_id: string;
  version_id: string;
  review_invite_id: string;
  reviewer_name: string;
  reviewer_email: string;
  note: string | null;
  completed_at: string;
}

export interface DemoReviewCutMarker {
  id: string;
  project_id: string;
  asset_id: string;
  version_id: string;
  time_seconds: number;
  created_at: string;
}

export interface DemoProjectTask {
  id: string;
  project_id: string;
  asset_id: string | null;
  title: string;
  assignee_name: string;
  due_label: string;
  completed: boolean;
}

export interface DemoApprovalStage {
  id: string;
  project_id: string;
  asset_id: string;
  name: string;
  reviewer_names: string[];
  approved_reviewer_names: string[];
  status: "pending" | "in_progress" | "approved";
}

export interface DemoNotificationChannel {
  enabled: boolean;
  comments: boolean;
  approvals: boolean;
  deliveries: boolean;
}

export interface DemoWorkspaceSettings {
  profile: {
    firstName: string;
    lastName: string;
    reviewerColor: string;
    avatarPath: string;
  };
  appearance: {
    darkMode: boolean;
    reducedMotion: boolean;
  };
  notifications: {
    inApp: DemoNotificationChannel;
    email: DemoNotificationChannel & { digest: "instant" | "hourly" | "daily" };
    sms: DemoNotificationChannel & { phone: string };
    imessage: DemoNotificationChannel & {
      relayName: string;
      status: "not_connected" | "dry_run" | "ready";
    };
  };
  brand: {
    displayName: string;
    playerLabel: string;
    primaryColor: string;
    logoPath: string;
    coverPath: string;
  };
}

export interface DemoWorkspaceState {
  schemaVersion: 1;
  session: {
    authenticated: boolean;
    email: string;
    lastSignedInAt: string | null;
  };
  projects: DemoProject[];
  folders: FolderNode[];
  assets: MediaAsset[];
  archivedAssets: MediaAsset[];
  trashedAssets: MediaAsset[];
  shareLinks: DemoShareLink[];
  activity: DemoActivityItem[];
  reviewComments: DemoReviewComment[];
  publicReviewStates: DemoPublicReviewState[];
  reviewCompletions: DemoReviewCompletion[];
  reviewCutMarkers: DemoReviewCutMarker[];
  tasks: DemoProjectTask[];
  approvalStages: DemoApprovalStage[];
  settings: DemoWorkspaceSettings;
}

export interface CreateDemoShareInput {
  assetIds: string[];
  reviewerName: string;
  reviewerEmail: string;
  shareIntent: ShareIntent;
  requireName: boolean;
  allowDownloads: boolean;
  watermarkEnabled: boolean;
  expiresAt: string | null;
  maxViews: number | null;
  notificationChannels: DemoShareNotificationChannel[];
}

export interface RecordDemoPublicReviewApprovalInput {
  projectId: string;
  assetId: string;
  versionId: string;
  reviewInviteId: string;
  reviewerName: string;
  reviewerEmail: string | null;
  permission: DemoSharePermission;
  workflowMode: WorkflowMode | null;
  approvals: ApprovalStep[];
  initialAssetStatus: string;
  approvalLinkApprovalId: string | null;
  approvalId: string;
  decision: ApprovalDecision;
  note?: string;
}

export interface RecordDemoReviewCompletionInput {
  projectId: string;
  assetId: string;
  versionId: string;
  reviewInviteId: string;
  reviewerName: string;
  reviewerEmail: string | null;
  permission: DemoSharePermission;
  note?: string | null;
}

const DEFAULT_SETTINGS: DemoWorkspaceSettings = {
  profile: {
    firstName: "Bailey",
    lastName: "Eubanks",
    reviewerColor: "#4c8ef5",
    avatarPath: "/brand/bailey-eubanks-profile.jpg",
  },
  appearance: {
    darkMode: false,
    reducedMotion: false,
  },
  notifications: {
    inApp: {
      enabled: true,
      comments: true,
      approvals: true,
      deliveries: true,
    },
    email: {
      enabled: true,
      comments: true,
      approvals: true,
      deliveries: true,
      digest: "hourly",
    },
    sms: {
      enabled: false,
      comments: false,
      approvals: true,
      deliveries: true,
      phone: "",
    },
    imessage: {
      enabled: false,
      comments: false,
      approvals: true,
      deliveries: true,
      relayName: "M2 iMessage relay",
      status: "not_connected",
    },
  },
  brand: {
    displayName: "Co-VideoPro",
    playerLabel: "Reviewed in Co-VideoPro",
    primaryColor: "#145bb8",
    logoPath: "/brand/co-videopro-color-supplied.png",
    coverPath: "/brand/co-videopro-project-cover.jpg",
  },
};

const LEGACY_DEMO_BRAND: DemoWorkspaceSettings["brand"] = {
  displayName: "Content Co-op",
  playerLabel: "Reviewed with Content Co-op",
  primaryColor: "#4c8ef5",
  logoPath: "/demo/cco-spiral.png",
  coverPath: "/brand/co-videopro-project-cover.jpg",
};

function cloneFolders(folders: FolderNode[]): FolderNode[] {
  return folders.map((folder) => ({
    ...folder,
    children: folder.children ? cloneFolders(folder.children) : [],
  }));
}

function cloneSettings(settings = DEFAULT_SETTINGS): DemoWorkspaceSettings {
  return {
    profile: { ...settings.profile },
    appearance: { ...settings.appearance },
    notifications: {
      inApp: { ...settings.notifications.inApp },
      email: { ...settings.notifications.email },
      sms: { ...settings.notifications.sms },
      imessage: { ...settings.notifications.imessage },
    },
    brand: { ...settings.brand },
  };
}

export function createInitialDemoWorkspace(): DemoWorkspaceState {
  return {
    schemaVersion: 1,
    session: {
      authenticated: true,
      email: "bailey@contentco-op.com",
      lastSignedInAt: "2026-07-14T19:00:00.000Z",
    },
    projects: demoProjects.map((project) => ({ ...project })),
    folders: cloneFolders(demoFolders),
    assets: demoAssets.map((asset) => ({ ...asset })),
    archivedAssets: [],
    trashedAssets: [],
    shareLinks: [
      {
        id: "share-ica-final",
        token: "demo-ica-final",
        type: "review",
        created_at: "2026-07-14T21:58:00.000Z",
        created_by_name: "You",
        message: "Final approval for the ICA roadshow package",
        asset_ids: ["ica-roadshow-final"],
        media_count: 1,
        invited_count: 2,
        reviewer_email: "approvals@ica.example",
        permission: "approve",
        require_name: true,
        allow_comments: true,
        allow_downloads: true,
        is_active: true,
        public_url:
          "/review/demo?demo=1&asset=ica-roadshow-final&intent=approval_needed&share=demo-ica-final",
      },
      {
        id: "share-ceraweek-cuts",
        token: "demo-ceraweek-cuts",
        type: "review",
        created_at: "2026-07-14T20:35:00.000Z",
        created_by_name: "You",
        message: "CERAWeek speaker cut review",
        asset_ids: ["denie-mcdonald-v4", "charles-drummond-v5"],
        media_count: 2,
        invited_count: 2,
        reviewer_email: "review@ica.example",
        permission: "comment",
        require_name: true,
        allow_comments: true,
        allow_downloads: false,
        is_active: true,
        public_url:
          "/review/demo?demo=1&asset=denie-mcdonald-v4&assets=denie-mcdonald-v4%2Ccharles-drummond-v5&intent=client_review&share=demo-ceraweek-cuts",
      },
    ],
    activity: [
      {
        id: "activity-approval-ica",
        action: "approved_asset",
        actor_name: "Morgan Lee",
        details: { asset_title: "ICA_ROADSHOW_x_FINAL" },
        created_at: "2026-07-14T22:08:00.000Z",
        project_id: "ica",
        asset_id: "ica-roadshow-final",
      },
      {
        id: "activity-comment-charles",
        action: "added_comment",
        actor_name: "Alex Rivera",
        details: {
          asset_title: "Charles Drummond_v5",
          body: "Can we hold the lower third for another beat?",
        },
        created_at: "2026-07-14T21:57:00.000Z",
        project_id: "ica",
        asset_id: "charles-drummond-v5",
      },
      {
        id: "activity-upload-denie",
        action: "uploaded_new_version",
        actor_name: "You",
        details: { asset_title: "Denie McDonald_v4" },
        created_at: "2026-07-14T21:53:00.000Z",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
      },
    ],
    reviewComments: [
      {
        id: "comment-denie-1",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        version_id: "demo-version-4",
        review_invite_id: "invite-demo",
        author_name: "Client Reviewer",
        body: "Please shorten this section.",
        time_seconds: 1,
        pin_x: 27,
        pin_y: 34,
        visibility: "external",
        status: "open",
        created_at: "2026-07-14T21:56:00.000Z",
      },
      {
        id: "comment-denie-2",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        version_id: "demo-version-4",
        review_invite_id: "invite-demo",
        author_name: "Content Co-op",
        body: "Update lower third title.",
        time_seconds: 3,
        pin_x: 64,
        pin_y: 48,
        visibility: "external",
        status: "open",
        created_at: "2026-07-14T21:54:00.000Z",
      },
      {
        id: "comment-denie-3",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        version_id: "demo-version-4",
        review_invite_id: "invite-demo",
        author_name: "Client Reviewer",
        body: "Add logo animation before the close.",
        time_seconds: 4,
        pin_x: 73,
        pin_y: 68,
        visibility: "external",
        status: "open",
        created_at: "2026-07-14T21:51:00.000Z",
      },
      {
        id: "comment-denie-resolved",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        version_id: "demo-version-4",
        review_invite_id: "invite-demo",
        author_name: "Morgan Lee",
        body: "Audio level is approved.",
        time_seconds: 2,
        pin_x: 52,
        pin_y: 42,
        visibility: "external",
        status: "resolved",
        created_at: "2026-07-14T20:44:00.000Z",
      },
      {
        id: "comment-charles-1",
        project_id: "ica",
        asset_id: "charles-drummond-v5",
        version_id: "demo-version-5",
        review_invite_id: "invite-demo",
        author_name: "Alex Rivera",
        body: "Hold the lower third for another beat before the answer begins.",
        time_seconds: 1,
        pin_x: 27,
        pin_y: 34,
        visibility: "external",
        status: "open",
        created_at: "2026-07-14T21:57:00.000Z",
      },
      {
        id: "comment-charles-1-reply",
        project_id: "ica",
        asset_id: "charles-drummond-v5",
        version_id: "demo-version-5",
        parent_id: "comment-charles-1",
        review_invite_id: "invite-demo",
        author_name: "Content Co-op",
        body: "Marked for the next revision pass so the transition has room to settle.",
        time_seconds: 1,
        visibility: "external",
        status: "open",
        created_at: "2026-07-14T21:58:00.000Z",
      },
      {
        id: "comment-charles-2",
        project_id: "ica",
        asset_id: "charles-drummond-v5",
        version_id: "demo-version-5",
        review_invite_id: "invite-demo",
        author_name: "Content Co-op",
        body: "Tighten the pause before the final sentence.",
        time_seconds: 3,
        pin_x: 64,
        pin_y: 48,
        visibility: "external",
        status: "open",
        created_at: "2026-07-14T21:55:00.000Z",
      },
      {
        id: "comment-charles-resolved",
        project_id: "ica",
        asset_id: "charles-drummond-v5",
        version_id: "demo-version-5",
        review_invite_id: "invite-demo",
        author_name: "Morgan Lee",
        body: "Name spelling and title treatment are approved.",
        time_seconds: 4,
        pin_x: 73,
        pin_y: 68,
        visibility: "external",
        status: "resolved",
        created_at: "2026-07-14T21:49:00.000Z",
      },
    ],
    publicReviewStates: [],
    reviewCompletions: [],
    reviewCutMarkers: [],
    tasks: [
      {
        id: "task-ica-lower-third",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        title: "Update the lower-third title",
        assignee_name: "Content Co-op",
        due_label: "Today",
        completed: false,
      },
      {
        id: "task-ica-logo-animation",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        title: "Add the ICA logo animation",
        assignee_name: "Bailey Eubanks",
        due_label: "Today",
        completed: false,
      },
      {
        id: "task-ica-export",
        project_id: "ica",
        asset_id: "ica-roadshow-final",
        title: "Prepare final delivery export",
        assignee_name: "Content Co-op",
        due_label: "Completed",
        completed: true,
      },
    ],
    approvalStages: [
      {
        id: "approval-denie-client",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        name: "Client Review",
        reviewer_names: ["Client Reviewer", "Jordan Miles"],
        approved_reviewer_names: ["Client Reviewer"],
        status: "in_progress",
      },
      {
        id: "approval-denie-final",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        name: "Final Approval",
        reviewer_names: ["Lena Ortiz"],
        approved_reviewer_names: [],
        status: "pending",
      },
      {
        id: "approval-charles-client",
        project_id: "ica",
        asset_id: "charles-drummond-v5",
        name: "Client Review",
        reviewer_names: ["Alex Rivera", "Morgan Lee"],
        approved_reviewer_names: ["Morgan Lee"],
        status: "in_progress",
      },
      {
        id: "approval-charles-final",
        project_id: "ica",
        asset_id: "charles-drummond-v5",
        name: "Final Approval",
        reviewer_names: ["Lena Ortiz"],
        approved_reviewer_names: [],
        status: "pending",
      },
    ],
    settings: cloneSettings(),
  };
}

const SERVER_SNAPSHOT = createInitialDemoWorkspace();
let currentState = SERVER_SNAPSHOT;
let hydrated = false;
const listeners = new Set<() => void>();

function isStoredWorkspace(value: unknown): value is Partial<DemoWorkspaceState> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoWorkspaceState>;
  return (
    candidate.schemaVersion === 1 &&
    Array.isArray(candidate.projects) &&
    Array.isArray(candidate.folders) &&
    Array.isArray(candidate.assets) &&
    Array.isArray(candidate.shareLinks) &&
    Array.isArray(candidate.activity)
  );
}

function normalizeRestoredDemoAssets(assets: MediaAsset[]) {
  const seededAssets = new Map(demoAssets.map((asset) => [asset.id, asset]));
  return assets.map((asset) => ({
    ...asset,
    folder_id: asset.folder_id ?? seededAssets.get(asset.id)?.folder_id ?? null,
    href: buildInternalDemoAssetHref(asset.project_id, asset.id),
  }));
}

function normalizeRestoredDemoComments(
  comments: DemoReviewComment[],
  seededComments: DemoReviewComment[],
  assets: MediaAsset[],
) {
  const seededById = new Map(seededComments.map((comment) => [comment.id, comment]));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

  return comments.map((comment) => {
    const seeded = seededById.get(comment.id);
    const asset = assetsById.get(comment.asset_id);
    const fallbackVersionId = asset ? `demo-version-${asset.version_count ?? 1}` : null;

    return {
      ...seeded,
      ...comment,
      version_id: comment.version_id ?? seeded?.version_id ?? fallbackVersionId,
      parent_id: comment.parent_id ?? seeded?.parent_id ?? null,
      review_invite_id: comment.review_invite_id ?? seeded?.review_invite_id ?? "invite-demo",
      pin_x: comment.pin_x ?? seeded?.pin_x,
      pin_y: comment.pin_y ?? seeded?.pin_y,
      visibility: comment.visibility ?? seeded?.visibility ?? "external",
    };
  });
}

/**
 * Older demo browser state did not save a media version for cut markers.
 * A legacy marker can only be safely retained by assigning it to the asset's
 * current demo version; markers with no known asset are omitted rather than
 * leaking into an arbitrary version.
 */
function normalizeRestoredDemoCutMarkers(
  markers: DemoReviewCutMarker[],
  assets: MediaAsset[],
) {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

  return markers.flatMap((marker) => {
    const asset = assetsById.get(marker.asset_id);
    const versionId = marker.version_id ?? (asset ? `demo-version-${asset.version_count ?? 1}` : null);
    if (!versionId) return [];

    return [{
      ...marker,
      version_id: versionId,
      time_seconds: Math.max(0, marker.time_seconds),
    }];
  });
}

function normalizeRestoredPublicReviewStates(states: DemoPublicReviewState[]) {
  return states.map((state) => ({
    ...state,
    approval_id: state.approval_id ?? null,
  }));
}

function mergeSeededFolderTrees(saved: FolderNode[] | undefined, seeded: FolderNode[]) {
  if (!saved) return seeded;

  const mergeNodes = (savedNodes: FolderNode[], seededNodes: FolderNode[]): FolderNode[] => {
    const seededById = new Map(seededNodes.map((node) => [node.id, node]));
    const merged = savedNodes.map((savedNode) => {
      const seededNode = seededById.get(savedNode.id);
      seededById.delete(savedNode.id);
      if (!seededNode) return savedNode;
      return {
        ...seededNode,
        ...savedNode,
        children: mergeNodes(savedNode.children ?? [], seededNode.children ?? []),
      };
    });
    return [...merged, ...seededById.values()];
  };

  return mergeNodes(saved, seeded);
}

function mergeSeededRecords<T extends { id: string }>(saved: T[] | undefined, seeded: T[]) {
  if (!saved) return seeded;
  const savedIds = new Set(saved.map((record) => record.id));
  return [...saved, ...seeded.filter((record) => !savedIds.has(record.id))];
}

function normalizeRestoredBrand(
  saved: Partial<DemoWorkspaceSettings["brand"]> | undefined,
  fallback: DemoWorkspaceSettings["brand"],
) {
  const isLegacyDefault =
    saved?.displayName === LEGACY_DEMO_BRAND.displayName &&
    saved.playerLabel === LEGACY_DEMO_BRAND.playerLabel &&
    saved.primaryColor === LEGACY_DEMO_BRAND.primaryColor &&
    saved.logoPath === LEGACY_DEMO_BRAND.logoPath;

  return isLegacyDefault ? { ...fallback } : { ...fallback, ...saved };
}

export function restoreDemoWorkspace(raw: string | null): DemoWorkspaceState {
  if (!raw) return createInitialDemoWorkspace();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredWorkspace(parsed)) return createInitialDemoWorkspace();
    const fallback = createInitialDemoWorkspace();
    const savedSettings = parsed.settings;
    const assets = normalizeRestoredDemoAssets(parsed.assets ?? fallback.assets);
    const archivedAssets = normalizeRestoredDemoAssets(
      parsed.archivedAssets ?? fallback.archivedAssets,
    );
    const trashedAssets = normalizeRestoredDemoAssets(
      parsed.trashedAssets ?? fallback.trashedAssets,
    );
    const reviewComments = normalizeRestoredDemoComments(
      mergeSeededRecords(parsed.reviewComments, fallback.reviewComments),
      fallback.reviewComments,
      assets,
    );
    const reviewCutMarkers = normalizeRestoredDemoCutMarkers(
      parsed.reviewCutMarkers ?? fallback.reviewCutMarkers,
      [...assets, ...archivedAssets, ...trashedAssets],
    );
    const publicReviewStates = normalizeRestoredPublicReviewStates(
      parsed.publicReviewStates ?? fallback.publicReviewStates,
    );

    return {
      schemaVersion: 1,
      session: { ...fallback.session, ...parsed.session },
      projects: parsed.projects ?? fallback.projects,
      folders: mergeSeededFolderTrees(parsed.folders, fallback.folders),
      assets,
      archivedAssets,
      trashedAssets,
      shareLinks: parsed.shareLinks ?? fallback.shareLinks,
      activity: parsed.activity ?? fallback.activity,
      reviewComments,
      publicReviewStates,
      reviewCompletions: parsed.reviewCompletions ?? fallback.reviewCompletions,
      reviewCutMarkers,
      tasks: parsed.tasks ?? fallback.tasks,
      approvalStages: mergeSeededRecords(parsed.approvalStages, fallback.approvalStages),
      settings: {
        profile: { ...fallback.settings.profile, ...savedSettings?.profile },
        appearance: { ...fallback.settings.appearance, ...savedSettings?.appearance },
        notifications: {
          inApp: {
            ...fallback.settings.notifications.inApp,
            ...savedSettings?.notifications?.inApp,
          },
          email: {
            ...fallback.settings.notifications.email,
            ...savedSettings?.notifications?.email,
          },
          sms: {
            ...fallback.settings.notifications.sms,
            ...savedSettings?.notifications?.sms,
          },
          imessage: {
            ...fallback.settings.notifications.imessage,
            ...savedSettings?.notifications?.imessage,
          },
        },
        brand: normalizeRestoredBrand(savedSettings?.brand, fallback.settings.brand),
      },
    };
  } catch {
    return createInitialDemoWorkspace();
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(DEMO_WORKSPACE_STORAGE_KEY);
  } catch {
    // Keep the in-memory demo usable when browser storage is unavailable.
  }
  currentState = restoreDemoWorkspace(stored);
  hydrated = true;
}

function emitChange() {
  for (const listener of listeners) listener();
}

function saveState(nextState: DemoWorkspaceState) {
  ensureHydrated();
  currentState = nextState;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DEMO_WORKSPACE_STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // The in-memory workspace remains usable if browser storage is unavailable.
    }
  }
  emitChange();
}

function updateState(updater: (state: DemoWorkspaceState) => DemoWorkspaceState) {
  ensureHydrated();
  saveState(updater(currentState));
}

function commitPersistedState(updater: (state: DemoWorkspaceState) => DemoWorkspaceState) {
  ensureHydrated();
  const nextState = updater(currentState);
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(DEMO_WORKSPACE_STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    return false;
  }

  currentState = nextState;
  emitChange();
  return true;
}

function subscribe(listener: () => void) {
  ensureHydrated();
  listeners.add(listener);

  function handleStorage(event: StorageEvent) {
    if (event.key !== DEMO_WORKSPACE_STORAGE_KEY) return;
    currentState = restoreDemoWorkspace(event.newValue);
    emitChange();
  }

  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function getSnapshot() {
  ensureHydrated();
  return currentState;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function subscribeDisabled() {
  return () => undefined;
}

function getDisabledSnapshot() {
  return SERVER_SNAPSHOT;
}

function createId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function useDemoWorkspace(enabled = true) {
  return useSyncExternalStore(
    enabled ? subscribe : subscribeDisabled,
    enabled ? getSnapshot : getDisabledSnapshot,
    getServerSnapshot,
  );
}

/**
 * Public review links expose only external threads belonging to their exact
 * asset version and invite. The producer cockpit can read the same canonical
 * workspace store at its broader project scope without leaking another
 * reviewer's thread into this link.
 */
export function getDemoExternalReviewComments(
  state: Pick<DemoWorkspaceState, "reviewComments">,
  scope: {
    projectId: string;
    assetId: string;
    versionId: string;
    reviewInviteId: string;
  },
) {
  return getDemoProjectVersionReviewComments(state, scope).filter(
    (comment) =>
      (comment.visibility ?? "external") === "external" &&
      (comment.review_invite_id ?? "invite-demo") === scope.reviewInviteId,
  );
}

export function getDemoProjectVersionReviewComments(
  state: Pick<DemoWorkspaceState, "reviewComments">,
  scope: {
    projectId: string;
    assetId: string;
    versionId: string;
  },
) {
  return state.reviewComments.filter(
    (comment) =>
      comment.project_id === scope.projectId &&
      comment.asset_id === scope.assetId &&
      comment.version_id === scope.versionId,
  );
}

export function getDemoVersionCutMarkers(
  state: Pick<DemoWorkspaceState, "reviewCutMarkers">,
  scope: {
    projectId: string;
    assetId: string;
    versionId: string;
  },
) {
  return state.reviewCutMarkers.filter(
    (marker) =>
      marker.project_id === scope.projectId &&
      marker.asset_id === scope.assetId &&
      marker.version_id === scope.versionId,
  );
}

export function addDemoReviewCutMarker(input: {
  projectId: string;
  assetId: string;
  versionId: string;
  timeSeconds: number;
}) {
  if (!input.projectId || !input.assetId || !input.versionId) return;
  const timeSeconds = Math.max(0, input.timeSeconds);

  updateState((state) => {
    if (
      state.reviewCutMarkers.some(
        (marker) =>
          marker.project_id === input.projectId &&
          marker.asset_id === input.assetId &&
          marker.version_id === input.versionId &&
          Math.abs(marker.time_seconds - timeSeconds) < 0.25,
      )
    ) {
      return state;
    }

    const marker: DemoReviewCutMarker = {
      id: createId("cut"),
      project_id: input.projectId,
      asset_id: input.assetId,
      version_id: input.versionId,
      time_seconds: timeSeconds,
      created_at: new Date().toISOString(),
    };

    return {
      ...state,
      reviewCutMarkers: [...state.reviewCutMarkers, marker],
      activity: [
        {
          id: createId("activity"),
          action: "marked_cut_decision",
          actor_name: "You",
          details: {
            asset_title:
              state.assets.find((candidate) => candidate.id === input.assetId)?.title ?? "Asset",
            time_seconds: timeSeconds.toFixed(2),
            version_id: input.versionId,
          },
          created_at: marker.created_at,
          project_id: input.projectId,
          asset_id: input.assetId,
        },
        ...state.activity,
      ],
    };
  });
}

export function signInDemoSession(email: string) {
  updateState((state) => ({
    ...state,
    session: {
      authenticated: true,
      email: email.trim() || state.session.email,
      lastSignedInAt: new Date().toISOString(),
    },
  }));
}

export function registerDemoAccount(email: string, displayName: string) {
  const nameParts = displayName.trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "Reviewer";
  const lastName = nameParts.slice(1).join(" ");

  updateState((state) => ({
    ...state,
    session: {
      authenticated: false,
      email: email.trim(),
      lastSignedInAt: null,
    },
    settings: {
      ...state.settings,
      profile: {
        ...state.settings.profile,
        firstName,
        lastName,
      },
    },
  }));
}

export function signOutDemoSession() {
  updateState((state) => ({
    ...state,
    session: {
      ...state.session,
      authenticated: false,
    },
  }));
}

export function createDemoProject(name: string) {
  const normalizedName = name.trim();
  const slug = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = `${slug || "project"}-${Date.now().toString(36)}`;
  const project = { id, name: normalizedName };

  updateState((state) => ({
    ...state,
    projects: [...state.projects, project],
    folders: [...state.folders, { ...project, children: [] }],
    activity: [
      {
        id: createId("activity"),
        action: "created_project",
        actor_name: "You",
        details: { project_name: normalizedName },
        created_at: new Date().toISOString(),
        project_id: id,
        asset_id: null,
      },
      ...state.activity,
    ],
  }));

  return project;
}

export function addDemoAssets(assets: MediaAsset[]) {
  if (assets.length === 0) return;
  const createdAt = new Date().toISOString();

  updateState((state) => ({
    ...state,
    assets: [...assets, ...state.assets],
    activity: [
      ...assets.map((asset) => ({
        id: createId("activity"),
        action: "uploaded_asset",
        actor_name: "You",
        details: { asset_title: asset.title },
        created_at: createdAt,
        project_id: asset.project_id,
        asset_id: asset.id,
      })),
      ...state.activity,
    ],
  }));
}

export function moveDemoAssetToTrash(assetId: string) {
  updateState((state) => {
    const asset = state.assets.find((candidate) => candidate.id === assetId);
    if (!asset) return state;

    return {
      ...state,
      assets: state.assets.filter((candidate) => candidate.id !== assetId),
      trashedAssets: [asset, ...state.trashedAssets],
      activity: [
        {
          id: createId("activity"),
          action: "moved_asset_to_trash",
          actor_name: "You",
          details: { asset_title: asset.title },
          created_at: new Date().toISOString(),
          project_id: asset.project_id,
          asset_id: asset.id,
        },
        ...state.activity,
      ],
    };
  });
}

export function archiveDemoAsset(assetId: string) {
  updateState((state) => {
    const asset = state.assets.find((candidate) => candidate.id === assetId);
    if (!asset) return state;

    return {
      ...state,
      assets: state.assets.filter((candidate) => candidate.id !== assetId),
      archivedAssets: [asset, ...state.archivedAssets],
      activity: [
        {
          id: createId("activity"),
          action: "archived_asset",
          actor_name: "You",
          details: { asset_title: asset.title },
          created_at: new Date().toISOString(),
          project_id: asset.project_id,
          asset_id: asset.id,
        },
        ...state.activity,
      ],
    };
  });
}

export function restoreDemoAsset(assetId: string) {
  updateState((state) => {
    const asset = state.trashedAssets.find((candidate) => candidate.id === assetId);
    if (!asset) return state;
    return {
      ...state,
      assets: [asset, ...state.assets],
      trashedAssets: state.trashedAssets.filter((candidate) => candidate.id !== assetId),
    };
  });
}

export function restoreDemoArchivedAsset(assetId: string) {
  updateState((state) => {
    const asset = state.archivedAssets.find((candidate) => candidate.id === assetId);
    if (!asset) return state;
    return {
      ...state,
      assets: [asset, ...state.assets],
      archivedAssets: state.archivedAssets.filter((candidate) => candidate.id !== assetId),
    };
  });
}

export function createDemoShareLinks(input: CreateDemoShareInput) {
  const assetIds = Array.from(new Set(input.assetIds)).filter(Boolean);
  if (assetIds.length === 0) return [];

  const createdAt = new Date().toISOString();
  const batchId = createId("share-batch");
  const defaults = resolveShareIntentDefaults(input.shareIntent);
  const intent = getShareIntentDefinition(input.shareIntent);
  const reviewerEmail = input.reviewerEmail.trim() || null;
  const reviewerName = input.reviewerName.trim() || null;
  const notificationChannels = Array.from(new Set(input.notificationChannels));
  const links: DemoShareLink[] = assetIds.map((assetId) => {
    const token = createId("review");
    const asset = currentState.assets.find((candidate) => candidate.id === assetId);
    const params = new URLSearchParams({
      demo: "1",
      asset: assetId,
      intent: input.shareIntent,
      share: token,
    });

    return {
      id: createId("share"),
      token,
      type: "review",
      created_at: createdAt,
      created_by_name: "You",
      message: `${intent.label}: ${asset?.title ?? "Deliverable"}`,
      asset_ids: [assetId],
      media_count: 1,
      invited_count: reviewerEmail ? 1 : 0,
      reviewer_name: reviewerName,
      reviewer_email: reviewerEmail,
      permission: defaults.permissions,
      share_intent: input.shareIntent,
      require_name: input.requireName,
      allow_comments: defaults.permissions !== "view",
      allow_downloads: input.allowDownloads,
      watermark_enabled: input.watermarkEnabled,
      expires_at: input.expiresAt,
      max_views: input.maxViews,
      batch_id: batchId,
      notification_channels: notificationChannels,
      notification_status: notificationChannels.length > 0 ? "dry_run" : "links_only",
      is_active: true,
      public_url: `/review/demo?${params.toString()}`,
    };
  });

  updateState((state) => {
    const firstAsset = state.assets.find((asset) => asset.id === assetIds[0]);
    return {
      ...state,
      shareLinks: [...links, ...state.shareLinks],
      activity: [
        {
          id: createId("activity"),
          action: links.length === 1 ? "created_review_link" : "created_review_batch",
          actor_name: "You",
          details: {
            asset_title:
              links.length === 1
                ? firstAsset?.title ?? "1 deliverable"
                : `${links.length} deliverables`,
            handoff: intent.label,
            delivery:
              notificationChannels.length > 0
                ? `${notificationChannels.join(", ")} dry run`
                : "links only",
          },
          created_at: createdAt,
          project_id: firstAsset?.project_id ?? "ica",
          asset_id: firstAsset?.id ?? null,
        },
        ...state.activity,
      ],
    };
  });

  return links;
}

export function setDemoShareLinkActive(id: string, isActive: boolean) {
  updateState((state) => ({
    ...state,
    shareLinks: state.shareLinks.map((link) =>
      link.id === id ? { ...link, is_active: isActive } : link,
    ),
  }));
}

export function addDemoReviewComment(input: {
  projectId?: string;
  assetId: string;
  versionId?: string;
  parentId?: string | null;
  reviewInviteId?: string;
  visibility?: "internal" | "external";
  authorName?: string;
  authorEmail?: string | null;
  assetType?: string;
  body: string;
  timeSeconds: number;
  pinX?: number;
  pinY?: number;
}) {
  const body = input.body.trim();
  if (!body) return null;
  const hasPinX = Number.isFinite(input.pinX);
  const hasPinY = Number.isFinite(input.pinY);
  if (hasPinX !== hasPinY) return null;

  ensureHydrated();
  const createdAt = new Date().toISOString();
  const asset = currentState.assets.find((candidate) => candidate.id === input.assetId);
  const projectId = input.projectId ?? asset?.project_id ?? "demo";
  const versionId = input.versionId ?? `demo-version-${asset?.version_count ?? 4}`;
  const parent = input.parentId
    ? currentState.reviewComments.find(
        (candidate) =>
          candidate.id === input.parentId &&
          candidate.project_id === projectId &&
          candidate.asset_id === input.assetId &&
          candidate.version_id === versionId,
      )
    : null;
  if (input.parentId && (!parent || parent.parent_id)) return null;

  const replySource = parent
    ? replySourceFromParent({ timecodeSeconds: parent.time_seconds })
    : null;
  const replyAudience = parent
    ? replyAudienceFromParent({
        visibility: parent.visibility ?? "internal",
        reviewInviteId: parent.review_invite_id,
      })
    : null;
  const profileName =
    `${currentState.settings.profile.firstName} ${currentState.settings.profile.lastName}`.trim();
  const authorName = input.authorName?.trim() || profileName || "Content Co-op";
  const comment: DemoReviewComment = {
    id: createId("comment"),
    project_id: projectId,
    asset_id: input.assetId,
    version_id: versionId,
    parent_id: input.parentId ?? null,
    review_invite_id: replyAudience?.reviewInviteId ?? input.reviewInviteId ?? "invite-demo",
    author_name: authorName,
    author_email: input.authorEmail ?? null,
    body,
    time_seconds: replySource
      ? replySource.timecodeSeconds ?? 0
      : !input.assetType || input.assetType === "video"
        ? Math.max(0, input.timeSeconds)
        : 0,
    pin_x: replySource ? undefined : hasPinX ? input.pinX : undefined,
    pin_y: replySource ? undefined : hasPinY ? input.pinY : undefined,
    visibility: replyAudience?.visibility ?? input.visibility ?? "internal",
    status: "open",
    created_at: createdAt,
  };

  const committed = commitPersistedState((state) => {
    const currentAsset = state.assets.find((candidate) => candidate.id === input.assetId);
    return {
      ...state,
      assets: state.assets.map((candidate) =>
        candidate.id === input.assetId
          ? { ...candidate, comment_count: (candidate.comment_count ?? 0) + 1 }
          : candidate,
      ),
      reviewComments: [comment, ...state.reviewComments],
      activity: [
        {
          id: createId("activity"),
          action: "added_comment",
          actor_name: authorName,
          details: { asset_title: currentAsset?.title ?? "Review asset", body },
          created_at: createdAt,
          project_id: projectId,
          asset_id: input.assetId,
        },
        ...state.activity,
      ],
    };
  });

  return committed ? comment : null;
}

const DEMO_APPROVAL_DECISIONS = new Set<ApprovalDecision>([
  "approved",
  "approved_with_changes",
  "changes_requested",
  "rejected",
]);

function normalizeDemoReviewerEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function getDemoActiveApprovalIds(
  approvals: ApprovalStep[],
  workflowMode: WorkflowMode | null,
  reviewerEmail: string | null,
  approvalLinkApprovalId: string | null,
) {
  const normalizedReviewerEmail = normalizeDemoReviewerEmail(reviewerEmail);
  if (!normalizedReviewerEmail || !approvalLinkApprovalId) return [];

  const pendingApprovals = [...approvals]
    .sort((left, right) => left.step_order - right.step_order)
    .filter((approval) => approval.status === "pending");
  const activeApprovals =
    workflowMode === "sequential" ? pendingApprovals.slice(0, 1) : pendingApprovals;

  const approval = activeApprovals.find(
    (candidate) =>
      candidate.id === approvalLinkApprovalId &&
      normalizeDemoReviewerEmail(candidate.assignee_email) === normalizedReviewerEmail,
  );

  return approval ? [approval.id] : [];
}

function sameDemoPublicReviewScope(
  state: DemoPublicReviewState,
  input: RecordDemoPublicReviewApprovalInput,
) {
  return (
    state.project_id === input.projectId &&
    state.asset_id === input.assetId &&
    state.version_id === input.versionId &&
    state.review_invite_id === input.reviewInviteId
  );
}

function isSameDemoApprovalWorkflow(
  state: DemoPublicReviewState,
  input: RecordDemoPublicReviewApprovalInput,
) {
  if (
    state.project_id !== input.projectId ||
    state.asset_id !== input.assetId ||
    state.version_id !== input.versionId
  ) {
    return false;
  }

  const inputApprovalIds = new Set(input.approvals.map((approval) => approval.id));
  return state.approvals.some((approval) => inputApprovalIds.has(approval.id));
}

export function recordDemoPublicReviewApproval(input: RecordDemoPublicReviewApprovalInput) {
  ensureHydrated();
  const existing = currentState.publicReviewStates.find((state) =>
    sameDemoPublicReviewScope(state, input),
  );
  const workflowState = currentState.publicReviewStates.find((state) =>
    isSameDemoApprovalWorkflow(state, input),
  );
  const approvals = workflowState?.approvals ?? existing?.approvals ?? input.approvals;

  if (input.permission !== "approve") {
    return { ok: false as const, statusCode: 403, error: "This review link cannot approve" };
  }

  if (!normalizeDemoReviewerEmail(input.reviewerEmail)) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "Approval links must be created for a specific reviewer email.",
    };
  }

  if (!input.approvalLinkApprovalId) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "This approval link is not bound to one approval step.",
    };
  }

  if (
    existing?.approval_id &&
    existing.approval_id !== input.approvalLinkApprovalId
  ) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "This approval link is already bound to another approval step.",
    };
  }

  if (input.approvalId !== input.approvalLinkApprovalId) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "This approval link is not assigned to that approval step.",
    };
  }

  if (!DEMO_APPROVAL_DECISIONS.has(input.decision)) {
    return { ok: false as const, statusCode: 400, error: "Invalid approval decision" };
  }

  const approval = approvals.find((candidate) => candidate.id === input.approvalId);
  if (!approval) {
    return { ok: false as const, statusCode: 404, error: "Approval step not found" };
  }

  const activeApprovalIds = getDemoActiveApprovalIds(
    approvals,
    input.workflowMode,
    input.reviewerEmail,
    input.approvalLinkApprovalId,
  );
  if (!activeApprovalIds.includes(input.approvalId)) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "This review link is not assigned to the active approval step.",
    };
  }

  const decidedAt = new Date().toISOString();
  const updatedApproval: ApprovalStep = {
    ...approval,
    status: input.decision,
    decision_note: input.note?.trim() || null,
    decided_at: decidedAt,
  };
  const updatedApprovals = approvals.map((candidate) =>
    candidate.id === input.approvalId ? updatedApproval : candidate,
  );
  const nextActiveApprovalIds = getDemoActiveApprovalIds(
    updatedApprovals,
    input.workflowMode,
    input.reviewerEmail,
    input.approvalLinkApprovalId,
  );
  const allApproved =
    updatedApprovals.length > 0 &&
    updatedApprovals.every(
      (candidate) =>
        candidate.status === "approved" || candidate.status === "approved_with_changes",
    );
  const assetStatus = allApproved
    ? "approved"
    : input.decision === "changes_requested" || input.decision === "rejected"
      ? "needs_changes"
      : existing?.asset_status ?? input.initialAssetStatus;
  const approvalAccessMessage =
    nextActiveApprovalIds.length > 0
      ? "Your next approval step is ready."
      : "Decision recorded for this local demo.";
  const persistedState: DemoPublicReviewState = {
    project_id: input.projectId,
    asset_id: input.assetId,
    version_id: input.versionId,
    review_invite_id: input.reviewInviteId,
    approval_id: input.approvalLinkApprovalId,
    reviewer_name: input.reviewerName.trim(),
    reviewer_email: input.reviewerEmail?.trim().toLowerCase() ?? "",
    workflow_mode: input.workflowMode,
    approvals: updatedApprovals,
    asset_status: assetStatus,
    active_approval_ids: nextActiveApprovalIds,
    approval_access_message: approvalAccessMessage,
    updated_at: decidedAt,
  };

  const committed = commitPersistedState((state) => {
    const synchronizedStates = state.publicReviewStates
      .filter((candidate) => !sameDemoPublicReviewScope(candidate, input))
      .map((candidate) => {
        if (!isSameDemoApprovalWorkflow(candidate, input)) return candidate;

        const candidateActiveApprovalIds = getDemoActiveApprovalIds(
          updatedApprovals,
          candidate.workflow_mode,
          candidate.reviewer_email,
          candidate.approval_id,
        );
        return {
          ...candidate,
          approvals: updatedApprovals,
          asset_status: assetStatus,
          active_approval_ids: candidateActiveApprovalIds,
          approval_access_message:
            candidateActiveApprovalIds.length > 0
              ? "Your next approval step is ready."
              : "Decision recorded for this local demo.",
          updated_at: decidedAt,
        };
      });

    return {
      ...state,
      assets: state.assets.map((asset) =>
        asset.id === input.assetId ? { ...asset, status: assetStatus } : asset,
      ),
      publicReviewStates: [persistedState, ...synchronizedStates],
      activity: [
        {
          id: createId("activity"),
          action: "recorded_public_approval",
          actor_name: input.reviewerName.trim() || "External reviewer",
          details: {
            approval_step: approval.role_label,
            decision: input.decision,
            version_id: input.versionId,
          },
          created_at: decidedAt,
          project_id: input.projectId,
          asset_id: input.assetId,
        },
        ...state.activity,
      ],
    };
  });

  if (!committed) {
    return {
      ok: false as const,
      statusCode: 503,
      error: "Could not persist this demo approval.",
    };
  }

  return {
    ok: true as const,
    approval: updatedApproval,
    approvals: updatedApprovals,
    assetStatus,
    activeApprovalIds: nextActiveApprovalIds,
    approvalAccessMessage,
  };
}

function sameDemoReviewCompletionScope(
  completion: DemoReviewCompletion,
  input: RecordDemoReviewCompletionInput,
) {
  return (
    completion.project_id === input.projectId &&
    completion.asset_id === input.assetId &&
    completion.version_id === input.versionId &&
    completion.review_invite_id === input.reviewInviteId
  );
}

export function recordDemoReviewCompletion(input: RecordDemoReviewCompletionInput) {
  ensureHydrated();

  if (input.permission === "view") {
    return {
      ok: false as const,
      statusCode: 403,
      error: "This review link cannot mark a review complete",
    };
  }

  const reviewerEmail = normalizeDemoReviewerEmail(input.reviewerEmail);
  if (!reviewerEmail) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "Review completion requires a review link assigned to one email address.",
    };
  }

  const reviewerName = input.reviewerName.trim();
  if (!reviewerName || reviewerName.length > 120) {
    return {
      ok: false as const,
      statusCode: 400,
      error: "Enter a reviewer name of 120 characters or fewer.",
    };
  }

  const note = input.note?.trim() || null;
  if (note && note.length > 2_000) {
    return {
      ok: false as const,
      statusCode: 400,
      error: "Completion note must be 2000 characters or fewer.",
    };
  }

  const existing = currentState.reviewCompletions.find((completion) =>
    sameDemoReviewCompletionScope(completion, input),
  );
  if (existing) {
    return { ok: true as const, created: false, completion: existing };
  }

  const completedAt = new Date().toISOString();
  const completion: DemoReviewCompletion = {
    id: createId("review-completion"),
    project_id: input.projectId,
    asset_id: input.assetId,
    version_id: input.versionId,
    review_invite_id: input.reviewInviteId,
    reviewer_name: reviewerName,
    reviewer_email: reviewerEmail,
    note,
    completed_at: completedAt,
  };
  const asset = currentState.assets.find((candidate) => candidate.id === input.assetId);

  const committed = commitPersistedState((state) => ({
    ...state,
    reviewCompletions: [completion, ...state.reviewCompletions],
    activity: [
      {
        id: createId("activity"),
        action: "review_completed",
        actor_name: reviewerName,
        details: {
          asset_title: asset?.title ?? "Review asset",
          version_id: input.versionId,
        },
        created_at: completedAt,
        project_id: input.projectId,
        asset_id: input.assetId,
      },
      ...state.activity,
    ],
  }));

  if (!committed) {
    return {
      ok: false as const,
      statusCode: 503,
      error: "Could not persist this demo review completion.",
    };
  }

  return { ok: true as const, created: true, completion };
}

export function toggleDemoReviewCommentResolved(id: string) {
  updateState((state) => ({
    ...state,
    reviewComments: state.reviewComments.map((comment) =>
      comment.id === id
        ? { ...comment, status: comment.status === "open" ? "resolved" : "open" }
        : comment,
    ),
  }));
}

export function toggleDemoTask(id: string) {
  updateState((state) => ({
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === id ? { ...task, completed: !task.completed } : task,
    ),
  }));
}

export function replaceDemoProjectTasksFromScript(
  projectId: string,
  tasks: readonly ProductionPlanTaskSeed[],
) {
  const createdAt = new Date().toISOString();
  updateState((state) => ({
    ...state,
    tasks: [
      ...state.tasks.filter((task) => task.project_id !== projectId),
      ...tasks.map((task) => ({
        id: `task-${projectId}-${task.clientTaskId}`,
        project_id: projectId,
        asset_id: null,
        title: task.title,
        assignee_name: "Unassigned",
        due_label: "No due date",
        completed: false,
      })),
    ],
    activity: [
      {
        id: `activity-${crypto.randomUUID()}`,
        action: "activated a production plan from the approved script",
        actor_name: "Content Co-op",
        details: { task_count: String(tasks.length) },
        created_at: createdAt,
        project_id: projectId,
        asset_id: null,
      },
      ...state.activity,
    ],
  }));
}

export function approveDemoStage(id: string) {
  updateState((state) => ({
    ...state,
    approvalStages: state.approvalStages.map((stage) =>
      stage.id === id
        ? {
            ...stage,
            approved_reviewer_names: [...stage.reviewer_names],
            status: "approved",
          }
        : stage,
    ),
  }));
}

export function updateDemoProfile(patch: Partial<DemoWorkspaceSettings["profile"]>) {
  updateState((state) => ({
    ...state,
    settings: {
      ...state.settings,
      profile: { ...state.settings.profile, ...patch },
    },
  }));
}

export function updateDemoAppearance(
  patch: Partial<DemoWorkspaceSettings["appearance"]>,
) {
  updateState((state) => ({
    ...state,
    settings: {
      ...state.settings,
      appearance: { ...state.settings.appearance, ...patch },
    },
  }));
}

export function updateDemoNotificationChannel<
  Channel extends keyof DemoWorkspaceSettings["notifications"],
>(
  channel: Channel,
  patch: Partial<DemoWorkspaceSettings["notifications"][Channel]>,
) {
  updateState((state) => ({
    ...state,
    settings: {
      ...state.settings,
      notifications: {
        ...state.settings.notifications,
        [channel]: {
          ...state.settings.notifications[channel],
          ...patch,
        },
      },
    },
  }));
}

export function updateDemoBrand(patch: Partial<DemoWorkspaceSettings["brand"]>) {
  updateState((state) => ({
    ...state,
    settings: {
      ...state.settings,
      brand: { ...state.settings.brand, ...patch },
    },
  }));
}

export function resetDemoWorkspace() {
  updateState((state) => {
    const reset = createInitialDemoWorkspace();
    return {
      ...reset,
      session: { ...state.session },
      settings: {
        ...reset.settings,
        profile: {
          ...reset.settings.profile,
          firstName: state.settings.profile.firstName,
          lastName: state.settings.profile.lastName,
          avatarPath: state.settings.profile.avatarPath,
        },
      },
    };
  });
}
