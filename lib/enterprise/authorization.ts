import { createHash } from "node:crypto";

export const ENTERPRISE_AUTHORIZATION_SCHEMA =
  "enterprise.authorization.request.v1" as const;
export const ACTIVE_ENTERPRISE_POLICY_VERSION =
  "enterprise-governance/2026-07-14.1" as const;
export const PREVIOUS_ENTERPRISE_POLICY_VERSION =
  "enterprise-governance/2026-07-14.0" as const;

export type EnterpriseRole = "owner" | "admin" | "member" | "viewer";

export type EnterpriseAction =
  | "tenant.read"
  | "identity.read"
  | "identity.role.change"
  | "governance.audit.read"
  | "governance.policy.change";

export type AssignableEnterpriseRole = Exclude<EnterpriseRole, "owner">;

export type EnterpriseAuthorizationTarget =
  | {
      kind: "tenant";
      tenantId: string;
    }
  | {
      kind: "identity";
      tenantId: string;
      subjectId: string;
      requestedRole?: AssignableEnterpriseRole;
    };

export interface EnterpriseAuthorizationRequest {
  schemaVersion: typeof ENTERPRISE_AUTHORIZATION_SCHEMA;
  tenantId: string;
  policyVersion: string;
  action: EnterpriseAction;
  target: EnterpriseAuthorizationTarget;
  idempotencyKey: string;
}

export type EnterpriseAuthorizationRequestWithoutKey = Omit<
  EnterpriseAuthorizationRequest,
  "idempotencyKey"
>;

export interface EnterpriseActor {
  /** Authenticated server-side subject. Never accept this value from a request body. */
  id: string;
  /** Tenant membership resolved server-side. */
  tenantId: string;
  /** Role resolved server-side from the tenant membership record. */
  role: EnterpriseRole;
}

export type EnterpriseDecisionReason =
  | "ALLOWED"
  | "TENANT_MISMATCH"
  | "STALE_POLICY_VERSION"
  | "IDEMPOTENCY_KEY_MISMATCH"
  | "TARGET_ACTION_MISMATCH"
  | "PERMISSION_DENIED"
  | "OWNER_SELF_MUTATION";

export interface EnterpriseAuthorizationDecision {
  schemaVersion: "enterprise.authorization.decision.v1";
  decisionId: string;
  effect: "allow" | "deny";
  reason: EnterpriseDecisionReason;
  action: EnterpriseAction;
  actor: {
    subjectId: string;
    tenantId: string;
    role: EnterpriseRole;
  };
  binding: {
    tenantId: string;
    targetKind: EnterpriseAuthorizationTarget["kind"];
    policyVersion: string;
    previousPolicyVersion: typeof PREVIOUS_ENTERPRISE_POLICY_VERSION;
    idempotencyKey: string;
  };
  observability: {
    requestId: string;
    evaluatedAt: string;
  };
}

export interface EnterpriseDecisionContext {
  requestId: string;
  evaluatedAt?: string;
  /** Allows an operator-controlled rollback to an immutable registered policy. */
  activePolicyVersion?: string;
}

export type EnterpriseRequestParseResult =
  | { ok: true; value: EnterpriseAuthorizationRequest }
  | { ok: false; issues: string[] };

const ACTIONS = new Set<EnterpriseAction>([
  "tenant.read",
  "identity.read",
  "identity.role.change",
  "governance.audit.read",
  "governance.policy.change",
]);

const ASSIGNABLE_ROLES = new Set<AssignableEnterpriseRole>([
  "admin",
  "member",
  "viewer",
]);

const PERMISSIONS: Record<EnterpriseRole, ReadonlySet<EnterpriseAction>> = {
  owner: new Set(ACTIONS),
  admin: new Set([
    "tenant.read",
    "identity.read",
    "governance.audit.read",
  ]),
  member: new Set(["tenant.read"]),
  viewer: new Set(["tenant.read"]),
};

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[a-f0-9]{64}$/;

export function isEnterpriseRole(value: unknown): value is EnterpriseRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

export function computeEnterpriseIdempotencyKey(
  request: EnterpriseAuthorizationRequestWithoutKey,
): string {
  return sha256(canonicalJson(request));
}

export function parseEnterpriseAuthorizationRequest(
  input: unknown,
): EnterpriseRequestParseResult {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, issues: ["body must be a JSON object"] };
  }

  rejectUnknownKeys(
    input,
    [
      "schemaVersion",
      "tenantId",
      "policyVersion",
      "action",
      "target",
      "idempotencyKey",
    ],
    "body",
    issues,
  );

  if (input.schemaVersion !== ENTERPRISE_AUTHORIZATION_SCHEMA) {
    issues.push(`schemaVersion must be ${ENTERPRISE_AUTHORIZATION_SCHEMA}`);
  }

  validateIdentifier(input.tenantId, "tenantId", issues);
  validateVersion(input.policyVersion, "policyVersion", issues);

  if (!ACTIONS.has(input.action as EnterpriseAction)) {
    issues.push("action is not supported");
  }

  if (
    typeof input.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)
  ) {
    issues.push("idempotencyKey must be a lowercase SHA-256 hex value");
  }

  const target = parseTarget(input.target, issues);
  if (issues.length > 0 || !target) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      schemaVersion: ENTERPRISE_AUTHORIZATION_SCHEMA,
      tenantId: input.tenantId as string,
      policyVersion: input.policyVersion as string,
      action: input.action as EnterpriseAction,
      target,
      idempotencyKey: input.idempotencyKey as string,
    },
  };
}

