import type { ProjectAccessRole } from "../access-control";

export const PROJECT_OPERATING_RECORD_SCHEMA_VERSION =
  "co-videopro.project-os.v2" as const;

export type ProjectOperatingWorkspaceId =
  | "sales"
  | "pre_production"
  | "production"
  | "post_production"
  | "review"
  | "delivery"
  | "archive";

export type ProjectOperatingWorkspaceStatus =
  | "not_started"
  | "blocked"
  | "ready"
  | "active"
  | "complete";

export type ProjectOperatingAccessMode =
  | "read"
  | "review"
  | "contribute"
  | "manage";

export interface ProjectOperatingProjectInput {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectOperatingAssetInput {
  id: string;
  status: string;
  updatedAt: string;
  commentsCount: number;
  versionsCount: number;
  approvalStatuses: readonly string[];
}

export interface ProjectOperatingHandoffInput {
  receiptId: string;
  activatedAt: string;
  displayNumber: string;
  packageId: string;
  packageVersion: number;
  proposalVersionId: string;
  quoteVersionId: string;
  projectSeed: unknown;
  productionSeed: unknown;
  origin?: {
    linked: boolean;
    sourceInquiryId: string | null;
    primaryContactId: string | null;
    briefContentHash: string | null;
    opportunityAuthorityVersion: number | null;
    linkHash: string | null;
  } | null;
  brief?: ProjectOperatingBriefInput | null;
}

export interface ProjectOperatingBriefInput {
  revisionId: unknown;
  sourceCreativeBriefRevisionId: unknown;
  revisionNumber: unknown;
  title: unknown;
  objectives: unknown;
  audiences: unknown;
  keyMessages: unknown;
  requestedDeliverables: unknown;
  constraints: unknown;
  references: unknown;
  successCriteria: unknown;
  content: unknown;
  contentHash: unknown;
  createdAt: unknown;
  sourceProposalRequestReceiptId: unknown;
  sourceActivationAuthorizationReceiptId: unknown;
}

export interface ProjectOperatingManualOriginInput {
  createdAt: string;
}

export interface ProjectOperatingPlanInput {
  revisionNumber: number;
  title: string;
  createdAt: string;
  taskCount: number;
  completedTaskCount: number;
  blockedTaskCount: number;
  updatedAt: string;
}

export interface ProjectOperatingScriptInput {
  revisionNumber: number;
  title: string;
  state: "draft" | "submitted" | "approved" | "changes_requested" | "superseded";
  format: "commercial" | "documentary" | "interview" | "voice_over" | "screenplay" | "outline";
  estimatedRuntimeSeconds: number | null;
  sectionCount: number;
  createdAt: string;
}

export interface ProjectOperatingEvidenceInput {
  currentVersionCount: number | null;
  openReviewThreadCount: number | null;
  resolvedReviewThreadCount: number | null;
  latestCommentActivityAt: string | null;
}

export interface ProjectOperatingRecordInput {
  project: ProjectOperatingProjectInput;
  accessRole: ProjectAccessRole;
  handoff: ProjectOperatingHandoffInput | null;
  manualOrigin?: ProjectOperatingManualOriginInput | null;
  plan?: ProjectOperatingPlanInput | null;
  script?: ProjectOperatingScriptInput | null;
  evidence?: ProjectOperatingEvidenceInput | null;
  assets: readonly ProjectOperatingAssetInput[];
}

export interface ProjectOperatingDeliverable {
  id: string;
  title: string;
  acceptanceCriteria: string[];
}

export interface ProjectOperatingBrief {
  revisionId: string;
  sourceCreativeBriefRevisionId: string;
  revisionNumber: number;
  title: string;
  objectives: string[];
  audiences: string[];
  keyMessages: string[];
  requestedDeliverables: string[];
  constraints: string[];
  references: string[];
  successCriteria: string[];
  content: Record<string, unknown>;
  contentHash: string;
  createdAt: string;
  sourceProposalRequestReceiptId: string;
  sourceActivationAuthorizationReceiptId: string;
}

export interface ProjectOperatingScript {
  revisionNumber: number;
  title: string;
  state: ProjectOperatingScriptInput["state"];
  format: ProjectOperatingScriptInput["format"];
  estimatedRuntimeSeconds: number | null;
  sectionCount: number;
  createdAt: string;
}

export interface ProjectOperatingWorkspace {
  id: ProjectOperatingWorkspaceId;
  label: string;
  status: ProjectOperatingWorkspaceStatus;
  access: ProjectOperatingAccessMode;
  evidence: string[];
  blockers: string[];
}

export interface ProjectOperatingRecord {
  schemaVersion: typeof PROJECT_OPERATING_RECORD_SCHEMA_VERSION;
  generatedAt: string;
  revisionAt: string;
  project: {
    id: string;
    name: string;
    status: string;
  };
  authority: {
    project: "Co-VideoPro";
    commercial: "CCO_OS" | "unlinked";
    preproject: "Co-VideoPro CRM" | "Co-VideoPro" | "external_reference" | "unlinked";
    projection: "read_only";
  };
  lineage: {
    source: "accepted_proposal" | "manual_project" | "unlinked_project";
    activatedAt: string | null;
    originRecordedAt?: string;
    receiptId?: string;
    displayNumber?: string;
    packageId?: string;
    packageVersion?: number;
    proposalVersionId?: string;
    quoteVersionId?: string;
    preprojectOrigin?: "linked" | "external_reference";
  };
  context: {
    sourceInquiryId: string | null;
    clientId: string | null;
    primaryContactId: string | null;
    opportunityId: string | null;
    briefId: string | null;
    briefContentHash: string | null;
    opportunityAuthorityVersion: number | null;
    brief: ProjectOperatingBrief | null;
    script: ProjectOperatingScript | null;
    productionWindow: {
      startDate: string;
      dueDate: string;
      constraints: string[];
    } | null;
    scopeItemIds: string[];
    deliverables: ProjectOperatingDeliverable[];
    productionModules: string[];
  };
  metrics: {
    assets: number;
    versions: number;
    comments: number;
    approvalsPending: number;
    approvalsComplete: number;
    deliverablesPlanned: number;
    tasks: number;
    tasksCompleted: number;
    tasksBlocked: number;
    planRevision: number | null;
  };
  media: {
    registeredAssets: number;
    readyAssets: number;
    processingAssets: number;
    failedAssets: number;
    currentVersions: number | null;
  };
  review: {
    reviewableAssets: number;
    activeAssets: number;
    changesRequestedAssets: number;
    approvedAssets: number;
    openThreads: number | null;
    resolvedThreads: number | null;
    latestCommentActivityAt: string | null;
  };
  workspaces: ProjectOperatingWorkspace[];
  nextAction: {
    workspaceId: ProjectOperatingWorkspaceId;
    label: string;
    reason: string;
  } | null;
}

type JsonRecord = Record<string, unknown>;

const BRIEF_ARRAY_MAX_ITEMS = 100;
const BRIEF_ARRAY_ITEM_MAX_LENGTH = 2_000;
const BRIEF_CONTENT_MAX_BYTES = 65_536;
const BRIEF_CONTENT_MAX_COLLECTION_ITEMS = 250;
const BRIEF_CONTENT_MAX_DEPTH = 12;
const BRIEF_CONTENT_MAX_NODES = 2_000;
const BRIEF_CONTENT_MAX_STRING_LENGTH = 32_768;

const WORKSPACE_LABELS: Record<ProjectOperatingWorkspaceId, string> = {
  sales: "Sales and activation",
  pre_production: "Pre-production",
  production: "Production",
  post_production: "Post-production",
  review: "Review and approval",
  delivery: "Delivery",
  archive: "Archive and learning",
};

const ROLE_WORKSPACES: Record<
  ProjectAccessRole,
  readonly ProjectOperatingWorkspaceId[]
> = {
  owner: [
    "sales",
    "pre_production",
    "production",
    "post_production",
    "review",
    "delivery",
    "archive",
  ],
  admin: [
    "sales",
    "pre_production",
    "production",
    "post_production",
    "review",
    "delivery",
    "archive",
  ],
  producer: [
    "sales",
    "pre_production",
    "production",
    "post_production",
    "review",
    "delivery",
    "archive",
  ],
  editor: ["production", "post_production", "review", "delivery", "archive"],
  member: [
    "pre_production",
    "production",
    "post_production",
    "review",
    "delivery",
  ],
  reviewer: ["review", "delivery"],
  viewer: ["production", "post_production", "review", "delivery", "archive"],
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function safeStringArray(value: unknown, maxItems = 100): string[] {
  if (!Array.isArray(value) || value.length > maxItems) return [];
  return value
    .map((item) => safeString(item, 1_000))
    .filter((item): item is string => item !== null);
}

function safeBriefStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > BRIEF_ARRAY_MAX_ITEMS) return null;
  const result: string[] = [];
  for (const item of value) {
    const normalized = safeString(item, BRIEF_ARRAY_ITEM_MAX_LENGTH);
    if (!normalized) return null;
    result.push(normalized);
  }
  return result;
}

