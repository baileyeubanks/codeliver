import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./typescript-resolver.mjs", import.meta.url);

const {
  AgentHarness,
  assertVaultActor,
  createVaultProjectPolicy,
  InMemoryVaultRepository,
  reconcileVaultSnapshot,
  VaultError,
  VaultService,
  vaultScopeKey,
} = await import("../lib/vault/index.ts");
const { sha256 } = await import("../lib/metering/canonical.ts");

import type { VaultAuditEventDraft } from "../lib/vault/repository.ts";
import type {
  AgentRunRequest,
  AgentUsageAuthorization,
  VaultActor,
  VaultScope,
} from "../lib/vault/types.ts";

const scope: VaultScope = {
  organizationId: "org-vault-hardening",
  projectId: "project-alpha",
};

const owner: VaultActor = {
  id: "owner-hardening",
  role: "owner",
  kind: "human",
  capabilities: [
    "vault:read",
    "vault:write",
    "vault:retrieve",
    "vault:export",
    "agent:approve",
    "agent:cancel",
    "agent:rollback",
    "agent:audit",
  ],
};

const creator: VaultActor = {
  id: "creator-hardening",
  role: "creator",
  kind: "human",
  capabilities: ["vault:read", "vault:write", "vault:retrieve"],
};

const agent: VaultActor = {
  id: "agent-hardening",
  role: "agent",
  kind: "agent",
  capabilities: [
    "vault:read",
    "vault:retrieve",
    "agent:plan",
    "agent:submit_output",
    "agent:cancel",
  ],
};

function fixture(
  options: {
    repository?: InstanceType<typeof InMemoryVaultRepository>;
    maximumAgentContextCharacters?: number;
    maximumAgentAttemptsPerReservation?: number;
  } = {},
) {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const repository = options.repository ?? new InMemoryVaultRepository();
  const vault = new VaultService(repository, { clock: () => now });
  let usageValid = true;
  const harness = new AgentHarness(repository, vault, {
    clock: () => now,
    verifyUsageAuthorization: () => ({
      valid: usageValid,
      reasons: usageValid ? [] : ["Usage reservation is no longer active."],
    }),
  });

  return {
    now,
    repository,
    vault,
    harness,
    setUsageValid(value: boolean) {
      usageValid = value;
    },
    async configure() {
      const policy = createVaultProjectPolicy({
        scope,
        version: "vault-hardening.v1",
        allowedStorageRegions: ["us-central"],
        allowedProcessingRegions: ["us-central"],
        allowedExternalDomains: ["contentco-op.com"],
        allowedProviders: ["demo-provider"],
        allowedModels: ["demo-model"],
        maximumRetentionDays: 365,
        maximumAgentContextCharacters:
          options.maximumAgentContextCharacters ?? 64_000,
        maximumAgentAttemptsPerReservation:
          options.maximumAgentAttemptsPerReservation ?? 3,
        auditRetentionDays: 365,
        actor: owner,
        configuredAt: now.toISOString(),
      });
      await vault.configurePolicy(policy, owner);
    },
  };
}

function recordInput(text: string, key: string, actor = creator) {
  return {
    scope,
    family: "source_artifact" as const,
    title: "Hardening source",
    content: { text, data: { kind: "brief" } },
    source: {
      uri: "https://contentco-op.com/private/brief?token=redacted-at-export",
      artifactId: null,
      externalSourceId: "source-private-1",
      capturedAt: "2026-07-14T10:00:00.000Z",
      contentChecksum: sha256(text),
      mediaType: "text/plain",
    },
    provenanceType: "primary" as const,
    confidenceBasisPoints: 9_000,
    reviewStatus: "approved" as const,
    citations: [],
    acl: {
      visibility: "project" as const,
      allowTenantAdmins: true,
      entries: [
        {
          principalType: "role" as const,
          principalId: "creator",
          permissions: ["read", "retrieve", "create", "supersede"] as const,
        },
        {
          principalType: "role" as const,
          principalId: "agent",
          permissions: ["read", "retrieve"] as const,
        },
      ],
    },
    retention: {
      class: "project" as const,
      retainUntil: "2026-08-01T00:00:00.000Z",
      deletionEligibleAt: null,
      legalHold: false,
      policyVersion: "retention.v1",
    },
    residency: {
      storageRegion: "us-central",
      allowedProcessingRegions: ["us-central"],
      crossBorderTransferAllowed: false,
      policyVersion: "residency.v1",
    },
    rights: {
      classification: "internal" as const,
      aiUseAllowed: true,
      derivativeUseAllowed: true,
      exportAllowed: true,
      license: "project-owned",
      expiresAt: null,
    },
    author: actor,
    supersedesId: null,
    idempotencyKey: key,
  };
}

