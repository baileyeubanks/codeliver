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
import type {
  ApprovalDecision,
  ApprovalStep,
  WorkflowMode,
} from "@/lib/types/codeliver";

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
  review_invite_id?: string | null;
  author_name: string;
  author_email?: string | null;
  body: string;
  time_seconds: number;
  pin_x?: number;
  pin_y?: number;
  status: "open" | "resolved";
  created_at: string;
}

export interface DemoPublicReviewState {
  project_id: string;
  asset_id: string;
  version_id: string;
  review_invite_id: string;
  reviewer_name: string;
  reviewer_email: string;
  workflow_mode: WorkflowMode | null;
  approvals: ApprovalStep[];
  asset_status: string;
  active_approval_ids: string[];
  approval_access_message: string | null;
  updated_at: string;
}

export interface DemoReviewCutMarker {
  id: string;
  project_id: string;
  asset_id: string;
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
  approvalId: string;
  decision: ApprovalDecision;
  note?: string;
}

const DEFAULT_SETTINGS: DemoWorkspaceSettings = {
  profile: {
    firstName: "Bailey",
    lastName: "Eubanks",
    reviewerColor: "#4c8ef5",
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
    displayName: "Content Co-op",
    playerLabel: "Reviewed with Content Co-op",
    primaryColor: "#4c8ef5",
    logoPath: "/demo/cco-spiral.png",
  },
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
        author_name: "Client Reviewer",
        body: "Please shorten this section.",
        time_seconds: 1,
        status: "open",
        created_at: "2026-07-14T21:56:00.000Z",
      },
      {
        id: "comment-denie-2",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        author_name: "Content Co-op",
        body: "Update lower third title.",
        time_seconds: 3,
        status: "open",
        created_at: "2026-07-14T21:54:00.000Z",
      },
      {
        id: "comment-denie-3",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        author_name: "Client Reviewer",
        body: "Add logo animation before the close.",
        time_seconds: 4,
        status: "open",
        created_at: "2026-07-14T21:51:00.000Z",
      },
      {
        id: "comment-denie-resolved",
        project_id: "ica",
        asset_id: "denie-mcdonald-v4",
        author_name: "Morgan Lee",
        body: "Audio level is approved.",
        time_seconds: 2,
        status: "resolved",
        created_at: "2026-07-14T20:44:00.000Z",
      },
      {
        id: "comment-charles-1",
        project_id: "ica",
        asset_id: "charles-drummond-v5",
        author_name: "Alex Rivera",
        body: "Hold the lower third for another beat before the answer begins.",
        time_seconds: 1,
        status: "open",
        created_at: "2026-07-14T21:57:00.000Z",
      },
      {
        id: "comment-charles-2",
        project_id: "ica",
        asset_id: "charles-drummond-v5",
        author_name: "Content Co-op",
        body: "Tighten the pause before the final sentence.",
        time_seconds: 3,
        status: "open",
        created_at: "2026-07-14T21:55:00.000Z",
      },
      {
        id: "comment-charles-resolved",
        project_id: "ica",
        asset_id: "charles-drummond-v5",
        author_name: "Morgan Lee",
        body: "Name spelling and title treatment are approved.",
        time_seconds: 4,
        status: "resolved",
        created_at: "2026-07-14T21:49:00.000Z",
      },
    ],
    publicReviewStates: [],
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
  return assets.map((asset) => ({
    ...asset,
    href: buildInternalDemoAssetHref(asset.project_id, asset.id),
  }));
}

function mergeSeededRecords<T extends { id: string }>(saved: T[] | undefined, seeded: T[]) {
  if (!saved) return seeded;
  const savedIds = new Set(saved.map((record) => record.id));
  return [...saved, ...seeded.filter((record) => !savedIds.has(record.id))];
}