function safeTimestamp(value: unknown): string | null {
  const candidate = safeString(value, 64);
  if (!candidate) return null;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function safeCount(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

type BoundedJsonResult =
  | { valid: true; value: unknown }
  | { valid: false; value: null };

function boundedJsonValue(
  value: unknown,
  depth: number,
  budget: { nodes: number },
): BoundedJsonResult {
  budget.nodes += 1;
  if (budget.nodes > BRIEF_CONTENT_MAX_NODES || depth > BRIEF_CONTENT_MAX_DEPTH) {
    return { valid: false, value: null };
  }
  if (value === null || typeof value === "boolean") {
    return { valid: true, value };
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { valid: true, value }
      : { valid: false, value: null };
  }
  if (typeof value === "string") {
    return value.length <= BRIEF_CONTENT_MAX_STRING_LENGTH
      ? { valid: true, value }
      : { valid: false, value: null };
  }
  if (Array.isArray(value)) {
    if (value.length > BRIEF_CONTENT_MAX_COLLECTION_ITEMS) {
      return { valid: false, value: null };
    }
    const result: unknown[] = [];
    for (const item of value) {
      const parsed = boundedJsonValue(item, depth + 1, budget);
      if (!parsed.valid) return parsed;
      result.push(parsed.value);
    }
    return { valid: true, value: result };
  }
  if (!isRecord(value)) return { valid: false, value: null };
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return { valid: false, value: null };
  }
  const entries = Object.entries(value);
  if (entries.length > BRIEF_CONTENT_MAX_COLLECTION_ITEMS) {
    return { valid: false, value: null };
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    if (
      key.length > 240 ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      return { valid: false, value: null };
    }
    const parsed = boundedJsonValue(item, depth + 1, budget);
    if (!parsed.valid) return parsed;
    result[key] = parsed.value;
  }
  return { valid: true, value: result };
}

function safeBriefContent(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const parsed = boundedJsonValue(value, 0, { nodes: 0 });
  if (!parsed.valid || !isRecord(parsed.value)) return null;
  try {
    const serialized = JSON.stringify(parsed.value);
    if (new TextEncoder().encode(serialized).byteLength > BRIEF_CONTENT_MAX_BYTES) {
      return null;
    }
  } catch {
    return null;
  }
  return parsed.value;
}

function safeProjectBrief(
  input: ProjectOperatingBriefInput | null | undefined,
): ProjectOperatingBrief | null {
  if (!input) return null;
  const revisionId = safeString(input.revisionId, 240);
  const sourceCreativeBriefRevisionId = safeString(
    input.sourceCreativeBriefRevisionId,
    240,
  );
  const revisionNumber =
    typeof input.revisionNumber === "number" &&
    Number.isSafeInteger(input.revisionNumber) &&
    input.revisionNumber >= 1 &&
    input.revisionNumber <= 2_147_483_647
      ? input.revisionNumber
      : null;
  const title = safeString(input.title, 240);
  const objectives = safeBriefStringArray(input.objectives);
  const audiences = safeBriefStringArray(input.audiences);
  const keyMessages = safeBriefStringArray(input.keyMessages);
  const requestedDeliverables = safeBriefStringArray(input.requestedDeliverables);
  const constraints = safeBriefStringArray(input.constraints);
  const references = safeBriefStringArray(input.references);
  const successCriteria = safeBriefStringArray(input.successCriteria);
  const content = safeBriefContent(input.content);
  const contentHash = safeString(input.contentHash, 71);
  const createdAt = safeTimestamp(input.createdAt);
  const sourceProposalRequestReceiptId = safeString(
    input.sourceProposalRequestReceiptId,
    240,
  );
  const sourceActivationAuthorizationReceiptId = safeString(
    input.sourceActivationAuthorizationReceiptId,
    240,
  );

  if (
    !revisionId ||
    !sourceCreativeBriefRevisionId ||
    revisionNumber === null ||
    !title ||
    !objectives ||
    !audiences ||
    !keyMessages ||
    !requestedDeliverables ||
    !constraints ||
    !references ||
    !successCriteria ||
    !content ||
    !contentHash?.match(/^sha256:[0-9a-f]{64}$/) ||
    !createdAt ||
    !sourceProposalRequestReceiptId ||
    !sourceActivationAuthorizationReceiptId
  ) {
    return null;
  }

  return {
    revisionId,
    sourceCreativeBriefRevisionId,
    revisionNumber,
    title,
    objectives,
    audiences,
    keyMessages,
    requestedDeliverables,
    constraints,
    references,
    successCriteria,
    content,
    contentHash,
    createdAt,
    sourceProposalRequestReceiptId,
    sourceActivationAuthorizationReceiptId,
  };
}

function safeDeliverables(value: unknown): ProjectOperatingDeliverable[] {
  if (!Array.isArray(value) || value.length > 250) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const id = safeString(candidate.id, 240);
    const title = safeString(candidate.title, 500);
    if (!id || !title) return [];
    return [
      {
        id,
        title,
        acceptanceCriteria: safeStringArray(candidate.acceptanceCriteria, 50),
      },
    ];
  });
}