async function createEvidence(vault: InstanceType<typeof VaultService>) {
  const text = "The approved brief requires evidence-backed operator safety.";
  const source = await vault.createRecord(
    recordInput(text, "hardening:record:source"),
  );
  const quote = "operator safety";
  const start = text.indexOf(quote);
  const evidence = await vault.createRecord({
    ...recordInput(quote, "hardening:record:evidence"),
    family: "evidence" as const,
    title: "Operator safety evidence",
    citations: [
      {
        sourceRecordId: source.record.id,
        evidenceRecordId: null,
        relation: "supports" as const,
        locator: {
          kind: "text_span" as const,
          start,
          end: start + quote.length,
          quote,
          quoteChecksum: sha256(quote),
        },
      },
    ],
  });
  return { source: source.record, evidence: evidence.record, quote };
}

function authorization(
  suffix: string,
  operation: AgentUsageAuthorization["operation"] = "ai_research",
): AgentUsageAuthorization {
  return {
    reservationId: "reservation-" + suffix,
    quoteId: "quote-" + suffix,
    scope,
    operation,
    status: "active",
    maximumCoUnits: 500,
    rateVersion: "rate.v1",
    pricingVersion: "pricing.v1",
    expiresAt: "2026-08-01T00:00:00.000Z",
    integrityHash: sha256("reservation-" + suffix),
  };
}

function runRequest(
  evidenceId: string,
  suffix: string,
  usage = authorization(suffix),
): AgentRunRequest {
  const parameters = { temperature: 0, max_output_tokens: 500 };
  return {
    scope,
    actor: agent,
    capability: "research",
    objective: "Develop an evidence-grounded launch recommendation.",
    instruction: "Use only retrieved project evidence and identify assumptions.",
    sourceSetIds: [evidenceId],
    retrievalQuery: "operator safety",
    retrievalFamilies: ["evidence"],
    processingRegion: "us-central",
    model: {
      provider: "demo-provider",
      model: "demo-model",
      modelVersion: "2026-07-14",
      deployment: "local",
      region: "us-central",
      parameters,
      parametersHash: sha256(parameters),
    },
    prompt: {
      promptId: "research",
      promptVersion: "v1",
      templateHash: sha256("template"),
      systemInstructionHash: sha256("system"),
      toolSchemaHash: sha256("tools"),
    },
    usageAuthorization: usage,
    deterministicSeed: 7,
    idempotencyKey: "hardening:agent:plan:" + suffix,
  };
}

function groundedProposal(evidenceId: string, quote: string) {
  return {
    schemaVersion: "agent-proposal.v1" as const,
    summary: "Lead with operator safety.",
    factualClaims: [
      {
        id: "claim-safety",
        text: "The brief requires operator safety.",
        citations: [
          {
            recordId: evidenceId,
            evidenceRecordId: null,
            locatorChecksum: sha256(quote),
          },
        ],
      },
    ],
    assumptions: [],
    recommendedActions: ["Open with evidence of the safety protocol."],
    externalDestinations: [],
    confidenceBasisPoints: 8_500,
  };
}