export function evaluateEnterpriseAuthorization(
  request: EnterpriseAuthorizationRequest,
  actor: EnterpriseActor,
  context: EnterpriseDecisionContext,
): EnterpriseAuthorizationDecision {
  const activePolicyVersion =
    context.activePolicyVersion ?? ACTIVE_ENTERPRISE_POLICY_VERSION;
  const expectedIdempotencyKey = computeEnterpriseIdempotencyKey({
    schemaVersion: request.schemaVersion,
    tenantId: request.tenantId,
    policyVersion: request.policyVersion,
    action: request.action,
    target: request.target,
  });

  let reason: EnterpriseDecisionReason = "ALLOWED";

  if (
    actor.tenantId !== request.tenantId ||
    request.target.tenantId !== request.tenantId
  ) {
    reason = "TENANT_MISMATCH";
  } else if (request.policyVersion !== activePolicyVersion) {
    reason = "STALE_POLICY_VERSION";
  } else if (request.idempotencyKey !== expectedIdempotencyKey) {
    reason = "IDEMPOTENCY_KEY_MISMATCH";
  } else if (!targetMatchesAction(request.action, request.target)) {
    reason = "TARGET_ACTION_MISMATCH";
  } else if (
    request.action === "identity.role.change" &&
    request.target.kind === "identity" &&
    request.target.subjectId === actor.id
  ) {
    reason = "OWNER_SELF_MUTATION";
  } else if (!PERMISSIONS[actor.role].has(request.action)) {
    reason = "PERMISSION_DENIED";
  }

  const effect = reason === "ALLOWED" ? "allow" : "deny";
  const decisionId = `ead_${sha256(
    canonicalJson({
      actor,
      request,
      activePolicyVersion,
      effect,
      reason,
    }),
  )}`;

  return {
    schemaVersion: "enterprise.authorization.decision.v1",
    decisionId,
    effect,
    reason,
    action: request.action,
    actor: {
      subjectId: actor.id,
      tenantId: actor.tenantId,
      role: actor.role,
    },
    binding: {
      tenantId: request.tenantId,
      targetKind: request.target.kind,
      policyVersion: activePolicyVersion,
      previousPolicyVersion: PREVIOUS_ENTERPRISE_POLICY_VERSION,
      idempotencyKey: request.idempotencyKey,
    },
    observability: {
      requestId: context.requestId,
      evaluatedAt: context.evaluatedAt ?? new Date().toISOString(),
    },
  };
}

function parseTarget(
  input: unknown,
  issues: string[],
): EnterpriseAuthorizationTarget | null {
  if (!isRecord(input)) {
    issues.push("target must be an object");
    return null;
  }

  if (input.kind === "tenant") {
    rejectUnknownKeys(input, ["kind", "tenantId"], "target", issues);
    validateIdentifier(input.tenantId, "target.tenantId", issues);
    if (issues.length > 0) return null;
    return { kind: "tenant", tenantId: input.tenantId as string };
  }

  if (input.kind === "identity") {
    rejectUnknownKeys(
      input,
      ["kind", "tenantId", "subjectId", "requestedRole"],
      "target",
      issues,
    );
    validateIdentifier(input.tenantId, "target.tenantId", issues);
    validateIdentifier(input.subjectId, "target.subjectId", issues);
    if (
      input.requestedRole !== undefined &&
      !ASSIGNABLE_ROLES.has(input.requestedRole as AssignableEnterpriseRole)
    ) {
      issues.push("target.requestedRole must be admin, member, or viewer");
    }
    if (issues.length > 0) return null;
    return {
      kind: "identity",
      tenantId: input.tenantId as string,
      subjectId: input.subjectId as string,
      ...(input.requestedRole === undefined
        ? {}
        : { requestedRole: input.requestedRole as AssignableEnterpriseRole }),
    };
  }

  issues.push("target.kind must be tenant or identity");
  return null;
}

function targetMatchesAction(
  action: EnterpriseAction,
  target: EnterpriseAuthorizationTarget,
): boolean {
  if (action === "identity.read") {
    return target.kind === "identity" && target.requestedRole === undefined;
  }
  if (action === "identity.role.change") {
    return target.kind === "identity" && target.requestedRole !== undefined;
  }
  return target.kind === "tenant";
}

function validateIdentifier(
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    issues.push(`${path} must be a safe non-empty identifier`);
  }
}

function validateVersion(value: unknown, path: string, issues: string[]): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(value)
  ) {
    issues.push(`${path} must be a safe non-empty version identifier`);
  }
}

function rejectUnknownKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(input)) {
    if (!allowedSet.has(key)) issues.push(`${path}.${key} is not allowed`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