function parseHandoffContext(handoff: ProjectOperatingHandoffInput | null) {
  const projectSeed = isRecord(handoff?.projectSeed) ? handoff.projectSeed : {};
  const productionSeed = isRecord(handoff?.productionSeed)
    ? handoff.productionSeed
    : {};
  const rawWindow = isRecord(projectSeed.productionWindow)
    ? projectSeed.productionWindow
    : null;
  const startDate = safeString(rawWindow?.startDate, 32);
  const dueDate = safeString(rawWindow?.dueDate, 32);
  const constraints = safeStringArray(rawWindow?.constraints, 100);
  const origin = isRecord(handoff?.origin) ? handoff.origin : null;
  const sourceInquiryId = safeString(origin?.sourceInquiryId, 240);
  const primaryContactId = safeString(origin?.primaryContactId, 240);
  const briefId = safeString(productionSeed.briefId, 240);
  const briefContentHash = safeString(origin?.briefContentHash, 80);
  const linkHash = safeString(origin?.linkHash, 80);
  const opportunityAuthorityVersion =
    typeof origin?.opportunityAuthorityVersion === "number" &&
    Number.isSafeInteger(origin.opportunityAuthorityVersion) &&
    origin.opportunityAuthorityVersion >= 1
      ? origin.opportunityAuthorityVersion
      : null;
  const originClaimsLinked = origin?.linked === true;
  const originLinked = Boolean(
    originClaimsLinked &&
      sourceInquiryId &&
      primaryContactId &&
      briefContentHash?.match(/^sha256:[0-9a-f]{64}$/) &&
      linkHash?.match(/^sha256:[0-9a-f]{64}$/) &&
      opportunityAuthorityVersion,
  );
  const projectBrief = safeProjectBrief(handoff?.brief);
  const brief =
    projectBrief &&
    briefId === projectBrief.sourceCreativeBriefRevisionId &&
    (!originClaimsLinked || briefContentHash === projectBrief.contentHash)
      ? projectBrief
      : null;

  return {
    originLinked,
    sourceInquiryId: originLinked ? sourceInquiryId : null,
    clientId: safeString(productionSeed.clientId, 240),
    primaryContactId: originLinked ? primaryContactId : null,
    opportunityId: safeString(productionSeed.opportunityId, 240),
    briefId,
    briefContentHash: originLinked ? briefContentHash : null,
    opportunityAuthorityVersion: originLinked
      ? opportunityAuthorityVersion
      : null,
    brief,
    productionWindow:
      startDate && dueDate
        ? { startDate, dueDate, constraints }
        : null,
    scopeItemIds: safeStringArray(productionSeed.scopeItemIds, 500),
    deliverables: safeDeliverables(productionSeed.deliverables),
    productionModules: safeStringArray(productionSeed.productionModules, 20),
  };
}