test("vault scope keys resist delimiter collisions and repository writes roll back atomically", async () => {
  assert.notEqual(
    vaultScopeKey({ organizationId: "org:a", projectId: "project" }),
    vaultScopeKey({ organizationId: "org", projectId: "a:project" }),
  );

  class FailingRepository extends InMemoryVaultRepository {
    failRecordAudit = true;

    override appendAuditEvent(draft: VaultAuditEventDraft) {
      if (this.failRecordAudit && draft.type === "record_created") {
        this.failRecordAudit = false;
        throw new Error("simulated vault audit failure");
      }
      return super.appendAuditEvent(draft);
    }
  }

  const repository = new FailingRepository();
  const context = fixture({ repository });
  await context.configure();
  const before = repository.snapshot(scope);
  await assert.rejects(
    context.vault.createRecord(
      recordInput("Atomic vault source.", "hardening:record:atomic"),
    ),
    /simulated vault audit failure/,
  );
  const afterFailure = repository.snapshot(scope);
  assert.equal(afterFailure.records.length, before.records.length);
  assert.equal(afterFailure.auditEvents.length, before.auditEvents.length);
  assert.equal(afterFailure.idempotencyRecords.length, before.idempotencyRecords.length);

  const retry = await context.vault.createRecord(
    recordInput("Atomic vault source.", "hardening:record:atomic"),
  );
  assert.equal(retry.replayed, false);
});

test("vault replays fail closed when the idempotency index is corrupted", async () => {
  class TamperedReplayRepository extends InMemoryVaultRepository {
    tamperAction: string | null = null;

    override getIdempotency(target: VaultScope, action: string, key: string) {
      const record = super.getIdempotency(target, action, key);
      return record && action === this.tamperAction
        ? { ...record, resourceId: "tampered-resource" }
        : record;
    }
  }

  const repository = new TamperedReplayRepository();
  const context = fixture({ repository });
  await context.configure();
  const input = recordInput(
    "Idempotency replay authority must remain intact.",
    "hardening:record:idempotency-read",
  );
  await context.vault.createRecord(input);
  repository.tamperAction = "create_record";

  await assert.rejects(
    context.vault.createRecord(input),
    (error: unknown) =>
      error instanceof VaultError && error.code === "idempotency_integrity_invalid",
  );

  repository.tamperAction = null;
  const { evidence } = await createEvidence(context.vault);
  const request = runRequest(evidence.id, "idempotency-read");
  await context.harness.plan(request);
  repository.tamperAction = "plan_agent_run";
  await assert.rejects(
    context.harness.plan(request),
    (error: unknown) =>
      error instanceof VaultError && error.code === "idempotency_integrity_invalid",
  );
});

test("vault actions require explicit capabilities even for privileged roles and services", async () => {
  assert.throws(
    () =>
      assertVaultActor({
        ...owner,
        role: "root" as never,
      }),
    (error: unknown) =>
      error instanceof VaultError && error.code === "invalid_actor_role",
  );
  assert.throws(
    () =>
      assertVaultActor({
        ...owner,
        capabilities: ["vault:read", "vault:read"],
      }),
    (error: unknown) =>
      error instanceof VaultError && error.code === "invalid_capabilities",
  );

  const context = fixture();
  await context.configure();
  const noWriteCreator: VaultActor = {
    ...creator,
    id: "creator-read-only",
    capabilities: ["vault:read"],
  };
  await assert.rejects(
    context.vault.createRecord(
      recordInput(
        "Read-only actors cannot write.",
        "hardening:record:no-write",
        noWriteCreator,
      ),
    ),
    (error: unknown) =>
      error instanceof VaultError && error.code === "capability_denied",
  );

  const source = await context.vault.createRecord(
    recordInput("Explicit retrieval capability.", "hardening:record:capability"),
  );
  const readOnlyService: VaultActor = {
    id: "service-read-only",
    role: "service",
    kind: "service",
    capabilities: ["vault:read"],
  };
  await assert.rejects(
    context.vault.retrieve({
      scope,
      actor: readOnlyService,
      query: "retrieval",
      families: [],
      sourceSetIds: [source.record.id],
      purpose: "agent_context",
      processingRegion: "us-central",
      limit: 5,
      idempotencyKey: "hardening:retrieve:no-capability",
    }),
    (error: unknown) =>
      error instanceof VaultError && error.code === "capability_denied",
  );

  await assert.rejects(
    context.vault.exportAudit(scope, {
      ...owner,
      id: "owner-without-export",
      capabilities: ["vault:read"],
    }),
    (error: unknown) => error instanceof VaultError && error.code === "forbidden",
  );
});

