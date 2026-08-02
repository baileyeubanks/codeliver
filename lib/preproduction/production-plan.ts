export const PRODUCTION_PLAN_MAX_BYTES = 128 * 1024;
export const PRODUCTION_TASK_MUTATION_MAX_BYTES = 16 * 1024;
export const PRODUCTION_PLAN_TASK_LIMIT = 200;

export const PRODUCTION_TASK_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;

export const PRODUCTION_TASK_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export const PRODUCTION_TASK_SOURCES = [
  "plan",
  "review_comment",
  "manual",
  "agent_proposal",
] as const;

export type ProductionTaskStatus = (typeof PRODUCTION_TASK_STATUSES)[number];
export type ProductionTaskPriority = (typeof PRODUCTION_TASK_PRIORITIES)[number];
export type ProductionTaskSource = (typeof PRODUCTION_TASK_SOURCES)[number];

export interface ProductionPlanTaskSeed {
  clientTaskId: string;
  title: string;
  description: string | null;
  priority: ProductionTaskPriority;
  assigneeId: string | null;
  dueDate: string | null;
  sourceKind: ProductionTaskSource;
  sourceRef: string | null;
  dependsOnClientTaskIds: string[];
}

export interface ProductionPlanDraft {
  title: string;
  summary: string | null;
  tasks: ProductionPlanTaskSeed[];
}

export interface ProductionPlanInitialization extends ProductionPlanDraft {
  expectedPlanRevision: number;
  requestId: string;
}

export interface ProductionTaskPatch {
  status?: ProductionTaskStatus;
  title?: string;
  description?: string | null;
  priority?: ProductionTaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
}

export interface ProductionTaskMutation {
  expectedVersion: number;
  requestId: string;
  patch: ProductionTaskPatch;
}

export interface ProductionPlanRecord {
  id: string;
  projectId: string;
  revisionNumber: number;
  title: string;
  summary: string | null;
  status: "active" | "superseded";
  contentHash: string;
  sourceReceiptId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ProductionTaskRecord {
  id: string;
  projectId: string;
  planRevisionId: string;
  title: string;
  description: string | null;
  status: ProductionTaskStatus;
  priority: ProductionTaskPriority;
  assigneeId: string | null;
  dueDate: string | null;
  sourceKind: ProductionTaskSource;
  sourceRef: string | null;
  authorityVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionTaskDependency {
  taskId: string;
  dependsOnTaskId: string;
}

export interface ProductionPlanSnapshot {
  projectId: string;
  authorityVersion: number;
  eventHeadHash: string;
  plan: ProductionPlanRecord | null;
  tasks: ProductionTaskRecord[];
  dependencies: ProductionTaskDependency[];
  canInitialize: boolean;
  canManage: boolean;
  canUpdateStatus: boolean;
}

export interface ProductionPlanReceipt {
  planRevisionId: string;
  projectId: string;
  revisionNumber: number;
  authorityVersion: number;
  taskCount: number;
  requestId: string;
  replayed: boolean;
}

export interface ProductionTaskMutationReceipt {
  taskId: string;
  projectId: string;
  authorityVersion: number;
  taskAuthorityVersion: number;
  status: ProductionTaskStatus;
  requestId: string;
  replayed: boolean;
}

type JsonObject = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_TASK_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,79}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

export class ProductionPlanValidationError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "ProductionPlanValidationError";
    this.code = code;
    this.field = field;
  }
}

function fail(code: string, message: string, field?: string): never {
  throw new ProductionPlanValidationError(code, message, field);
}

function objectValue(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_object", `${field} must be an object`, field);
  }
  return value as JsonObject;
}

function assertAllowedKeys(value: JsonObject, field: string, allowed: readonly string[]) {
  const allowlist = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowlist.has(key));
  if (unknown) {
    fail("unknown_field", `${field}.${unknown} is not accepted`, `${field}.${unknown}`);
  }
}

function boundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    fail("invalid_string", `${field} must be a string`, field);
  }
  const normalized = value.trim().replace(/\r\n?/g, "\n");
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
  ) {
    fail(
      "invalid_string",
      `${field} must contain between 1 and ${maxLength} safe characters`,
      field,
    );
  }
  return normalized;
}

function optionalString(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return boundedString(value, field, maxLength);
}

function exactUuid(value: unknown, field: string): string {
  const normalized = boundedString(value, field, 36).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    fail("invalid_uuid", `${field} must be a UUID`, field);
  }
  return normalized;
}

export function normalizeProductionUuid(value: unknown, field: string): string {
  return exactUuid(value, field);
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return exactUuid(value, field);
}

function exactInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail("invalid_integer", `${field} must be an integer from ${minimum} to ${maximum}`, field);
  }
  return value as number;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail("invalid_enum", `${field} is invalid`, field);
  }
  return value as T[number];
}

function calendarDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const normalized = boundedString(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    fail("invalid_date", `${field} must use YYYY-MM-DD`, field);
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== normalized) {
    fail("invalid_date", `${field} must be a real calendar date`, field);
  }
  return normalized;
}

function clientTaskId(value: unknown, field: string): string {
  const normalized = boundedString(value, field, 80).toLowerCase();
  if (!CLIENT_TASK_ID_PATTERN.test(normalized)) {
    fail("invalid_task_id", `${field} must use a stable lowercase task key`, field);
  }
  return normalized;
}

function parseTaskSeed(value: unknown, index: number): ProductionPlanTaskSeed {
  const field = `plan.tasks[${index}]`;
  const task = objectValue(value, field);
  assertAllowedKeys(task, field, [
    "clientTaskId",
    "title",
    "description",
    "priority",
    "assigneeId",
    "dueDate",
    "sourceKind",
    "sourceRef",
    "dependsOnClientTaskIds",
  ]);
  if (!Array.isArray(task.dependsOnClientTaskIds) || task.dependsOnClientTaskIds.length > 40) {
    fail(
      "invalid_dependencies",
      `${field}.dependsOnClientTaskIds must contain no more than 40 task keys`,
      `${field}.dependsOnClientTaskIds`,
    );
  }
  const dependencies = task.dependsOnClientTaskIds.map((dependency, dependencyIndex) =>
    clientTaskId(dependency, `${field}.dependsOnClientTaskIds[${dependencyIndex}]`),
  );
  if (new Set(dependencies).size !== dependencies.length) {
    fail("duplicate_dependencies", `${field} cannot repeat a dependency`, `${field}.dependsOnClientTaskIds`);
  }
  const id = clientTaskId(task.clientTaskId, `${field}.clientTaskId`);
  if (dependencies.includes(id)) {
    fail("self_dependency", `${field} cannot depend on itself`, `${field}.dependsOnClientTaskIds`);
  }
  return {
    clientTaskId: id,
    title: boundedString(task.title, `${field}.title`, 240),
    description: optionalString(task.description, `${field}.description`, 4_000),
    priority: enumValue(task.priority, `${field}.priority`, PRODUCTION_TASK_PRIORITIES),
    assigneeId: optionalUuid(task.assigneeId, `${field}.assigneeId`),
    dueDate: calendarDate(task.dueDate, `${field}.dueDate`),
    sourceKind: enumValue(task.sourceKind, `${field}.sourceKind`, PRODUCTION_TASK_SOURCES),
    sourceRef: optionalString(task.sourceRef, `${field}.sourceRef`, 160),
    dependsOnClientTaskIds: dependencies,
  };
}