function normalizedStatus(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s-]+/g, "_");
}

function latestTimestamp(values: readonly string[]) {
  return values.reduce((latest, value) => {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return latest;
    return timestamp > latest ? timestamp : latest;
  }, 0);
}

function safePlan(input: ProjectOperatingPlanInput | null | undefined) {
  if (!input) return null;
  if (
    !Number.isSafeInteger(input.revisionNumber) ||
    input.revisionNumber < 1 ||
    !safeString(input.title, 240) ||
    !Number.isSafeInteger(input.taskCount) ||
    !Number.isSafeInteger(input.completedTaskCount) ||
    !Number.isSafeInteger(input.blockedTaskCount) ||
    input.taskCount < 0 ||
    input.completedTaskCount < 0 ||
    input.blockedTaskCount < 0 ||
    input.completedTaskCount > input.taskCount ||
    input.blockedTaskCount > input.taskCount
  ) {
    return null;
  }
  return {
    revisionNumber: input.revisionNumber,
    title: input.title.trim(),
    createdAt: input.createdAt,
    taskCount: input.taskCount,
    completedTaskCount: input.completedTaskCount,
    blockedTaskCount: input.blockedTaskCount,
    updatedAt: input.updatedAt,
  };
}

function safeScript(
  input: ProjectOperatingScriptInput | null | undefined,
): ProjectOperatingScript | null {
  if (!input) return null;
  const title = safeString(input.title, 240);
  const createdAt = safeTimestamp(input.createdAt);
  const states = new Set<ProjectOperatingScriptInput["state"]>([
    "draft",
    "submitted",
    "approved",
    "changes_requested",
    "superseded",
  ]);
  const formats = new Set<ProjectOperatingScriptInput["format"]>([
    "commercial",
    "documentary",
    "interview",
    "voice_over",
    "screenplay",
    "outline",
  ]);
  if (
    !Number.isSafeInteger(input.revisionNumber) ||
    input.revisionNumber < 1 ||
    !title ||
    !states.has(input.state) ||
    !formats.has(input.format) ||
    (input.estimatedRuntimeSeconds !== null &&
      (!Number.isSafeInteger(input.estimatedRuntimeSeconds) ||
        input.estimatedRuntimeSeconds < 1 ||
        input.estimatedRuntimeSeconds > 86_400)) ||
    !Number.isSafeInteger(input.sectionCount) ||
    input.sectionCount < 1 ||
    input.sectionCount > 200 ||
    !createdAt
  ) {
    return null;
  }
  return {
    revisionNumber: input.revisionNumber,
    title,
    state: input.state,
    format: input.format,
    estimatedRuntimeSeconds: input.estimatedRuntimeSeconds,
    sectionCount: input.sectionCount,
    createdAt,
  };
}