test("retrieval enforces record integrity and a policy-bounded context budget", async () => {
  const context = fixture({ maximumAgentContextCharacters: 1_024 });
  await context.configure();
  const source = await context.vault.createRecord(
    recordInput("evidence ".repeat(300), "hardening:record:context-budget"),
  );
  const receipt = await context.vault.retrieve({
    scope,
    actor: agent,
    query: "evidence",
    families: [],
    sourceSetIds: [source.record.id],
    purpose: "agent_context",
    processingRegion: "us-central",
    limit: 5,
    idempotencyKey: "hardening:retrieve:context-budget",
  });
  assert.equal(receipt.hits.length, 0);
  assert.equal(receipt.contextCharacterCount, 0);
  assert.equal(receipt.contextLimit, 1_024);
  assert.equal(
    receipt.denials.some((denial) =>
      denial.reasons.includes("context_budget_exceeded"),
    ),
    true,
  );

  const tampered = {
    ...context.repository.snapshot(scope),
    records: [{ ...source.record, title: "Tampered title" }],
  };
  const report = reconcileVaultSnapshot(tampered, context.now.toISOString());
  assert.equal(report.passed, false);
  assert.equal(
    report.findings.some((finding) => finding.code === "integrity_hash_mismatch"),
    true,
  );
});

test("agent preflight binds capability, usage operation, and deny-all execution permissions", async () => {
  const context = fixture();
  await context.configure();
  const { evidence } = await createEvidence(context.vault);

  const elevated = await context.harness.plan({
    ...runRequest(evidence.id, "permissions"),
    permissions: {
      network: "allow" as never,
      filesystem: "deny",
      externalWrites: "deny",
      secrets: "deny",
      allowedTools: [],
    },
  });
  assert.equal(elevated.status, "blocked");
  assert.equal(
    elevated.gates.some(
      (gate) => gate.code === "execution_permissions" && gate.status === "fail",
    ),
    true,
  );
  assert.equal(elevated.executionMode, "proposal_only");
  assert.deepEqual(elevated.permissions, {
    network: "deny",
    filesystem: "deny",
    externalWrites: "deny",
    secrets: "deny",
    allowedTools: [],
  });

  const malformedPermissions = await context.harness.plan({
    ...runRequest(evidence.id, "malformed-permissions"),
    permissions: [] as never,
  });
  assert.equal(malformedPermissions.status, "blocked");
  assert.equal(
    malformedPermissions.gates.some(
      (gate) => gate.code === "execution_permissions" && gate.status === "fail",
    ),
    true,
  );

  const mismatched = await context.harness.plan(
    runRequest(
      evidence.id,
      "operation",
      authorization("operation", "generated_media"),
    ),
  );
  assert.equal(mismatched.status, "blocked");
  assert.equal(
    mismatched.gates.some(
      (gate) => gate.code === "usage_operation" && gate.status === "fail",
    ),
    true,
  );
});