function assertAcyclicTasks(tasks: readonly ProductionPlanTaskSeed[]) {
  const byId = new Map(tasks.map((task) => [task.clientTaskId, task]));
  for (const task of tasks) {
    for (const dependency of task.dependsOnClientTaskIds) {
      if (!byId.has(dependency)) {
        fail(
          "missing_dependency",
          `${task.clientTaskId} depends on unknown task ${dependency}`,
          "plan.tasks",
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      fail("dependency_cycle", "Task dependencies must not contain a cycle", "plan.tasks");
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOnClientTaskIds ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.clientTaskId);
}

function parseProductionPlanDraftFields(plan: JsonObject): ProductionPlanDraft {
  if (!Array.isArray(plan.tasks) || plan.tasks.length < 1 || plan.tasks.length > PRODUCTION_PLAN_TASK_LIMIT) {
    fail(
      "invalid_tasks",
      `plan.tasks must contain between 1 and ${PRODUCTION_PLAN_TASK_LIMIT} tasks`,
      "plan.tasks",
    );
  }
  const tasks = plan.tasks.map(parseTaskSeed);
  if (new Set(tasks.map((task) => task.clientTaskId)).size !== tasks.length) {
    fail("duplicate_task_ids", "plan.tasks must use unique clientTaskId values", "plan.tasks");
  }
  assertAcyclicTasks(tasks);
  return {
    title: boundedString(plan.title, "plan.title", 240),
    summary: optionalString(plan.summary, "plan.summary", 4_000),
    tasks,
  };
}

export function parseProductionPlanDraft(value: unknown): ProductionPlanDraft {
  const plan = objectValue(value, "plan");
  assertAllowedKeys(plan, "plan", ["title", "summary", "tasks"]);
  return parseProductionPlanDraftFields(plan);
}

export function parseProductionPlanInitialization(value: unknown): ProductionPlanInitialization {
  const plan = objectValue(value, "plan");
  assertAllowedKeys(plan, "plan", [
    "expectedPlanRevision",
    "requestId",
    "title",
    "summary",
    "tasks",
  ]);
  const draft = parseProductionPlanDraftFields(plan);
  return {
    expectedPlanRevision: exactInteger(
      plan.expectedPlanRevision,
      "plan.expectedPlanRevision",
      0,
      2_147_483_646,
    ),
    requestId: exactUuid(plan.requestId, "plan.requestId"),
    ...draft,
  };
}

export function parseProductionTaskMutation(value: unknown): ProductionTaskMutation {
  const mutation = objectValue(value, "mutation");
  assertAllowedKeys(mutation, "mutation", ["expectedVersion", "requestId", "patch"]);
  const patch = objectValue(mutation.patch, "mutation.patch");
  assertAllowedKeys(patch, "mutation.patch", [
    "status",
    "title",
    "description",
    "priority",
    "assigneeId",
    "dueDate",
  ]);
  if (Object.keys(patch).length === 0) {
    fail("empty_patch", "mutation.patch must change at least one task field", "mutation.patch");
  }
  return {
    expectedVersion: exactInteger(mutation.expectedVersion, "mutation.expectedVersion", 1, 2_147_483_646),
    requestId: exactUuid(mutation.requestId, "mutation.requestId"),
    patch: {
      ...(patch.status !== undefined
        ? { status: enumValue(patch.status, "mutation.patch.status", PRODUCTION_TASK_STATUSES) }
        : {}),
      ...(patch.title !== undefined
        ? { title: boundedString(patch.title, "mutation.patch.title", 240) }
        : {}),
      ...(patch.description !== undefined
        ? { description: optionalString(patch.description, "mutation.patch.description", 4_000) }
        : {}),
      ...(patch.priority !== undefined
        ? { priority: enumValue(patch.priority, "mutation.patch.priority", PRODUCTION_TASK_PRIORITIES) }
        : {}),
      ...(patch.assigneeId !== undefined
        ? { assigneeId: optionalUuid(patch.assigneeId, "mutation.patch.assigneeId") }
        : {}),
      ...(patch.dueDate !== undefined
        ? { dueDate: calendarDate(patch.dueDate, "mutation.patch.dueDate") }
        : {}),
    },
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nullableStringValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  return stringValue(value) ?? undefined;
}

export function parseProductionPlanSnapshot(value: unknown): ProductionPlanSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as JsonObject;
  const projectId = stringValue(snapshot.projectId);
  const authorityVersion = numberValue(snapshot.authorityVersion);
  const eventHeadHash = stringValue(snapshot.eventHeadHash);
  const permissions = snapshot.permissions && typeof snapshot.permissions === "object"
    && !Array.isArray(snapshot.permissions)
    ? (snapshot.permissions as JsonObject)
    : null;
  const canInitialize = booleanValue(permissions?.canInitialize);
  const canManage = booleanValue(permissions?.canManage);
  const canUpdateStatus = booleanValue(permissions?.canUpdateStatus);
  if (
    !projectId ||
    authorityVersion === null ||
    !eventHeadHash ||
    canInitialize === null ||
    canManage === null ||
    canUpdateStatus === null ||
    !Array.isArray(snapshot.tasks) ||
    !Array.isArray(snapshot.dependencies)
  ) {
    return null;
  }

  let plan: ProductionPlanRecord | null = null;
  if (snapshot.plan !== null) {
    if (!snapshot.plan || typeof snapshot.plan !== "object" || Array.isArray(snapshot.plan)) {
      return null;
    }
    const candidate = snapshot.plan as JsonObject;
    const id = stringValue(candidate.id);
    const candidateProjectId = stringValue(candidate.projectId);
    const revisionNumber = numberValue(candidate.revisionNumber);
    const title = stringValue(candidate.title);
    const summary = nullableStringValue(candidate.summary);
    const status = candidate.status === "active" || candidate.status === "superseded"
      ? candidate.status
      : null;
    const contentHash = stringValue(candidate.contentHash);
    const sourceReceiptId = nullableStringValue(candidate.sourceReceiptId);
    const createdBy = stringValue(candidate.createdBy);
    const createdAt = stringValue(candidate.createdAt);
    if (
      !id ||
      !candidateProjectId ||
      revisionNumber === null ||
      !title ||
      summary === undefined ||
      !status ||
      !contentHash ||
      sourceReceiptId === undefined ||
      !createdBy ||
      !createdAt
    ) {
      return null;
    }
    plan = {
      id,
      projectId: candidateProjectId,
      revisionNumber,
      title,
      summary,
      status,
      contentHash,
      sourceReceiptId,
      createdBy,
      createdAt,
    };
  }

  const tasks: ProductionTaskRecord[] = [];
  for (const rawTask of snapshot.tasks) {
    if (!rawTask || typeof rawTask !== "object" || Array.isArray(rawTask)) return null;
    const task = rawTask as JsonObject;
    const id = stringValue(task.id);
    const taskProjectId = stringValue(task.projectId);
    const planRevisionId = stringValue(task.planRevisionId);
    const title = stringValue(task.title);
    const description = nullableStringValue(task.description);
    const status = typeof task.status === "string" && PRODUCTION_TASK_STATUSES.includes(
      task.status as ProductionTaskStatus,
    ) ? (task.status as ProductionTaskStatus) : null;
    const priority = typeof task.priority === "string" && PRODUCTION_TASK_PRIORITIES.includes(
      task.priority as ProductionTaskPriority,
    ) ? (task.priority as ProductionTaskPriority) : null;
    const assigneeId = nullableStringValue(task.assigneeId);
    const dueDate = nullableStringValue(task.dueDate);
    const sourceKind = typeof task.sourceKind === "string" && PRODUCTION_TASK_SOURCES.includes(
      task.sourceKind as ProductionTaskSource,
    ) ? (task.sourceKind as ProductionTaskSource) : null;
    const sourceRef = nullableStringValue(task.sourceRef);
    const taskAuthorityVersion = numberValue(task.authorityVersion);
    const createdAt = stringValue(task.createdAt);
    const updatedAt = stringValue(task.updatedAt);
    if (
      !id ||
      !taskProjectId ||
      !planRevisionId ||
      !title ||
      description === undefined ||
      !status ||
      !priority ||
      assigneeId === undefined ||
      dueDate === undefined ||
      !sourceKind ||
      sourceRef === undefined ||
      taskAuthorityVersion === null ||
      !createdAt ||
      !updatedAt
    ) {
      return null;
    }
    tasks.push({
      id,
      projectId: taskProjectId,
      planRevisionId,
      title,
      description,
      status,
      priority,
      assigneeId,
      dueDate,
      sourceKind,
      sourceRef,
      authorityVersion: taskAuthorityVersion,
      createdAt,
      updatedAt,
    });
  }

  const dependencies: ProductionTaskDependency[] = [];
  for (const rawDependency of snapshot.dependencies) {
    if (!rawDependency || typeof rawDependency !== "object" || Array.isArray(rawDependency)) {
      return null;
    }
    const dependency = rawDependency as JsonObject;
    const taskId = stringValue(dependency.taskId);
    const dependsOnTaskId = stringValue(dependency.dependsOnTaskId);
    if (!taskId || !dependsOnTaskId) return null;
    dependencies.push({ taskId, dependsOnTaskId });
  }

  return {
    projectId,
    authorityVersion,
    eventHeadHash,
    plan,
    tasks,
    dependencies,
    canInitialize,
    canManage,
    canUpdateStatus,
  };
}

export function parseProductionPlanReceipt(value: unknown): ProductionPlanReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const receipt = value as JsonObject;
  const planRevisionId = stringValue(receipt.planRevisionId);
  const projectId = stringValue(receipt.projectId);
  const revisionNumber = numberValue(receipt.revisionNumber);
  const authorityVersion = numberValue(receipt.authorityVersion);
  const taskCount = numberValue(receipt.taskCount);
  const requestId = stringValue(receipt.requestId);
  const replayed = booleanValue(receipt.replayed);
  if (
    !planRevisionId ||
    !projectId ||
    revisionNumber === null ||
    authorityVersion === null ||
    taskCount === null ||
    !requestId ||
    replayed === null
  ) {
    return null;
  }
  return {
    planRevisionId,
    projectId,
    revisionNumber,
    authorityVersion,
    taskCount,
    requestId,
    replayed,
  };
}

export function parseProductionTaskMutationReceipt(
  value: unknown,
): ProductionTaskMutationReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const receipt = value as JsonObject;
  const taskId = stringValue(receipt.taskId);
  const projectId = stringValue(receipt.projectId);
  const authorityVersion = numberValue(receipt.authorityVersion);
  const taskAuthorityVersion = numberValue(receipt.taskAuthorityVersion);
  const requestId = stringValue(receipt.requestId);
  const replayed = booleanValue(receipt.replayed);
  const status = typeof receipt.status === "string" && PRODUCTION_TASK_STATUSES.includes(
    receipt.status as ProductionTaskStatus,
  )
    ? (receipt.status as ProductionTaskStatus)
    : null;
  if (
    !taskId ||
    !projectId ||
    authorityVersion === null ||
    taskAuthorityVersion === null ||
    !requestId ||
    replayed === null ||
    !status
  ) {
    return null;
  }
  return {
    taskId,
    projectId,
    authorityVersion,
    taskAuthorityVersion,
    status,
    requestId,
    replayed,
  };
}

export function isProductionContentHash(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}