export function restoreDemoWorkspace(raw: string | null): DemoWorkspaceState {
  if (!raw) return createInitialDemoWorkspace();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredWorkspace(parsed)) return createInitialDemoWorkspace();
    const fallback = createInitialDemoWorkspace();
    const savedSettings = parsed.settings;

    return {
      schemaVersion: 1,
      session: { ...fallback.session, ...parsed.session },
      projects: parsed.projects ?? fallback.projects,
      folders: parsed.folders ?? fallback.folders,
      assets: normalizeRestoredDemoAssets(parsed.assets ?? fallback.assets),
      archivedAssets: normalizeRestoredDemoAssets(
        parsed.archivedAssets ?? fallback.archivedAssets,
      ),
      trashedAssets: normalizeRestoredDemoAssets(
        parsed.trashedAssets ?? fallback.trashedAssets,
      ),
      shareLinks: parsed.shareLinks ?? fallback.shareLinks,
      activity: parsed.activity ?? fallback.activity,
      reviewComments: mergeSeededRecords(parsed.reviewComments, fallback.reviewComments),
      publicReviewStates: parsed.publicReviewStates ?? fallback.publicReviewStates,
      reviewCutMarkers: parsed.reviewCutMarkers ?? fallback.reviewCutMarkers,
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
        brand: { ...fallback.settings.brand, ...savedSettings?.brand },
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

function createId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function useDemoWorkspace() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function addDemoReviewCutMarker(input: {
  projectId: string;
  assetId: string;
  timeSeconds: number;
}) {
  const timeSeconds = Math.max(0, input.timeSeconds);

  updateState((state) => {
    if (
      state.reviewCutMarkers.some(
        (marker) =>
          marker.asset_id === input.assetId && Math.abs(marker.time_seconds - timeSeconds) < 0.25,
      )
    ) {
      return state;
    }

    const marker: DemoReviewCutMarker = {
      id: createId("cut"),
      project_id: input.projectId,
      asset_id: input.assetId,
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

export function createDemoProject(
  name: string,
  intakeContext: {
    description?: string;
    clientName?: string;
    businessContext?: string;
  } = {},
) {
  const normalizedName = name.trim();
  const slug = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = `${slug || "project"}-${Date.now().toString(36)}`;
  const project = { id, name: normalizedName };
  const details: Record<string, string> = { project_name: normalizedName };
  if (intakeContext.description?.trim()) {
    details.project_brief = intakeContext.description.trim();
  }
  if (intakeContext.clientName?.trim()) {
    details.client_name = intakeContext.clientName.trim();
  }
  if (intakeContext.businessContext?.trim()) {
    details.business_context = intakeContext.businessContext.trim();
  }

  updateState((state) => ({
    ...state,
    projects: [...state.projects, project],
    folders: [...state.folders, { ...project, children: [] }],
    activity: [
      {
        id: createId("activity"),
        action: "created_project",
        actor_name: "You",
        details,
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
  reviewInviteId?: string;
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
  const profileName =
    `${currentState.settings.profile.firstName} ${currentState.settings.profile.lastName}`.trim();
  const authorName = input.authorName?.trim() || profileName || "Content Co-op";
  const comment: DemoReviewComment = {
    id: createId("comment"),
    project_id: projectId,
    asset_id: input.assetId,
    version_id: versionId,
    review_invite_id: input.reviewInviteId ?? "invite-demo",
    author_name: authorName,
    author_email: input.authorEmail ?? null,
    body,
    time_seconds:
      !input.assetType || input.assetType === "video" ? Math.max(0, input.timeSeconds) : 0,
    pin_x: hasPinX ? input.pinX : undefined,
    pin_y: hasPinY ? input.pinY : undefined,
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
) {
  const normalizedReviewerEmail = normalizeDemoReviewerEmail(reviewerEmail);
  if (!normalizedReviewerEmail) return [];

  const pendingApprovals = [...approvals]
    .sort((left, right) => left.step_order - right.step_order)
    .filter((approval) => approval.status === "pending");
  const activeApprovals =
    workflowMode === "sequential" ? pendingApprovals.slice(0, 1) : pendingApprovals;

  return activeApprovals
    .filter(
      (approval) =>
        normalizeDemoReviewerEmail(approval.assignee_email) === normalizedReviewerEmail,
    )
    .map((approval) => approval.id);
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

export function recordDemoPublicReviewApproval(input: RecordDemoPublicReviewApprovalInput) {
  ensureHydrated();
  const existing = currentState.publicReviewStates.find((state) =>
    sameDemoPublicReviewScope(state, input),
  );
  const approvals = existing?.approvals ?? input.approvals;

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
    reviewer_name: input.reviewerName.trim(),
    reviewer_email: input.reviewerEmail?.trim().toLowerCase() ?? "",
    workflow_mode: input.workflowMode,
    approvals: updatedApprovals,
    asset_status: assetStatus,
    active_approval_ids: nextActiveApprovalIds,
    approval_access_message: approvalAccessMessage,
    updated_at: decidedAt,
  };

  const committed = commitPersistedState((state) => ({
    ...state,
    assets: state.assets.map((asset) =>
      asset.id === input.assetId ? { ...asset, status: assetStatus } : asset,
    ),
    publicReviewStates: [
      persistedState,
      ...state.publicReviewStates.filter(
        (candidate) => !sameDemoPublicReviewScope(candidate, input),
      ),
    ],
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
  }));

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
        },
      },
    };
  });
}
