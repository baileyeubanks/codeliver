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
import {
  PROJECT_STAGES,
  type Brief,
  type Contact,
  type Decision,
  type Deliverable,
  type Inquiry,
  type NotificationOutboxItem,
  type Organization,
  type PaymentMethod,
  type PaymentMilestone,
  type PlanItem,
  type ProjectStage,
  type Proposal,
  type RevisionRequest,
  type Select,
  type Sequence,
  type SequenceClip,
} from "@/lib/covideopro/record.ts";
import {
  clipsFromSelects,
  nextRevisionRound,
  transitionBrief,
  transitionDeliverable,
  transitionInquiry,
  transitionPaymentMilestone,
  transitionProjectStage,
  transitionProposal,
  transitionRevisionRequest,
  transitionSequence,
} from "@/lib/covideopro/transitions.ts";
import { buildMilestonesForApproval, mockCheckoutUrl } from "@/lib/covideopro/payments.ts";
import {
  buildReviewLinkDrafts,
  dedupeOutboxDrafts,
  dispatchOutboxDraft,
  notificationIdempotencyKey,
} from "@/lib/covideopro/notifications.ts";
import {
  seedBriefs,
  seedContacts,
  seedDecisions,
  seedDeliverables,
  seedInquiries,
  seedNotificationOutbox,
  seedOrganizations,
  seedPaymentMilestones,
  seedPlanItems,
  seedProposals,
  seedRevisionRequests,
  seedSelects,
  seedSequenceClips,
  seedSequences,
} from "./record-seed";

export const DEMO_WORKSPACE_STORAGE_KEY = "co-videopro.workspace.v2";
export const LEGACY_DEMO_WORKSPACE_STORAGE_KEYS = ["co-deliver.demo-workspace.v1"];

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
  schemaVersion: 2;
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
  /* Project Operating Record collections (docs/COVIDEOPRO_PRODUCT_MODEL.md) */
  organizations: Organization[];
  contacts: Contact[];
  inquiries: Inquiry[];
  briefs: Brief[];
  proposals: Proposal[];
  planItems: PlanItem[];
  selects: Select[];
  sequences: Sequence[];
  sequenceClips: SequenceClip[];
  revisionRequests: RevisionRequest[];
  decisions: Decision[];
  deliverables: Deliverable[];
  paymentMilestones: PaymentMilestone[];
  notificationOutbox: NotificationOutboxItem[];
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
    schemaVersion: 2,
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
    organizations: seedOrganizations.map((record) => ({ ...record })),
    contacts: seedContacts.map((record) => ({ ...record })),
    inquiries: seedInquiries.map((record) => ({ ...record })),
    briefs: seedBriefs.map((record) => ({ ...record, references: [...record.references] })),
    proposals: seedProposals.map((record) => ({ ...record, estimate_lines: record.estimate_lines.map((line) => ({ ...line })) })),
    planItems: seedPlanItems.map((record) => ({ ...record, depends_on: [...record.depends_on], meta: { ...record.meta } })),
    selects: seedSelects.map((record) => ({ ...record, transcript_segment_ids: [...record.transcript_segment_ids] })),
    sequences: seedSequences.map((record) => ({ ...record })),
    sequenceClips: seedSequenceClips.map((record) => ({ ...record })),
    revisionRequests: seedRevisionRequests.map((record) => ({ ...record, comment_ids: [...record.comment_ids] })),
    decisions: seedDecisions.map((record) => ({ ...record, comment_ids: [...record.comment_ids] })),
    deliverables: seedDeliverables.map((record) => ({ ...record, spec: { ...record.spec } })),
    paymentMilestones: seedPaymentMilestones.map((record) => ({ ...record })),
    notificationOutbox: seedNotificationOutbox.map((record) => ({ ...record })),
  };
}

const SERVER_SNAPSHOT = createInitialDemoWorkspace();
let currentState = SERVER_SNAPSHOT;
let hydrated = false;
const listeners = new Set<() => void>();

/** Shape accepted from localStorage: v1 (legacy) or v2 records. */
export type StoredWorkspaceShape = Omit<Partial<DemoWorkspaceState>, "schemaVersion"> & {
  schemaVersion?: 1 | 2;
};

function isStoredWorkspace(value: unknown): value is StoredWorkspaceShape {
  if (!value || typeof value !== "object") return false;
  const candidate = value as StoredWorkspaceShape;
  return (
    (candidate.schemaVersion === 1 || candidate.schemaVersion === 2) &&
    Array.isArray(candidate.projects) &&
    Array.isArray(candidate.folders) &&
    Array.isArray(candidate.assets) &&
    Array.isArray(candidate.shareLinks) &&
    Array.isArray(candidate.activity)
  );
}