test("reservation attempts cannot overlap and cancellation is explicit and traceable", async () => {
  const context = fixture({ maximumAgentAttemptsPerReservation: 2 });
  await context.configure();
  const { evidence } = await createEvidence(context.vault);
  const usage = authorization("shared");
  const first = await context.harness.plan(
    runRequest(evidence.id, "shared-first", usage),
  );
  assert.equal(first.status, "awaiting_output");

  const overlapping = await context.harness.plan(
    runRequest(evidence.id, "shared-overlap", usage),
  );
  assert.equal(overlapping.status, "blocked");
  assert.equal(
    overlapping.gates.some(
      (gate) =>
        gate.code === "budget_reservation" &&
        gate.reasons.some((reason) => reason.includes("active agent run")),
    ),
    true,
  );

  const cancelled = await context.harness.cancel({
    scope,
    runId: first.id,
    actor: agent,
    reason: "Operator cancelled before provider execution.",
    idempotencyKey: "hardening:agent:cancel:first",
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancellation?.actorId, agent.id);

  const retry = await context.harness.plan(
    runRequest(evidence.id, "shared-retry", usage),
  );
  assert.equal(retry.status, "awaiting_output");
  assert.equal(retry.executionMode, "proposal_only");
  assert.deepEqual(retry.permissions.allowedTools, []);
});

test("only the bound executor may submit output and stale usage blocks before provider events", async () => {
  const context = fixture();
  await context.configure();
  const { evidence, quote } = await createEvidence(context.vault);
  const run = await context.harness.plan(
    runRequest(evidence.id, "principal"),
  );
  const intruder: VaultActor = {
    ...agent,
    id: "agent-intruder",
  };
  await assert.rejects(
    context.harness.recordOutput({
      scope,
      runId: run.id,
      actor: intruder,
      proposal: groundedProposal(evidence.id, quote),
      providerStartedAt: "2026-07-14T12:00:01.000Z",
      providerCompletedAt: "2026-07-14T12:00:02.000Z",
      providerResponseIdHash: "a".repeat(64),
      idempotencyKey: "hardening:agent:output:intruder",
    }),
    (error: unknown) =>
      error instanceof VaultError &&
      error.code === "execution_principal_mismatch",
  );

  context.setUsageValid(false);
  const blocked = await context.harness.recordOutput({
    scope,
    runId: run.id,
    actor: agent,
    proposal: groundedProposal(evidence.id, quote),
    providerStartedAt: "2026-07-14T12:00:01.000Z",
    providerCompletedAt: "2026-07-14T12:00:02.000Z",
    providerResponseIdHash: "b".repeat(64),
    idempotencyKey: "hardening:agent:output:stale-usage",
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(
    blocked.events.some((event) => event.type === "provider_started"),
    false,
  );
});

test("human approval rollback is append-only and reconciles cleanly", async () => {
  const context = fixture();
  await context.configure();
  const { evidence, quote } = await createEvidence(context.vault);
  const run = await context.harness.plan(
    runRequest(evidence.id, "rollback"),
  );
  const output = await context.harness.recordOutput({
    scope,
    runId: run.id,
    actor: agent,
    proposal: groundedProposal(evidence.id, quote),
    providerStartedAt: "2026-07-14T12:00:01.000Z",
    providerCompletedAt: "2026-07-14T12:00:02.000Z",
    providerResponseIdHash: "c".repeat(64),
    idempotencyKey: "hardening:agent:output:rollback",
  });
  assert.equal(output.status, "awaiting_human_approval");
  const approved = await context.harness.decide({
    scope,
    runId: run.id,
    actor: owner,
    decision: "approved",
    reason: "Grounding and policy evidence reviewed.",
    idempotencyKey: "hardening:agent:decision:rollback",
  });
  assert.equal(approved.status, "approved");

  const rolledBack = await context.harness.rollback({
    scope,
    runId: run.id,
    actor: owner,
    reason: "Approval withdrawn before any external execution.",
    idempotencyKey: "hardening:agent:rollback:approved",
  });
  assert.equal(rolledBack.status, "rolled_back");
  assert.equal(rolledBack.rollback?.sideEffectsReversed, "none_required");

  const report = reconcileVaultSnapshot(
    context.repository.snapshot(scope),
    context.now.toISOString(),
  );
  assert.equal(report.passed, true, JSON.stringify(report.findings));
});
