import { compositeKey, deterministicId, sha256 } from "../metering/canonical";
import type {
  VaultActor,
  VaultCapability,
  VaultIdempotencyRecord,
  VaultProjectPolicy,
  VaultScope,
} from "./types";

const VAULT_CAPABILITIES: readonly VaultCapability[] = [
  "vault:read",
  "vault:write",
  "vault:retrieve",
  "vault:export",
  "agent:plan",
  "agent:submit_output",
  "agent:approve",
  "agent:cancel",
  "agent:rollback",
  "agent:audit",
];

const VAULT_ROLES: readonly VaultActor["role"][] = [
  "owner",
  "admin",
  "creator",
  "auditor",
  "agent",
  "service",
  "reviewer",
  "client",
];

const VAULT_ACTOR_KINDS: readonly VaultActor["kind"][] = [
  "human",
  "service",
  "agent",
];

export class VaultError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "VaultError";
    this.code = code;
    this.status = status;
  }
}

export function assertVaultIdentifier(value: string, field: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new VaultError("invalid_identifier", `${field} is invalid`);
  }
}

export function assertVaultScope(scope: VaultScope) {
  assertVaultIdentifier(scope.organizationId, "organizationId");
  assertVaultIdentifier(scope.projectId, "projectId");
}

export function vaultScopeKey(scope: VaultScope) {
  return compositeKey(scope.organizationId, scope.projectId);
}

export function assertVaultActor(actor: VaultActor) {
  if (!VAULT_ROLES.includes(actor.role)) {
    throw new VaultError("invalid_actor_role", "actor.role is invalid");
  }
  if (!VAULT_ACTOR_KINDS.includes(actor.kind)) {
    throw new VaultError("invalid_actor_kind", "actor.kind is invalid");
  }
  if (!Array.isArray(actor.capabilities)) {
    throw new VaultError("invalid_capabilities", "actor.capabilities must be an array");
  }
  assertVaultIdentifier(actor.id, "actor.id");
  const expectedKind =
    actor.role === "agent" ? "agent" : actor.role === "service" ? "service" : "human";
  if (actor.kind !== expectedKind) {
    throw new VaultError("invalid_actor", `Actor role ${actor.role} requires ${expectedKind} kind`);
  }
  if (new Set(actor.capabilities).size !== actor.capabilities.length) {
    throw new VaultError("invalid_capabilities", "Actor capabilities must be unique");
  }
  for (const capability of actor.capabilities) {
    if (!VAULT_CAPABILITIES.includes(capability)) {
      throw new VaultError("invalid_capability", `Unknown actor capability: ${capability}`);
    }
  }
}

export function assertVaultTimestamp(value: string, field: string) {
  if (!Number.isFinite(Date.parse(value))) {
    throw new VaultError("invalid_timestamp", `${field} must be a valid timestamp`);
  }
}

export function assertVaultIdempotencyKey(key: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key)) {
    throw new VaultError(
      "invalid_idempotency_key",
      "idempotencyKey must be 8-128 URL-safe characters",
    );
  }
}

export function sameVaultScope(left: VaultScope, right: VaultScope) {
  return (
    left.organizationId === right.organizationId && left.projectId === right.projectId
  );
}

export interface CreateVaultPolicyInput {
  scope: VaultScope;
  version: string;
  allowedStorageRegions: readonly string[];
  allowedProcessingRegions: readonly string[];
  allowedExternalDomains?: readonly string[];
  allowedProviders: readonly string[];
  allowedModels: readonly string[];
  maximumRetentionDays: number;
  maximumAgentContextCharacters?: number;
  maximumAgentAttemptsPerReservation?: number;
  requireReviewedAgentSources?: boolean;
  confidentialProviderUseAllowed?: boolean;
  auditRetentionDays: number;
  actor: VaultActor;
  configuredAt: string;
}