function accessForRole(
  role: ProjectAccessRole,
  workspaceId: ProjectOperatingWorkspaceId,
): ProjectOperatingAccessMode {
  if (role === "owner" || role === "admin") return "manage";
  if (role === "producer") {
    return workspaceId === "archive" ? "read" : "manage";
  }
  if (role === "editor") {
    return workspaceId === "post_production" || workspaceId === "review"
      ? "contribute"
      : "read";
  }
  if (role === "member") {
    return workspaceId === "archive" || workspaceId === "sales"
      ? "read"
      : "contribute";
  }
  if (role === "reviewer") return "review";
  return "read";
}

function workspace(
  id: ProjectOperatingWorkspaceId,
  role: ProjectAccessRole,
  status: ProjectOperatingWorkspaceStatus,
  evidence: string[],
  blockers: string[],
): ProjectOperatingWorkspace {
  return {
    id,
    label: WORKSPACE_LABELS[id],
    status,
    access: accessForRole(role, id),
    evidence,
    blockers,
  };
}

function nextActionFor(workspaces: readonly ProjectOperatingWorkspace[]) {
  const candidate =
    workspaces.find((item) => item.status === "active") ??
    workspaces.find((item) => item.status === "ready") ??
    workspaces.find((item) => item.status === "blocked") ??
    workspaces.find((item) => item.status === "not_started");
  if (!candidate) return null;

  const label =
    candidate.status === "active"
      ? `Continue ${candidate.label}`
      : candidate.status === "ready"
        ? `Start ${candidate.label}`
        : `Resolve ${candidate.label}`;
  return {
    workspaceId: candidate.id,
    label,
    reason:
      candidate.blockers[0] ??
      candidate.evidence[0] ??
      `${candidate.label} is the next visible workspace for this role.`,
  };
}