/** v1 → v2: drop the retired "acs" seed content, ensure current seed projects
 * exist, and attach the Project Operating Record collections. */
function migrateLegacyWorkspace(parsed: StoredWorkspaceShape, fallback: DemoWorkspaceState) {
  const RETIRED_PROJECT_ID = "acs";
  const projects = (parsed.projects ?? [])
    .filter((project) => project.id !== RETIRED_PROJECT_ID)
    .map((project) => {
      const seeded = fallback.projects.find((candidate) => candidate.id === project.id);
      return seeded ? { ...project, ...seeded, name: project.name } : project;
    });
  const missingProjects = fallback.projects.filter(
    (seeded) => !projects.some((project) => project.id === seeded.id),
  );
  const assets = (parsed.assets ?? []).filter((asset) => asset.project_id !== RETIRED_PROJECT_ID);
  const folders = (parsed.folders ?? []).filter((folder) => folder.id !== RETIRED_PROJECT_ID);

  return {
    projects: [...projects, ...missingProjects],
    folders: [...folders, ...fallback.folders.filter((seeded) => !folders.some((folder) => folder.id === seeded.id))],
    assets: [...assets, ...fallback.assets.filter((seeded) => seeded.project_id !== RETIRED_PROJECT_ID && !assets.some((asset) => asset.id === seeded.id))],
  };
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
    const legacy = parsed.schemaVersion === 1 ? migrateLegacyWorkspace(parsed, fallback) : null;

    return {
      schemaVersion: 2,
      session: { ...fallback.session, ...parsed.session },
      projects: legacy?.projects ?? parsed.projects ?? fallback.projects,
      folders: legacy?.folders ?? parsed.folders ?? fallback.folders,
      assets: normalizeRestoredDemoAssets(legacy?.assets ?? parsed.assets ?? fallback.assets),
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
      organizations: mergeSeededRecords(parsed.organizations, fallback.organizations),
      contacts: mergeSeededRecords(parsed.contacts, fallback.contacts),
      inquiries: mergeSeededRecords(parsed.inquiries, fallback.inquiries),
      briefs: mergeSeededRecords(parsed.briefs, fallback.briefs),
      proposals: mergeSeededRecords(parsed.proposals, fallback.proposals),
      planItems: mergeSeededRecords(parsed.planItems, fallback.planItems),
      selects: mergeSeededRecords(parsed.selects, fallback.selects),
      sequences: mergeSeededRecords(parsed.sequences, fallback.sequences),
      sequenceClips: mergeSeededRecords(parsed.sequenceClips, fallback.sequenceClips),
      revisionRequests: mergeSeededRecords(parsed.revisionRequests, fallback.revisionRequests),
      decisions: mergeSeededRecords(parsed.decisions, fallback.decisions),
      deliverables: mergeSeededRecords(parsed.deliverables, fallback.deliverables),
      paymentMilestones: mergeSeededRecords(parsed.paymentMilestones, fallback.paymentMilestones),
      notificationOutbox: mergeSeededRecords(parsed.notificationOutbox, fallback.notificationOutbox),
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
  let migratedFromLegacy = false;
  try {
    stored = window.localStorage.getItem(DEMO_WORKSPACE_STORAGE_KEY);
    if (stored === null) {
      for (const legacyKey of LEGACY_DEMO_WORKSPACE_STORAGE_KEYS) {
        stored = window.localStorage.getItem(legacyKey);
        if (stored !== null) {
          migratedFromLegacy = true;
          break;
        }
      }
    }
  } catch {
    // Keep the in-memory demo usable when browser storage is unavailable.
  }
  currentState = restoreDemoWorkspace(stored);
  hydrated = true;
  if (migratedFromLegacy) {
    try {
      window.localStorage.setItem(DEMO_WORKSPACE_STORAGE_KEY, JSON.stringify(currentState));
    } catch {
      // Migration persistence is best-effort; the in-memory state is migrated.
    }
  }
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

/** Headless read of current workspace state (tests, non-React callers). */
export function getDemoWorkspaceSnapshot(): DemoWorkspaceState {
  ensureHydrated();
  return currentState;
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
    const outboxDrafts = dedupeOutboxDrafts(
      links.flatMap((link) =>
        buildReviewLinkDrafts({
          projectId: firstAsset?.project_id ?? "",
          linkId: link.id,
          message: link.message,
          reviewerEmail,
          reviewerPhone: null,
          channels: notificationChannels,
          publicUrl: link.public_url,
        }),
      ),
      state.notificationOutbox,
    );
    const outboxItems: NotificationOutboxItem[] = outboxDrafts.map((draft) => ({
      id: createId("outbox"),
      project_id: draft.projectId,
      intent: draft.intent,
      channel: draft.channel,
      recipient: draft.recipient,
      subject: draft.subject,
      body: draft.body,
      status: "queued",
      provider: null,
      idempotency_key: notificationIdempotencyKey(draft),
      attempt_count: 0,
      last_error: null,
      created_at: createdAt,
      updated_at: createdAt,
      created_by: "user-bailey",
    }));

    return {
      ...state,
      shareLinks: [...links, ...state.shareLinks],
      notificationOutbox: [...outboxItems, ...state.notificationOutbox],
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

/* -------------------------------------------------------------------------- */
/* Project Operating Record mutations                                          */
/*                                                                            */
/* Every mutation validates through lib/covideopro/transitions.ts and appends */
/* an activity event. The same validators back the Supabase API routes.        */
/* -------------------------------------------------------------------------- */

function recordActivity(
  state: DemoWorkspaceState,
  event: {
    action: string;
    actor_name: string;
    project_id: string;
    asset_id?: string | null;
    details?: Record<string, string>;
  },
): DemoActivityItem[] {
  return [
    {
      id: createId("activity"),
      action: event.action,
      actor_name: event.actor_name,
      details: event.details ?? {},
      created_at: new Date().toISOString(),
      project_id: event.project_id,
      asset_id: event.asset_id ?? null,
    },
    ...state.activity,
  ];
}

const RECORD_ACTOR = "Bailey Eubanks";

export type RecordMutationResult = { ok: true; id: string } | { ok: false; reason: string };

/* ------------------------------ Inquiries --------------------------------- */

export function addInquiry(input: {
  summary: string;
  source: string;
  organizationId?: string | null;
  contactId?: string | null;
  contactName?: string;
  contactEmail?: string;
  organizationName?: string;
}): RecordMutationResult {
  if (!input.summary.trim()) return { ok: false, reason: "An inquiry needs a summary." };
  const id = createId("inq");
  const now = new Date().toISOString();

  updateState((state) => {
    let organizations = state.organizations;
    let contacts = state.contacts;
    let organizationId = input.organizationId ?? null;
    let contactId = input.contactId ?? null;

    if (!organizationId && input.organizationName?.trim()) {
      organizationId = createId("org");
      organizations = [
        ...organizations,
        { id: organizationId, name: input.organizationName.trim(), industry: null, website: null, notes: null, created_at: now, updated_at: now, created_by: "user-bailey" },
      ];
    }
    if (!contactId && input.contactEmail?.trim()) {
      contactId = createId("contact");
      contacts = [
        ...contacts,
        { id: contactId, organization_id: organizationId, name: input.contactName?.trim() || input.contactEmail.trim(), email: input.contactEmail.trim(), role: null, is_primary: true, created_at: now, updated_at: now, created_by: "user-bailey" },
      ];
    }

    const inquiry: Inquiry = {
      id,
      project_id: null,
      organization_id: organizationId,
      contact_id: contactId,
      source: input.source.trim() || "direct",
      summary: input.summary.trim(),
      received_at: now,
      status: "new",
      created_at: now,
      updated_at: now,
      created_by: "user-bailey",
    };

    return {
      ...state,
      organizations,
      contacts,
      inquiries: [inquiry, ...state.inquiries],
      activity: recordActivity(state, { action: "created_inquiry", actor_name: RECORD_ACTOR, project_id: "", details: { summary: inquiry.summary.slice(0, 80) } }),
    };
  });
  return { ok: true, id };
}

export function setInquiryStatus(id: string, to: Inquiry["status"]): RecordMutationResult {
  const inquiry = getSnapshot().inquiries.find((candidate) => candidate.id === id);
  if (!inquiry) return { ok: false, reason: "Inquiry not found." };
  const verdict = transitionInquiry(inquiry, to);
  if (!verdict.ok) return verdict;

  updateState((state) => ({
    ...state,
    inquiries: state.inquiries.map((candidate) =>
      candidate.id === id ? { ...candidate, status: to, updated_at: new Date().toISOString() } : candidate,
    ),
    activity: recordActivity(state, { action: `inquiry_${to}`, actor_name: RECORD_ACTOR, project_id: inquiry.project_id ?? "", details: { inquiry: inquiry.summary.slice(0, 60) } }),
  }));
  return { ok: true, id };
}

/** Convert a qualified inquiry: creates the project (stage intake) and links it. */
export function convertInquiryToProject(id: string, projectName: string): RecordMutationResult {
  const state = getSnapshot();
  const inquiry = state.inquiries.find((candidate) => candidate.id === id);
  if (!inquiry) return { ok: false, reason: "Inquiry not found." };
  if (!projectName.trim()) return { ok: false, reason: "Name the project to convert." };

  const projectId = createId("project");
  const verdict = transitionInquiry({ ...inquiry, project_id: projectId }, "converted");
  if (!verdict.ok) return verdict;

  const now = new Date().toISOString();
  updateState((current) => ({
    ...current,
    projects: [
      ...current.projects,
      { id: projectId, name: projectName.trim(), stage: "intake", organization_id: inquiry.organization_id, primary_contact_id: inquiry.contact_id },
    ],
    folders: [...current.folders, { id: projectId, name: projectName.trim(), children: [] }],
    inquiries: current.inquiries.map((candidate) =>
      candidate.id === id ? { ...candidate, status: "converted", project_id: projectId, updated_at: now } : candidate,
    ),
    activity: recordActivity(current, { action: "converted_inquiry", actor_name: RECORD_ACTOR, project_id: projectId, details: { project: projectName.trim() } }),
  }));
  return { ok: true, id: projectId };
}

/* -------------------------------- Briefs ----------------------------------- */

export function saveBrief(input: {
  projectId: string;
  objectives: string;
  audience: string;
  message: string;
  references?: string[];
  deliverablesNotes?: string;
}): RecordMutationResult {
  const state = getSnapshot();
  const existing = state.briefs
    .filter((brief) => brief.project_id === input.projectId && brief.status !== "superseded")
    .sort((a, b) => b.version - a.version)[0];

  const now = new Date().toISOString();
  const id = existing?.id ?? createId("brief");
  const version = existing ? existing.version + 1 : 1;

  updateState((current) => {
    const snapshot: Brief = {
      id,
      project_id: input.projectId,
      version,
      status: "draft",
      objectives: input.objectives,
      audience: input.audience,
      message: input.message,
      references: input.references ?? [],
      deliverables_notes: input.deliverablesNotes ?? "",
      created_at: existing?.created_at ?? now,
      updated_at: now,
      created_by: "user-bailey",
    };
    const supersede = existing && existing.status === "approved";
    return {
      ...current,
      briefs: [
        snapshot,
        ...current.briefs.map((brief) =>
          brief.id === id && supersede ? { ...brief, status: "superseded" as const, updated_at: now } : brief,
        ),
      ],
      activity: recordActivity(current, { action: existing ? `revised_brief_v${version}` : "created_brief", actor_name: RECORD_ACTOR, project_id: input.projectId }),
    };
  });
  return { ok: true, id };
}

export function setBriefStatus(id: string, to: Brief["status"]): RecordMutationResult {
  const brief = getSnapshot().briefs.find((candidate) => candidate.id === id);
  if (!brief) return { ok: false, reason: "Brief not found." };
  const verdict = transitionBrief(brief, to);
  if (!verdict.ok) return verdict;

  updateState((state) => ({
    ...state,
    briefs: state.briefs.map((candidate) =>
      candidate.id === id ? { ...candidate, status: to, updated_at: new Date().toISOString() } : candidate,
    ),
    activity: recordActivity(state, { action: `brief_${to}`, actor_name: RECORD_ACTOR, project_id: brief.project_id }),
  }));
  return { ok: true, id };
}

/* ------------------------------- Proposals --------------------------------- */

export function saveProposal(input: {
  projectId: string;
  title: string;
  narrative: string;
  estimateLines: Proposal["estimate_lines"];
  validUntil?: string | null;
}): RecordMutationResult {
  if (!input.title.trim()) return { ok: false, reason: "A proposal needs a title." };
  const state = getSnapshot();
  const existing = state.proposals
    .filter((proposal) => proposal.project_id === input.projectId && proposal.status !== "superseded")
    .sort((a, b) => b.version - a.version)[0];

  const now = new Date().toISOString();
  const id = existing?.id ?? createId("proposal");
  const version = existing ? existing.version + 1 : 1;

  updateState((current) => ({
    ...current,
    proposals: [
      {
        id,
        project_id: input.projectId,
        version,
        status: "draft" as const,
        title: input.title.trim(),
        narrative: input.narrative,
        estimate_lines: input.estimateLines,
        valid_until: input.validUntil ?? null,
        approved_by: null,
        approved_at: null,
        created_at: existing?.created_at ?? now,
        updated_at: now,
        created_by: "user-bailey",
      },
      ...current.proposals.map((proposal) =>
        proposal.id === id && proposal.status === "approved"
          ? { ...proposal, status: "superseded" as const, updated_at: now }
          : proposal,
      ),
    ],
    activity: recordActivity(current, { action: existing ? `revised_proposal_v${version}` : "created_proposal", actor_name: RECORD_ACTOR, project_id: input.projectId }),
  }));
  return { ok: true, id };
}

export function setProposalStatus(id: string, to: Proposal["status"], actorEmail?: string): RecordMutationResult {
  const proposal = getSnapshot().proposals.find((candidate) => candidate.id === id);
  if (!proposal) return { ok: false, reason: "Proposal not found." };
  const verdict = transitionProposal(proposal, to, { actorEmail: actorEmail ?? null });
  if (!verdict.ok) return verdict;

  const now = new Date().toISOString();
  updateState((state) => {
    const milestones: PaymentMilestone[] =
      to === "approved" && !state.paymentMilestones.some((milestone) => milestone.proposal_id === id)
        ? buildMilestonesForApproval(proposal).map((spec) => ({
            id: createId(`pm-${spec.kind}`),
            project_id: proposal.project_id,
            proposal_id: id,
            kind: spec.kind,
            label: spec.label,
            amount_cents: spec.amount_cents,
            currency: "USD",
            status: "pending" as const,
            method: null,
            checkout_url: null,
            checkout_provider: null,
            paid_at: null,
            created_at: now,
            updated_at: now,
            created_by: "user-bailey",
          }))
        : [];

    return {
      ...state,
      proposals: state.proposals.map((candidate) =>
        candidate.id === id
          ? {
              ...candidate,
              status: to,
              approved_by: to === "approved" ? actorEmail ?? null : candidate.approved_by,
              approved_at: to === "approved" ? now : candidate.approved_at,
              updated_at: now,
            }
          : candidate,
      ),
      paymentMilestones: [...state.paymentMilestones, ...milestones],
      activity: recordActivity(state, { action: `proposal_${to}`, actor_name: actorEmail ?? RECORD_ACTOR, project_id: proposal.project_id, details: { title: proposal.title, version: `v${proposal.version}` } }),
    };
  });
  return { ok: true, id };
}

/* ------------------------------ Plan items --------------------------------- */

export function addPlanItem(input: {
  projectId: string;
  kind: PlanItem["kind"];
  title: string;
  date?: string | null;
  assignee?: string | null;
  dependsOn?: string[];
  meta?: Record<string, string>;
}): RecordMutationResult {
  if (!input.title.trim()) return { ok: false, reason: "A plan item needs a title." };
  const id = createId("plan");
  const now = new Date().toISOString();
  updateState((state) => ({
    ...state,
    planItems: [
      ...state.planItems,
      {
        id,
        project_id: input.projectId,
        kind: input.kind,
        title: input.title.trim(),
        date: input.date ?? null,
        assignee: input.assignee ?? null,
        status: "pending" as const,
        depends_on: input.dependsOn ?? [],
        meta: input.meta ?? {},
        created_at: now,
        updated_at: now,
        created_by: "user-bailey",
      },
    ],
    activity: recordActivity(state, { action: `added_${input.kind}`, actor_name: RECORD_ACTOR, project_id: input.projectId, details: { title: input.title.trim() } }),
  }));
  return { ok: true, id };
}

export function setPlanItemStatus(id: string, status: PlanItem["status"]): RecordMutationResult {
  const item = getSnapshot().planItems.find((candidate) => candidate.id === id);
  if (!item) return { ok: false, reason: "Plan item not found." };
  updateState((state) => ({
    ...state,
    planItems: state.planItems.map((candidate) =>
      candidate.id === id ? { ...candidate, status, updated_at: new Date().toISOString() } : candidate,
    ),
    activity: recordActivity(state, { action: `plan_item_${status}`, actor_name: RECORD_ACTOR, project_id: item.project_id, details: { title: item.title } }),
  }));
  return { ok: true, id };
}

/* --------------------------- Selects / Sequences ---------------------------- */

export function addSelect(input: {
  projectId: string;
  assetId: string;
  versionId?: string | null;
  inSeconds: number;
  outSeconds: number;
  label: string;
  source: Select["source"];
  transcriptSegmentIds?: string[];
}): RecordMutationResult {
  if (input.outSeconds <= input.inSeconds) return { ok: false, reason: "Select out-point must be after its in-point." };
  const id = createId("select");
  const now = new Date().toISOString();
  updateState((state) => ({
    ...state,
    selects: [
      ...state.selects,
      {
        id,
        project_id: input.projectId,
        asset_id: input.assetId,
        version_id: input.versionId ?? null,
        in_seconds: input.inSeconds,
        out_seconds: input.outSeconds,
        label: input.label.trim(),
        source: input.source,
        transcript_segment_ids: input.transcriptSegmentIds ?? [],
        created_at: now,
        updated_at: now,
        created_by: "user-bailey",
      },
    ],
    activity: recordActivity(state, { action: "added_select", actor_name: RECORD_ACTOR, project_id: input.projectId, asset_id: input.assetId, details: { label: input.label.trim() } }),
  }));
  return { ok: true, id };
}

export function createSequenceFromSelects(input: {
  projectId: string;
  name: string;
  selectIds: string[];
}): RecordMutationResult {
  if (!input.name.trim()) return { ok: false, reason: "Name the sequence." };
  const state = getSnapshot();
  const selects = input.selectIds
    .map((selectId) => state.selects.find((candidate) => candidate.id === selectId))
    .filter((select): select is Select => Boolean(select));
  if (selects.length === 0) return { ok: false, reason: "Choose at least one select to assemble." };

  const id = createId("sequence");
  const clips = clipsFromSelects(id, selects, () => createId("clip"));
  const now = new Date().toISOString();

  updateState((current) => ({
    ...current,
    sequences: [
      ...current.sequences,
      { id, project_id: input.projectId, name: input.name.trim(), version: 1, status: "draft" as const, fps: 24, created_from: "transcript-assembly" as const, created_at: now, updated_at: now, created_by: "user-bailey" },
    ],
    sequenceClips: [...current.sequenceClips, ...clips],
    activity: recordActivity(current, { action: "assembled_sequence", actor_name: RECORD_ACTOR, project_id: input.projectId, details: { name: input.name.trim(), clips: String(clips.length) } }),
  }));
  return { ok: true, id };
}

export function setSequenceStatus(id: string, to: Sequence["status"]): RecordMutationResult {
  const state = getSnapshot();
  const sequence = state.sequences.find((candidate) => candidate.id === id);
  if (!sequence) return { ok: false, reason: "Sequence not found." };
  const clips = state.sequenceClips.filter((clip) => clip.sequence_id === id);
  const clipAssetIds = new Set(clips.map((clip) => clip.asset_id));
  const hasReviewVersion = state.shareLinks.some(
    (link) => link.is_active && link.asset_ids.some((assetId) => clipAssetIds.has(assetId)),
  );
  const verdict = transitionSequence(sequence, to, { clips, hasReviewVersion });
  if (!verdict.ok) return verdict;

  updateState((current) => ({
    ...current,
    sequences: current.sequences.map((candidate) =>
      candidate.id === id ? { ...candidate, status: to, updated_at: new Date().toISOString() } : candidate,
    ),
    activity: recordActivity(current, { action: `sequence_${to}`, actor_name: RECORD_ACTOR, project_id: sequence.project_id, details: { name: sequence.name } }),
  }));
  return { ok: true, id };
}

/* --------------------- Revision requests / Decisions ------------------------ */

export function addRevisionRequest(input: {
  projectId: string;
  assetId: string;
  versionId?: string | null;
  summary: string;
  commentIds?: string[];
}): RecordMutationResult {
  if (!input.summary.trim()) return { ok: false, reason: "Summarize the consolidated feedback." };
  const state = getSnapshot();
  const round = nextRevisionRound(state.revisionRequests, input.assetId);
  const id = createId("revision");
  const now = new Date().toISOString();

  updateState((current) => ({
    ...current,
    revisionRequests: [
      ...current.revisionRequests,
      {
        id,
        project_id: input.projectId,
        asset_id: input.assetId,
        version_id: input.versionId ?? null,
        round,
        summary: input.summary.trim(),
        status: "open" as const,
        comment_ids: input.commentIds ?? [],
        created_at: now,
        updated_at: now,
        created_by: "user-bailey",
      },
    ],
    activity: recordActivity(current, { action: `opened_revision_round_${round}`, actor_name: RECORD_ACTOR, project_id: input.projectId, asset_id: input.assetId }),
  }));
  return { ok: true, id };
}

export function setRevisionRequestStatus(
  id: string,
  to: RevisionRequest["status"],
  { waiveUnresolved = false }: { waiveUnresolved?: boolean } = {},
): RecordMutationResult {
  const state = getSnapshot();
  const request = state.revisionRequests.find((candidate) => candidate.id === id);
  if (!request) return { ok: false, reason: "Revision request not found." };
  const unresolvedCommentCount = state.reviewComments.filter(
    (comment) => request.comment_ids.includes(comment.id) && comment.status === "open",
  ).length;
  const verdict = transitionRevisionRequest(request, to, { unresolvedCommentCount, waivedUnresolved: waiveUnresolved });
  if (!verdict.ok) return verdict;

  updateState((current) => ({
    ...current,
    revisionRequests: current.revisionRequests.map((candidate) =>
      candidate.id === id ? { ...candidate, status: to, updated_at: new Date().toISOString() } : candidate,
    ),
    activity: recordActivity(current, { action: `revision_${to}`, actor_name: RECORD_ACTOR, project_id: request.project_id, asset_id: request.asset_id, details: { round: String(request.round) } }),
  }));
  return { ok: true, id };
}

export function addDecision(input: {
  projectId: string;
  subject: string;
  body: string;
  decidedBy: string;
  source: Decision["source"];
  commentIds?: string[];
}): RecordMutationResult {
  if (!input.subject.trim()) return { ok: false, reason: "A decision needs a subject." };
  const id = createId("decision");
  const now = new Date().toISOString();
  updateState((state) => ({
    ...state,
    decisions: [
      {
        id,
        project_id: input.projectId,
        subject: input.subject.trim(),
        body: input.body,
        decided_by: input.decidedBy,
        source: input.source,
        comment_ids: input.commentIds ?? [],
        created_at: now,
        updated_at: now,
        created_by: "user-bailey",
      },
      ...state.decisions,
    ],
    activity: recordActivity(state, { action: "recorded_decision", actor_name: input.decidedBy || RECORD_ACTOR, project_id: input.projectId, details: { subject: input.subject.trim() } }),
  }));
  return { ok: true, id };
}

/* ------------------------------ Deliverables ------------------------------- */

export function saveDeliverable(input: {
  projectId: string;
  name: string;
  spec: Deliverable["spec"];
  sourceVersionId?: string | null;
}): RecordMutationResult {
  if (!input.name.trim()) return { ok: false, reason: "A deliverable needs a name." };
  const id = createId("deliverable");
  const now = new Date().toISOString();
  updateState((state) => ({
    ...state,
    deliverables: [
      ...state.deliverables,
      {
        id,
        project_id: input.projectId,
        name: input.name.trim(),
        spec: input.spec,
        source_version_id: input.sourceVersionId ?? null,
        status: "specced" as const,
        qc_notes: "",
        delivered_at: null,
        created_at: now,
        updated_at: now,
        created_by: "user-bailey",
      },
    ],
    activity: recordActivity(state, { action: "specced_deliverable", actor_name: RECORD_ACTOR, project_id: input.projectId, details: { name: input.name.trim() } }),
  }));
  return { ok: true, id };
}

export function setDeliverableStatus(id: string, to: Deliverable["status"]): RecordMutationResult {
  const deliverable = getSnapshot().deliverables.find((candidate) => candidate.id === id);
  if (!deliverable) return { ok: false, reason: "Deliverable not found." };
  const verdict = transitionDeliverable(deliverable, to);
  if (!verdict.ok) return verdict;

  const now = new Date().toISOString();
  updateState((state) => ({
    ...state,
    deliverables: state.deliverables.map((candidate) =>
      candidate.id === id
        ? { ...candidate, status: to, delivered_at: to === "delivered" ? now : candidate.delivered_at, updated_at: now }
        : candidate,
    ),
    activity: recordActivity(state, { action: `deliverable_${to}`, actor_name: RECORD_ACTOR, project_id: deliverable.project_id, details: { name: deliverable.name } }),
  }));
  return { ok: true, id };
}

/* ----------------------------- Project stage -------------------------------- */

/** Advance the project's lifecycle stage, gated by the real record contents. */
export function advanceProjectStage(projectId: string): RecordMutationResult {
  const state = getSnapshot();
  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project) return { ok: false, reason: "Project not found." };
  const stage: ProjectStage = project.stage ?? "inquiry";

  const targetIndex = PROJECT_STAGES.indexOf(stage) + 1;
  if (targetIndex >= PROJECT_STAGES.length) return { ok: false, reason: "Project is already archived." };
  const target = PROJECT_STAGES[targetIndex];

  const verdict = transitionProjectStage({ stage }, target, {
    hasOrganization: Boolean(project.organization_id),
    hasContact: Boolean(project.primary_contact_id),
    hasBrief: state.briefs.some((brief) => brief.project_id === projectId && brief.status !== "superseded"),
    hasApprovedProposal: state.proposals.some((proposal) => proposal.project_id === projectId && proposal.status === "approved"),
    hasProductionDay: state.planItems.some((item) => item.project_id === projectId && item.kind === "production_day"),
    hasSequence: state.sequences.some((sequence) => sequence.project_id === projectId),
    hasActiveReview: state.shareLinks.some((link) => link.is_active && link.asset_ids.some((assetId) => state.assets.some((asset) => asset.id === assetId && asset.project_id === projectId))),
    hasFinalApproval: state.assets.some((asset) => asset.project_id === projectId && asset.status === "approved"),
    hasSpeccedDeliverable: state.deliverables.some((deliverable) => deliverable.project_id === projectId),
    allDeliverablesClosed: state.deliverables
      .filter((deliverable) => deliverable.project_id === projectId)
      .every((deliverable) => deliverable.status === "delivered" || deliverable.status === "expired"),
    planItems: state.planItems.filter((item) => item.project_id === projectId),
  });
  if (!verdict.ok) return verdict;

  updateState((current) => ({
    ...current,
    projects: current.projects.map((candidate) =>
      candidate.id === projectId ? { ...candidate, stage: target } : candidate,
    ),
    activity: recordActivity(current, { action: `stage_advanced_${target}`, actor_name: RECORD_ACTOR, project_id: projectId, details: { from: stage, to: target } }),
  }));
  return { ok: true, id: projectId };
}

/* --------------------- Payment milestone mutations ------------------------- */

export function createMilestoneCheckout(id: string): RecordMutationResult {
  const milestone = getSnapshot().paymentMilestones.find((candidate) => candidate.id === id);
  if (!milestone) return { ok: false, reason: "Milestone not found." };
  const verdict = transitionPaymentMilestone(milestone, "checkout_created", { method: "checkout" });
  if (!verdict.ok) return verdict;

  const url = mockCheckoutUrl(milestone.id, milestone.amount_cents, milestone.currency);
  updateState((state) => ({
    ...state,
    paymentMilestones: state.paymentMilestones.map((candidate) =>
      candidate.id === id
        ? { ...candidate, status: "checkout_created" as const, method: "checkout" as const, checkout_url: url, checkout_provider: "mock", updated_at: new Date().toISOString() }
        : candidate,
    ),
    activity: recordActivity(state, { action: "checkout_created", actor_name: RECORD_ACTOR, project_id: milestone.project_id, details: { label: milestone.label, provider: "mock" } }),
  }));
  return { ok: true, id };
}

export function recordMilestonePayment(id: string, method: PaymentMethod): RecordMutationResult {
  const milestone = getSnapshot().paymentMilestones.find((candidate) => candidate.id === id);
  if (!milestone) return { ok: false, reason: "Milestone not found." };
  const verdict = transitionPaymentMilestone(milestone, "paid", { method });
  if (!verdict.ok) return verdict;

  const now = new Date().toISOString();
  updateState((state) => ({
    ...state,
    paymentMilestones: state.paymentMilestones.map((candidate) =>
      candidate.id === id ? { ...candidate, status: "paid" as const, method, paid_at: now, updated_at: now } : candidate,
    ),
    activity: recordActivity(state, { action: "milestone_paid", actor_name: RECORD_ACTOR, project_id: milestone.project_id, details: { label: milestone.label, method } }),
  }));
  return { ok: true, id };
}

/* --------------------- Notification outbox mutations ------------------------ */

/** Dispatch queued outbox items through the dry-run lane. */
export function dispatchNotificationOutbox(): { processed: number } {
  const state = getSnapshot();
  const context = {
    emailConfigured: state.settings.notifications.email.enabled,
    smsConfigured: state.settings.notifications.sms.enabled && state.settings.notifications.sms.phone.trim().length > 0,
    imessageConfigured: state.settings.notifications.imessage.enabled,
  };
  const queued = state.notificationOutbox.filter((item) => item.status === "queued");
  if (queued.length === 0) return { processed: 0 };

  const results = new Map(queued.map((item) => [item.id, dispatchOutboxDraft(item, context)]));
  const now = new Date().toISOString();
  updateState((current) => ({
    ...current,
    notificationOutbox: current.notificationOutbox.map((item) => {
      const result = results.get(item.id);
      if (!result) return item;
      return {
        ...item,
        status: result.status,
        provider: result.provider,
        last_error: result.error,
        attempt_count: item.attempt_count + 1,
        updated_at: now,
      };
    }),
  }));
  return { processed: queued.length };
}