export function createVaultProjectPolicy(
  input: CreateVaultPolicyInput,
): VaultProjectPolicy {
  assertVaultScope(input.scope);
  assertVaultActor(input.actor);
  if (!(["owner", "admin", "service"] as const).includes(input.actor.role as "owner" | "admin" | "service")) {
    throw new VaultError("forbidden", "Vault policy requires owner, admin, or service authority", 403);
  }
  if (!Number.isInteger(input.maximumRetentionDays) || input.maximumRetentionDays < 1) {
    throw new VaultError("invalid_retention", "maximumRetentionDays must be positive");
  }
  if (!Number.isInteger(input.auditRetentionDays) || input.auditRetentionDays < 1) {
    throw new VaultError("invalid_retention", "auditRetentionDays must be positive");
  }
  const maximumAgentContextCharacters = input.maximumAgentContextCharacters ?? 64_000;
  if (
    !Number.isSafeInteger(maximumAgentContextCharacters) ||
    maximumAgentContextCharacters < 1_024 ||
    maximumAgentContextCharacters > 1_000_000
  ) {
    throw new VaultError(
      "invalid_context_limit",
      "maximumAgentContextCharacters must be between 1024 and 1000000",
    );
  }
  const maximumAgentAttemptsPerReservation =
    input.maximumAgentAttemptsPerReservation ?? 3;
  if (
    !Number.isSafeInteger(maximumAgentAttemptsPerReservation) ||
    maximumAgentAttemptsPerReservation < 1 ||
    maximumAgentAttemptsPerReservation > 10
  ) {
    throw new VaultError(
      "invalid_attempt_limit",
      "maximumAgentAttemptsPerReservation must be between 1 and 10",
    );
  }
  if (!input.allowedStorageRegions.length || !input.allowedProcessingRegions.length) {
    throw new VaultError("residency_required", "Storage and processing region allowlists are required");
  }
  assertVaultTimestamp(input.configuredAt, "configuredAt");
  assertVaultIdentifier(input.version, "version");
  for (const [field, values] of [
    ["allowedStorageRegions", input.allowedStorageRegions],
    ["allowedProcessingRegions", input.allowedProcessingRegions],
    ["allowedProviders", input.allowedProviders],
    ["allowedModels", input.allowedModels],
  ] as const) {
    for (const value of values) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(value)) {
        throw new VaultError("invalid_policy_value", `${field} contains an invalid value`);
      }
    }
  }
  for (const domain of input.allowedExternalDomains ?? []) {
    if (
      domain !== domain.toLowerCase() ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,62})\.)+[a-z0-9][a-z0-9-]{0,62}$/.test(domain)
    ) {
      throw new VaultError(
        "invalid_external_domain",
        "External domains must be lowercase DNS hostnames",
      );
    }
  }

  const unsigned = {
    id: deterministicId("vpp", {
      scope: input.scope,
      version: input.version,
      configuredAt: input.configuredAt,
    }),
    schemaVersion: "vault-project-policy.v1" as const,
    scope: input.scope,
    version: input.version,
    allowedStorageRegions: [...new Set(input.allowedStorageRegions)].sort(),
    allowedProcessingRegions: [...new Set(input.allowedProcessingRegions)].sort(),
    allowedExternalDomains: [...new Set(input.allowedExternalDomains ?? [])]
      .map((domain) => domain.toLowerCase())
      .sort(),
    allowedProviders: [...new Set(input.allowedProviders)].sort(),
    allowedModels: [...new Set(input.allowedModels)].sort(),
    maximumRetentionDays: input.maximumRetentionDays,
    maximumAgentContextCharacters,
    maximumAgentAttemptsPerReservation,
    requireReviewedAgentSources: input.requireReviewedAgentSources ?? true,
    promptInjectionAction: "quarantine" as const,
    confidentialProviderUseAllowed: input.confidentialProviderUseAllowed ?? false,
    auditRetentionDays: input.auditRetentionDays,
    configuredBy: input.actor.id,
    configuredAt: input.configuredAt,
  };
  return { ...unsigned, integrityHash: sha256(unsigned) };
}

export function vaultResourceIntegrity<T extends { integrityHash: string }>(resource: T) {
  const { integrityHash: _integrityHash, ...unsigned } = resource;
  void _integrityHash;
  return sha256(unsigned);
}

export function createVaultIdempotencyRecord(
  scope: VaultScope,
  action: string,
  key: string,
  requestHash: string,
  resourceType: VaultIdempotencyRecord["resourceType"],
  resourceId: string,
  createdAt: string,
): VaultIdempotencyRecord {
  const unsigned = {
    scopeKey: vaultScopeKey(scope),
    action,
    key,
    requestHash,
    resourceType,
    resourceId,
    createdAt,
  };
  return { ...unsigned, integrityHash: sha256(unsigned) };
}