export function buildProjectOperatingRecord(
  input: ProjectOperatingRecordInput,
): ProjectOperatingRecord {
  const context = parseHandoffContext(input.handoff);
  const plan = safePlan(input.plan);
  const script = safeScript(input.script);
  const evidence = input.evidence ?? null;
  const currentVersionCount = safeCount(evidence?.currentVersionCount);
  const openReviewThreadCount = safeCount(evidence?.openReviewThreadCount);
  const resolvedReviewThreadCount = safeCount(evidence?.resolvedReviewThreadCount);
  const latestCommentActivityAt = safeTimestamp(evidence?.latestCommentActivityAt);
  const manualOriginCreatedAt = safeString(input.manualOrigin?.createdAt, 64);
  const hasManualOrigin = !input.handoff && Boolean(manualOriginCreatedAt);
  const originReady = Boolean(input.handoff) || hasManualOrigin;
  const assetStatuses = input.assets.map((asset) => normalizedStatus(asset.status));
  const hasAssets = input.assets.length > 0;
  const readyAssetCount = assetStatuses.filter((status) =>
    ["ready", "in_review", "needs_changes", "approved", "final"].includes(status),
  ).length;
  const processingAssetCount = assetStatuses.filter((status) => status === "processing").length;
  const failedAssetCount = assetStatuses.filter((status) => status === "failed").length;
  const reviewableAssetCount = assetStatuses.filter((status) =>
    ["in_review", "needs_changes", "approved", "final"].includes(status),
  ).length;
  const activeReviewAssetCount = assetStatuses.filter((status) =>
    ["in_review", "needs_changes"].includes(status),
  ).length;
  const changesRequestedAssetCount = assetStatuses.filter(
    (status) => status === "needs_changes",
  ).length;
  const approvedAssetCount = assetStatuses.filter((status) =>
    ["approved", "final"].includes(status),
  ).length;
  const hasActiveReview = assetStatuses.some((status) =>
    ["in_review", "needs_changes", "revision"].includes(status),
  );
  const allAssetsPastProduction =
    hasAssets &&
    assetStatuses.every((status) =>
      ["in_review", "needs_changes", "approved", "final"].includes(status),
    );
  const allAssetsApproved =
    hasAssets &&
    assetStatuses.every((status) => ["approved", "final"].includes(status));
  const approvalStatuses = input.assets.flatMap((asset) =>
    asset.approvalStatuses.map(normalizedStatus),
  );
  const approvalsPending = approvalStatuses.filter((status) =>
    ["pending", "changes_requested"].includes(status),
  ).length;
  const approvalsComplete = approvalStatuses.filter(
    (status) => ["approved", "approved_with_changes"].includes(status),
  ).length;
  const activationReady = Boolean(
    input.handoff &&
      context.brief &&
      context.productionWindow &&
      context.deliverables.length > 0,
  );
  const planningReady = activationReady || hasManualOrigin;
  const planComplete = Boolean(
    plan &&
      plan.taskCount > 0 &&
      plan.completedTaskCount === plan.taskCount,
  );
  const planBlocked = Boolean(plan && plan.blockedTaskCount > 0);
  const planActive = Boolean(plan && !planComplete && !planBlocked);

  const allWorkspaces: ProjectOperatingWorkspace[] = [
    workspace(
      "sales",
      input.accessRole,
      input.handoff ? "complete" : "not_started",
      input.handoff
        ? ["Accepted proposal activation is bound to an immutable receipt."]
        : hasManualOrigin
          ? ["Manual project origin is recorded in Co-VideoPro."]
          : ["No durable project origin is recorded."],
      input.handoff
        ? []
        : hasManualOrigin
          ? ["No accepted proposal handoff is linked."]
          : ["Confirm the project origin before planning work begins."],
    ),
    workspace(
      "pre_production",
      input.accessRole,
      planComplete ? "complete" : planBlocked ? "blocked" : planActive ? "active" : planningReady ? "ready" : "blocked",
      [
        ...(hasManualOrigin ? ["A durable manual project origin is linked."] : []),
        ...(context.brief
          ? [`Durable project brief revision ${context.brief.revisionNumber} is linked.`]
          : context.briefId
            ? ["A production-safe brief reference is linked."]
            : []),
        ...(context.productionWindow ? ["The production window is linked."] : []),
        ...(context.deliverables.length > 0
          ? [`${context.deliverables.length} deliverable plan${context.deliverables.length === 1 ? " is" : "s are"} linked.`]
          : []),
        ...(plan
          ? [
              `Plan revision ${plan.revisionNumber} has ${plan.taskCount} task${plan.taskCount === 1 ? "" : "s"}.`,
            ]
          : []),
        ...(script
          ? [`Script revision ${script.revisionNumber} is ${script.state.replaceAll("_", " ")}.`]
          : []),
      ],
      [
        ...(planBlocked ? [`${plan?.blockedTaskCount ?? 0} planning task${plan?.blockedTaskCount === 1 ? " is" : "s are"} blocked.`] : []),
        ...(!originReady ? ["Project origin must be confirmed before planning."] : []),
        ...(input.handoff && !context.brief
          ? ["A durable project brief is not linked."]
          : []),
        ...(input.handoff && !context.productionWindow ? ["The production window is missing."] : []),
        ...(input.handoff && context.deliverables.length === 0 ? ["No deliverable plan is linked."] : []),
      ],
    ),
    workspace(
      "production",
      input.accessRole,
      hasAssets ? (allAssetsPastProduction ? "complete" : "active") : planningReady ? "ready" : "blocked",
      hasAssets
        ? [`${input.assets.length} project asset${input.assets.length === 1 ? " is" : "s are"} registered.`]
        : planningReady
          ? [input.handoff ? "The accepted production seed is ready for media intake." : "The manual project is ready for media intake."]
          : [],
      hasAssets || planningReady
        ? []
        : ["Production cannot start until a durable project origin is linked."],
    ),
    workspace(
      "post_production",
      input.accessRole,
      !hasAssets ? "blocked" : allAssetsApproved ? "complete" : "active",
      hasAssets
        ? [
            `${input.assets.reduce((total, asset) => total + asset.versionsCount, 0)} version record${input.assets.reduce((total, asset) => total + asset.versionsCount, 0) === 1 ? " is" : "s are"} linked.`,
            ...(currentVersionCount === null
              ? []
              : [`${currentVersionCount} current media version${currentVersionCount === 1 ? " is" : "s are"} recorded.`]),
          ]
        : [],
      hasAssets ? [] : ["No source media is registered for post-production."],
    ),
    workspace(
      "review",
      input.accessRole,
      allAssetsApproved
        ? "complete"
        : hasAssets &&
            (hasActiveReview ||
              approvalsPending > 0 ||
              (openReviewThreadCount ?? 0) > 0)
          ? "active"
          : hasAssets
            ? "ready"
            : "blocked",
      [
        ...(hasActiveReview ? ["At least one asset is in active review."] : []),
        ...(approvalStatuses.length > 0
          ? [`${approvalStatuses.length} approval step${approvalStatuses.length === 1 ? " is" : "s are"} linked.`]
          : []),
        ...(openReviewThreadCount === null
          ? []
          : [`${openReviewThreadCount} open review thread${openReviewThreadCount === 1 ? " is" : "s are"} recorded.`]),
        ...(resolvedReviewThreadCount === null
          ? []
          : [`${resolvedReviewThreadCount} resolved review thread${resolvedReviewThreadCount === 1 ? " is" : "s are"} recorded.`]),
      ],
      hasAssets ? [] : ["No reviewable media is registered."],
    ),
    workspace(
      "delivery",
      input.accessRole,
      allAssetsApproved ? "ready" : "blocked",
      allAssetsApproved ? ["All registered assets are approved or final."] : [],
      allAssetsApproved
        ? ["A durable delivery receipt is still required before delivery can be marked complete."]
        : ["Every delivery asset must be approved before release."],
    ),
    workspace(
      "archive",
      input.accessRole,
      ["archived", "completed"].includes(normalizedStatus(input.project.status))
        ? "complete"
        : allAssetsApproved
          ? "ready"
          : "blocked",
      ["archived", "completed"].includes(normalizedStatus(input.project.status))
        ? ["The authoritative project status is closed."]
        : [],
      ["archived", "completed"].includes(normalizedStatus(input.project.status))
        ? []
        : ["The project remains open."],
    ),
  ];

  const visibleIds = new Set(ROLE_WORKSPACES[input.accessRole]);
  const visibleWorkspaces = allWorkspaces.filter((item) => visibleIds.has(item.id));
  const privilegedLineage = ["owner", "admin", "producer"].includes(input.accessRole);
  const privilegedContext = ["owner", "admin", "producer", "member"].includes(
    input.accessRole,
  );
  const privilegedBriefContext = [
    "owner",
    "admin",
    "producer",
    "editor",
    "member",
  ].includes(input.accessRole);
  const privilegedScriptContext = privilegedBriefContext;
  const revisionTimestamp = latestTimestamp([
    input.project.updatedAt,
    input.handoff?.activatedAt ?? "",
    manualOriginCreatedAt ?? "",
    plan?.createdAt ?? "",
    plan?.updatedAt ?? "",
    context.brief?.createdAt ?? "",
    script?.createdAt ?? "",
    latestCommentActivityAt ?? "",
    ...input.assets.map((asset) => asset.updatedAt),
  ]);
  const lineageSource = input.handoff
    ? "accepted_proposal"
    : hasManualOrigin
      ? "manual_project"
      : "unlinked_project";

  return {
    schemaVersion: PROJECT_OPERATING_RECORD_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    revisionAt:
      revisionTimestamp > 0
        ? new Date(revisionTimestamp).toISOString()
        : input.project.updatedAt,
    project: {
      id: input.project.id,
      name: input.project.name,
      status: input.project.status,
    },
    authority: {
      project: "Co-VideoPro",
      commercial: input.handoff ? "CCO_OS" : "unlinked",
      preproject: input.handoff
        ? context.originLinked
          ? "Co-VideoPro CRM"
          : "external_reference"
        : hasManualOrigin
          ? "Co-VideoPro"
          : "unlinked",
      projection: "read_only",
    },
    lineage: {
      source: lineageSource,
      activatedAt: input.handoff?.activatedAt ?? null,
      ...(hasManualOrigin ? { originRecordedAt: manualOriginCreatedAt! } : {}),
      ...(input.handoff && privilegedLineage
        ? {
            receiptId: input.handoff.receiptId,
            displayNumber: input.handoff.displayNumber,
            packageId: input.handoff.packageId,
            packageVersion: input.handoff.packageVersion,
            proposalVersionId: input.handoff.proposalVersionId,
            quoteVersionId: input.handoff.quoteVersionId,
            preprojectOrigin: context.originLinked
              ? ("linked" as const)
              : ("external_reference" as const),
          }
        : {}),
    },
    context: {
      sourceInquiryId: privilegedContext ? context.sourceInquiryId : null,
      clientId: privilegedContext ? context.clientId : null,
      primaryContactId: privilegedContext ? context.primaryContactId : null,
      opportunityId: privilegedContext ? context.opportunityId : null,
      briefId: privilegedContext ? context.briefId : null,
      briefContentHash: privilegedContext ? context.briefContentHash : null,
      opportunityAuthorityVersion: privilegedContext
        ? context.opportunityAuthorityVersion
        : null,
      brief: privilegedBriefContext ? context.brief : null,
      script: privilegedScriptContext ? script : null,
      productionWindow: context.productionWindow,
      scopeItemIds: privilegedContext ? context.scopeItemIds : [],
      deliverables: context.deliverables,
      productionModules: context.productionModules,
    },
    metrics: {
      assets: input.assets.length,
      versions: input.assets.reduce((total, asset) => total + asset.versionsCount, 0),
      comments: input.assets.reduce((total, asset) => total + asset.commentsCount, 0),
      approvalsPending,
      approvalsComplete,
      deliverablesPlanned: context.deliverables.length,
      tasks: plan?.taskCount ?? 0,
      tasksCompleted: plan?.completedTaskCount ?? 0,
      tasksBlocked: plan?.blockedTaskCount ?? 0,
      planRevision: plan?.revisionNumber ?? null,
    },
    media: {
      registeredAssets: input.assets.length,
      readyAssets: readyAssetCount,
      processingAssets: processingAssetCount,
      failedAssets: failedAssetCount,
      currentVersions: currentVersionCount,
    },
    review: {
      reviewableAssets: reviewableAssetCount,
      activeAssets: activeReviewAssetCount,
      changesRequestedAssets: changesRequestedAssetCount,
      approvedAssets: approvedAssetCount,
      openThreads: openReviewThreadCount,
      resolvedThreads: resolvedReviewThreadCount,
      latestCommentActivityAt,
    },
    workspaces: visibleWorkspaces,
    nextAction: nextActionFor(visibleWorkspaces),
  };
}
