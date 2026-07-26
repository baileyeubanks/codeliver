import { deterministicId, sha256 } from "../metering/canonical";
import { scanExternalDestinations, scanPromptInjection, scanSecretExfiltration } from "./guards";
import {
  assertVaultActor,
  assertVaultIdempotencyKey,
  assertVaultScope,
  createVaultIdempotencyRecord,
  sameVaultScope,
  VaultError,
  vaultResourceIntegrity,
} from "./policy";
import type { VaultRepository } from "./repository";
import { VaultService } from "./service";
import type {
  AgentEvaluation,
  AgentExecutionPermissions,
  AgentPolicyGate,
  AgentPolicyGateCode,
  AgentProposal,
  AgentReplayManifest,
  AgentRunContract,
  AgentRunEvent,
  AgentRunRequest,
  AgentRunView,
  AgentUsageAuthorization,
  CancelAgentRunInput,
  DecideAgentRunInput,
  RecordAgentOutputInput,
  RollbackAgentRunInput,
  SecurityFinding,
  VaultActor,
  VaultProjectPolicy,
  VaultRetrievalReceipt,
  VaultScope,
} from "./types";

export interface UsageAuthorizationVerification {
  valid: boolean;
  reasons: readonly string[];
}

export type UsageAuthorizationVerifier = (
  authorization: AgentUsageAuthorization,
  scope: VaultScope,
) => UsageAuthorizationVerification | Promise<UsageAuthorizationVerification>;

export interface AgentHarnessOptions {
  clock?: () => Date;
  verifyUsageAuthorization?: UsageAuthorizationVerifier;
}

const DENY_USAGE: UsageAuthorizationVerifier = () => ({
  valid: false,
  reasons: ["No durable usage-reservation verifier is configured."],
});

const DENY_ALL_EXECUTION_PERMISSIONS: AgentExecutionPermissions = Object.freeze({
  network: "deny",
  filesystem: "deny",
  externalWrites: "deny",
  secrets: "deny",
  allowedTools: [],
});

const EXECUTION_PERMISSION_KEYS = new Set([
  "network",
  "filesystem",
  "externalWrites",
  "secrets",
  "allowedTools",
]);

const CAPABILITY_OPERATION: Readonly<
  Record<AgentRunRequest["capability"], AgentUsageAuthorization["operation"]>
> = {
  research: "ai_research",
  draft: "ai_generation",
  analyze: "media_analysis",
  propose_edit: "ai_generation",
  generate_media: "generated_media",
};

function executionPermissionAssessment(request: AgentRunRequest) {
  const requested: unknown = request.permissions;
  const reasons: string[] = [];
  if (
    requested !== undefined &&
    (!requested || Array.isArray(requested) || typeof requested !== "object")
  ) {
    reasons.push("Execution permissions must be an object.");
  }
  const object =
    requested && !Array.isArray(requested) && typeof requested === "object"
      ? (requested as Record<string, unknown>)
      : {};
  const unknownKeys = Object.keys(object).filter(
    (key) => !EXECUTION_PERMISSION_KEYS.has(key),
  );
  if (unknownKeys.length > 0) {
    reasons.push("Unknown execution permission fields are forbidden.");
  }
  for (const field of ["network", "filesystem", "externalWrites", "secrets"] as const) {
    if (object[field] !== undefined && object[field] !== "deny") {
      reasons.push(`${field} permission must remain deny.`);
    }
  }
  if (
    object.allowedTools !== undefined &&
    (!Array.isArray(object.allowedTools) ||
      object.allowedTools.some((tool) => typeof tool !== "string") ||
      object.allowedTools.length > 0)
  ) {
    reasons.push("Agent tools must remain empty.");
  }

  return {
    permissions: {
      ...DENY_ALL_EXECUTION_PERMISSIONS,
      allowedTools: [],
    } satisfies AgentExecutionPermissions,
    valid: reasons.length === 0,
    reasons,
  };
}

function executionPermissions(request: AgentRunRequest): AgentExecutionPermissions {
  return executionPermissionAssessment(request).permissions;
}

function permissionsAreDenyAll(permissions: AgentExecutionPermissions) {
  return (
    permissions.network === "deny" &&
    permissions.filesystem === "deny" &&
    permissions.externalWrites === "deny" &&
    permissions.secrets === "deny" &&
    permissions.allowedTools.length === 0
  );
}

function gate(
  code: AgentPolicyGateCode,
  status: AgentPolicyGate["status"],
  policy: VaultProjectPolicy,
  reasons: readonly string[] = [],
  evidenceIds: readonly string[] = [],
): AgentPolicyGate {
  return {
    code,
    status,
    policyVersion: policy.version,
    reasons: [...reasons],
    evidenceIds: [...evidenceIds],
  };
}

function eventDetails(event: AgentRunEvent) {
  return event.details && !Array.isArray(event.details) && typeof event.details === "object"
    ? event.details
    : {};
}

function locatorChecksums(receipt: VaultRetrievalReceipt) {
  const checksums = new Map<string, Set<string>>();
  for (const hit of receipt.hits) {
    const recordChecksums = new Set<string>();
    for (const locator of hit.exactSpans) {
      switch (locator.kind) {
        case "text_span":
          recordChecksums.add(locator.quoteChecksum);
          break;
        case "time_range":
          recordChecksums.add(locator.transcriptChecksum);
          break;
        case "page_region":
          recordChecksums.add(locator.excerptChecksum);
          break;
      }
    }
    checksums.set(hit.recordId, recordChecksums);
  }
  return checksums;
}

function proposalText(proposal: AgentProposal) {
  return [
    proposal.summary,
    ...proposal.factualClaims.map((claim) => claim.text),
    ...proposal.assumptions,
    ...proposal.recommendedActions,
  ].join("\n");
}

export class AgentHarness {
  private readonly repository: VaultRepository;
  private readonly vault: VaultService;
  private readonly clock: () => Date;
  private readonly verifyUsageAuthorization: UsageAuthorizationVerifier;

  constructor(
    repository: VaultRepository,
    vault: VaultService,
    options: AgentHarnessOptions = {},
  ) {
    this.repository = repository;
    this.vault = vault;
    this.clock = options.clock ?? (() => new Date());
    this.verifyUsageAuthorization = options.verifyUsageAuthorization ?? DENY_USAGE;
  }

  private now() {
    return this.clock().toISOString();
  }

  private requirePolicy(scope: VaultScope) {
    const policy = this.repository.getPolicy(scope);
    if (!policy || policy.integrityHash !== vaultResourceIntegrity(policy)) {
      throw new VaultError("vault_policy_missing", "Valid project vault policy is required", 409);
    }
    return policy;
  }

  private idempotentResource(
    scope: VaultScope,
    action: string,
    key: string,
    requestHash: string,
  ) {
    const record = this.repository.getIdempotency(scope, action, key);
    if (!record) return null;
    if (record.integrityHash !== vaultResourceIntegrity(record)) {
      throw new VaultError(
        "idempotency_integrity_invalid",
        "Stored idempotency record failed integrity verification",
        500,
      );
    }
    if (record.requestHash !== requestHash) {
      throw new VaultError(
        "idempotency_conflict",
        `Idempotency key was already used for a different ${action} request`,
        409,
      );
    }
    return record;
  }

  private getRunForScope(scope: VaultScope, runId: string) {
    const run = this.repository.getAgentRun(runId);
    if (!run || !sameVaultScope(run.scope, scope)) {
      throw new VaultError("agent_run_not_found", "Agent run was not found", 404);
    }
    if (run.integrityHash !== vaultResourceIntegrity(run)) {
      throw new VaultError("agent_run_integrity_failed", "Agent run integrity failed", 409);
    }
    return run;
  }

  private canReadRun(actor: VaultActor, run: AgentRunContract) {
    return (
      actor.id === run.actor.id ||
      actor.capabilities.includes("agent:audit")
    );
  }

  private deriveView(run: AgentRunContract): AgentRunView {
    const events = this.repository.listAgentRunEvents(run.id);
    let status: AgentRunView["status"] = run.status;
    let proposal: AgentProposal | null = null;
    let evaluation: AgentEvaluation | null = null;
    let gates = [...run.gates];
    let humanDecision: AgentRunView["humanDecision"] = null;
    let cancellation: AgentRunView["cancellation"] = null;
    let rollback: AgentRunView["rollback"] = null;

    for (const event of events) {
      if (event.proposal) proposal = event.proposal;
      if (event.evaluation) evaluation = event.evaluation;
      if (event.gates.length) gates = [...event.gates];
      if (event.type === "blocked") status = "blocked";
      if (event.type === "awaiting_human_approval") status = "awaiting_human_approval";
      if (event.type === "human_approved") status = "approved";
      if (event.type === "human_rejected") status = "rejected";
      if (event.type === "cancelled") status = "cancelled";
      if (event.type === "rollback_recorded") status = "rolled_back";
      if (event.type === "human_approved" || event.type === "human_rejected") {
        const details = eventDetails(event);
        humanDecision = {
          decision: event.type === "human_approved" ? "approved" : "rejected",
          actorId: event.actor.id,
          reason: typeof details.reason === "string" ? details.reason : "",
          occurredAt: event.occurredAt,
        };
      }
      if (event.type === "cancelled") {
        const details = eventDetails(event);
        cancellation = {
          actorId: event.actor.id,
          reason: typeof details.reason === "string" ? details.reason : "",
          occurredAt: event.occurredAt,
        };
      }
      if (event.type === "rollback_recorded") {
        const details = eventDetails(event);
        rollback = {
          actorId: event.actor.id,
          reason: typeof details.reason === "string" ? details.reason : "",
          occurredAt: event.occurredAt,
          sideEffectsReversed: "none_required",
        };
      }
    }

    return {
      contract: run,
      status,
      events,
      proposal,
      evaluation,
      gates,
      humanDecision,
      cancellation,
      rollback,
    };
  }

  async getRun(scope: VaultScope, runId: string, actor: VaultActor) {
    assertVaultScope(scope);
    assertVaultActor(actor);
    const run = this.getRunForScope(scope, runId);
    if (!this.canReadRun(actor, run)) {
      throw new VaultError("forbidden", "Actor may not inspect this agent run", 403);
    }
    return this.deriveView(run);
  }

  private preflightGates(
    request: AgentRunRequest,
    policy: VaultProjectPolicy,
    usage: UsageAuthorizationVerification,
  ) {
    const instructionAssessment = scanPromptInjection(
      `${request.objective}\n${request.instruction}`,
    );
    const secretFindings = scanSecretExfiltration(
      `${request.objective}\n${request.instruction}`,
    );
    const capabilityAllowed =
      request.actor.capabilities.includes("agent:plan") &&
      (["agent", "service"] as const).includes(
        request.actor.role as "agent" | "service",
      );
    const permissionAssessment = executionPermissionAssessment(request);
    const operationMatches =
      request.usageAuthorization.operation === CAPABILITY_OPERATION[request.capability];
    const reservationScope = sameVaultScope(
      request.usageAuthorization.scope,
      request.scope,
    );
    const gates: AgentPolicyGate[] = [
      gate("project_scope", reservationScope ? "pass" : "fail", policy, reservationScope ? [] : ["Usage reservation belongs to another project."]),
      gate("agent_capability", capabilityAllowed ? "pass" : "fail", policy, capabilityAllowed ? [] : ["Actor lacks agent:plan capability."]),
      gate("budget_reservation", usage.valid ? "pass" : "fail", policy, usage.reasons, [request.usageAuthorization.reservationId]),
      gate(
        "usage_operation",
        operationMatches ? "pass" : "fail",
        policy,
        operationMatches
          ? []
          : ["Usage reservation operation does not authorize the requested capability."],
        [request.usageAuthorization.reservationId],
      ),
      gate(
        "execution_permissions",
        permissionAssessment.valid ? "pass" : "fail",
        policy,
        permissionAssessment.valid
          ? []
          : permissionAssessment.reasons,
      ),
      gate(
        "prompt_injection",
        instructionAssessment.blocked ? "fail" : "pass",
        policy,
        instructionAssessment.findings.map((finding) => finding.code),
      ),
      gate(
        "secret_exfiltration",
        secretFindings.length ? "fail" : "pass",
        policy,
        secretFindings.map((finding) => finding.code),
      ),
      gate(
        "residency",
        policy.allowedProcessingRegions.includes(request.processingRegion)
          ? "pass"
          : "fail",
        policy,
        policy.allowedProcessingRegions.includes(request.processingRegion)
          ? []
          : ["Requested processing region is not allowed."],
      ),
      gate(
        "provider_allowlist",
        policy.allowedProviders.includes(request.model.provider) ? "pass" : "fail",
        policy,
        policy.allowedProviders.includes(request.model.provider)
          ? []
          : ["Model provider is not allowed."],
      ),
      gate(
        "model_allowlist",
        policy.allowedModels.includes(request.model.model) ? "pass" : "fail",
        policy,
        policy.allowedModels.includes(request.model.model)
          ? []
          : ["Model is not allowed."],
      ),
      gate("source_authority", "pending", policy),
      gate("rights", "pending", policy),
      gate("confidentiality", "pending", policy),
      gate("citation_grounding", "pending", policy),
      gate("output_schema", "pending", policy),
      gate("external_destination", "pending", policy),
      gate("human_approval", "pending", policy),
    ];
    return gates;
  }

  private buildReplay(
    request: AgentRunRequest,
    policy: VaultProjectPolicy,
    retrieval: VaultRetrievalReceipt,
  ): AgentReplayManifest {
    const sourceRecords = retrieval.hits.map((hit) => ({
      id: hit.recordId,
      integrityHash: hit.recordIntegrityHash,
    }));
    const canonicalInputs = {
      scope: request.scope,
      objective: request.objective,
      instruction: request.instruction,
      sourceRecords,
      retrievalReceiptId: retrieval.id,
      retrievalReceiptHash: retrieval.integrityHash,
      model: request.model,
      prompt: request.prompt,
      policyVersion: policy.version,
      policyHash: policy.integrityHash,
      usageAuthorization: request.usageAuthorization,
      permissions: executionPermissions(request),
      deterministicSeed: request.deterministicSeed,
    };
    const canonicalInputHash = sha256(canonicalInputs);
    const unsigned = {
      schemaVersion: "agent-replay-manifest.v1" as const,
      scope: request.scope,
      objectiveHash: sha256(request.objective),
      instructionHash: sha256(request.instruction),
      sourceRecords,
      retrievalReceiptId: retrieval.id,
      retrievalReceiptHash: retrieval.integrityHash,
      model: request.model,
      prompt: request.prompt,
      policyVersion: policy.version,
      usageAuthorizationHash: request.usageAuthorization.integrityHash,
      executionPermissionsHash: sha256(executionPermissions(request)),
      deterministicSeed: request.deterministicSeed,
      canonicalInputHash,
      outputHash: null,
    };
    return { ...unsigned, replayKey: sha256(unsigned) };
  }

  private async savePlannedRun(
    request: AgentRunRequest,
    requestHash: string,
    policy: VaultProjectPolicy,
    gates: readonly AgentPolicyGate[],
    retrieval: VaultRetrievalReceipt | null,
  ) {
    return this.repository.runExclusive(request.scope, async () => {
      const replay = this.idempotentResource(
        request.scope,
        "plan_agent_run",
        request.idempotencyKey,
        requestHash,
      );
      if (replay) {
        return this.getRunForScope(request.scope, replay.resourceId);
      }

      let finalGates = [...gates];
      if (!finalGates.some((item) => item.status === "fail")) {
        const currentUsage = await this.verifyUsageAuthorization(
          request.usageAuthorization,
          request.scope,
        );
        finalGates = finalGates.map((item) =>
          item.code === "budget_reservation" && !currentUsage.valid
            ? {
                ...item,
                status: "fail" as const,
                reasons: [...currentUsage.reasons],
              }
            : item,
        );
        const priorAttempts = this.repository
          .listAgentRuns(request.scope)
          .filter(
            (candidate) =>
              candidate.usageAuthorization.reservationId ===
                request.usageAuthorization.reservationId &&
              candidate.status === "awaiting_output",
          );
        const activeBinding = priorAttempts.find((candidate) =>
          (
            ["awaiting_output", "awaiting_human_approval", "approved"] as const
          ).includes(
            this.deriveView(candidate).status as
              | "awaiting_output"
              | "awaiting_human_approval"
              | "approved",
          ),
        );
        const reservationUnavailable =
          activeBinding !== undefined ||
          priorAttempts.length >= policy.maximumAgentAttemptsPerReservation;
        if (reservationUnavailable) {
          finalGates = finalGates.map((item) =>
            item.code === "budget_reservation"
              ? {
                  ...item,
                  status: "fail" as const,
                  reasons: [
                    activeBinding
                      ? "Usage reservation is already bound to an active agent run."
                      : "Usage reservation attempt limit is exhausted.",
                  ],
                  evidenceIds: priorAttempts.map((candidate) => candidate.id),
                }
              : item,
          );
        }
      }
      const createdAt = this.now();
      const status = finalGates.some((item) => item.status === "fail")
        ? ("blocked" as const)
        : ("awaiting_output" as const);
      const replayManifest = retrieval
        ? this.buildReplay(request, policy, retrieval)
        : null;
      const unsigned = {
        id: deterministicId("arn", {
          scope: request.scope,
          requestHash,
          createdAt,
          idempotencyKey: request.idempotencyKey,
        }),
        schemaVersion: "agent-run-contract.v1" as const,
        scope: request.scope,
        actor: request.actor,
        capability: request.capability,
        status,
        objective: request.objective,
        instruction: request.instruction,
        retrievalReceiptId: retrieval?.id ?? null,
        model: request.model,
        prompt: request.prompt,
        usageAuthorization: request.usageAuthorization,
        executionMode: "proposal_only" as const,
        permissions: executionPermissions(request),
        gates: finalGates,
        replay: replayManifest,
        createdAt,
        idempotencyKey: request.idempotencyKey,
        requestHash,
      };
      const run: AgentRunContract = { ...unsigned, integrityHash: sha256(unsigned) };
      this.repository.saveAgentRun(run);
      this.repository.appendAgentRunEvent({
        runId: run.id,
        scope: run.scope,
        type: "planned",
        actor: request.actor,
        occurredAt: createdAt,
        durationMilliseconds: null,
        proposal: null,
        proposalHash: null,
        evaluation: null,
        gates: finalGates,
        details: {
          capability: request.capability,
          model_provider: request.model.provider,
          model: request.model.model,
          model_version: request.model.modelVersion,
          prompt_version: request.prompt.promptVersion,
          usage_reservation_id: request.usageAuthorization.reservationId,
        },
      });
      if (retrieval) {
        this.repository.appendAgentRunEvent({
          runId: run.id,
          scope: run.scope,
          type: "retrieval_completed",
          actor: request.actor,
          occurredAt: createdAt,
          durationMilliseconds: null,
          proposal: null,
          proposalHash: null,
          evaluation: null,
          gates: finalGates,
          details: {
            retrieval_receipt_id: retrieval.id,
            hit_ids: retrieval.hits.map((hit) => hit.recordId),
            denial_count: retrieval.denials.length,
          },
        });
      }
      if (status === "blocked") {
        this.repository.appendAgentRunEvent({
          runId: run.id,
          scope: run.scope,
          type: "blocked",
          actor: request.actor,
          occurredAt: createdAt,
          durationMilliseconds: null,
          proposal: null,
          proposalHash: null,
          evaluation: null,
          gates: finalGates,
          details: {
            failed_gates: finalGates
              .filter((item) => item.status === "fail")
              .map((item) => item.code),
          },
        });
      }
      this.repository.appendAuditEvent({
        scope: run.scope,
        type: status === "blocked" ? "agent_run_blocked" : "agent_run_planned",
        actor: request.actor,
        resourceId: run.id,
        occurredAt: createdAt,
        details: {
          status,
          retrieval_receipt_id: retrieval?.id ?? null,
          model_lineage_hash: sha256(request.model),
          prompt_lineage_hash: sha256(request.prompt),
          replay_key: replayManifest?.replayKey ?? null,
          failed_gates: finalGates
            .filter((item) => item.status === "fail")
            .map((item) => item.code),
        },
      });
      this.repository.saveIdempotency(
        createVaultIdempotencyRecord(
          request.scope,
          "plan_agent_run",
          request.idempotencyKey,
          requestHash,
          "agent_run",
          run.id,
          createdAt,
        ),
      );
      return run;
    });
  }

  async plan(request: AgentRunRequest) {
    assertVaultScope(request.scope);
    assertVaultActor(request.actor);
    assertVaultIdempotencyKey(request.idempotencyKey);
    if (!request.objective.trim() || !request.instruction.trim()) {
      throw new VaultError("agent_instruction_required", "Objective and instruction are required");
    }
    if (!Number.isSafeInteger(request.deterministicSeed) || request.deterministicSeed < 0) {
      throw new VaultError("deterministic_seed_invalid", "Deterministic seed must be non-negative");
    }
    if (request.model.parametersHash !== sha256(request.model.parameters)) {
      throw new VaultError("model_lineage_invalid", "Model parameter hash is invalid", 409);
    }
    const requestHash = sha256({
      ...request,
      permissions: executionPermissions(request),
      requestedPermissionsHash: sha256(request.permissions ?? null),
      idempotencyKey: undefined,
    });
    const existing = this.idempotentResource(
      request.scope,
      "plan_agent_run",
      request.idempotencyKey,
      requestHash,
    );
    if (existing) return this.getRunForScope(request.scope, existing.resourceId);

    const policy = this.requirePolicy(request.scope);
    const usage = await this.verifyUsageAuthorization(
      request.usageAuthorization,
      request.scope,
    );
    let gates = this.preflightGates(request, policy, usage);
    const blockingPreflight = gates.some((item) => item.status === "fail");
    if (blockingPreflight) {
      gates = gates.map((item) =>
        item.status === "pending"
          ? { ...item, status: "fail" as const, reasons: ["Preflight failed before retrieval."] }
          : item,
      );
      return this.savePlannedRun(request, requestHash, policy, gates, null);
    }

    const retrieval = await this.vault.retrieve({
      scope: request.scope,
      actor: request.actor,
      query: request.retrievalQuery,
      families: request.retrievalFamilies,
      sourceSetIds: request.sourceSetIds,
      purpose: "agent_context",
      processingRegion: request.processingRegion,
      limit: 20,
      idempotencyKey: `agent-retrieval:${request.idempotencyKey}`,
    });
    const requestedHits = new Set(retrieval.hits.map((hit) => hit.recordId));
    const allSourcesAuthorized =
      retrieval.hits.length > 0 &&
      request.sourceSetIds.every((recordId) => requestedHits.has(recordId));
    const records = retrieval.hits
      .map((hit) => this.repository.getRecord(hit.recordId))
      .filter((record) => record !== null);
    const derivativeUseRequired = (
      ["draft", "propose_edit", "generate_media"] as const
    ).includes(request.capability as "draft" | "propose_edit" | "generate_media");
    const rightsPass = records.every(
      (record) =>
        record.rights.aiUseAllowed &&
        (!derivativeUseRequired || record.rights.derivativeUseAllowed),
    );
    const confidentialityPass = records.every(
      (record) =>
        record.rights.classification !== "restricted" &&
        (record.rights.classification !== "confidential" ||
          policy.confidentialProviderUseAllowed),
    );
    gates = gates.map((item) => {
      if (item.code === "source_authority") {
        return gate(
          item.code,
          allSourcesAuthorized ? "pass" : "fail",
          policy,
          allSourcesAuthorized ? [] : ["Requested source set was not fully authorized."],
          retrieval.hits.map((hit) => hit.recordId),
        );
      }
      if (item.code === "rights") {
        return gate(
          item.code,
          rightsPass ? "pass" : "fail",
          policy,
          rightsPass
            ? []
            : ["One or more sources deny AI or required derivative use."],
        );
      }
      if (item.code === "confidentiality") {
        return gate(
          item.code,
          confidentialityPass ? "pass" : "fail",
          policy,
          confidentialityPass ? [] : ["Source classification is not approved for this provider."],
        );
      }
      if (["citation_grounding", "output_schema", "external_destination", "human_approval"].includes(item.code)) {
        return item;
      }
      return item;
    });
    return this.savePlannedRun(request, requestHash, policy, gates, retrieval);
  }

  private evaluateProposal(
    run: AgentRunContract,
    proposal: AgentProposal,
    receipt: VaultRetrievalReceipt,
    policy: VaultProjectPolicy,
    evaluatedAt: string,
  ) {
    const findings: SecurityFinding[] = [];
    if (
      proposal.schemaVersion !== "agent-proposal.v1" ||
      !Number.isInteger(proposal.confidenceBasisPoints) ||
      proposal.confidenceBasisPoints < 0 ||
      proposal.confidenceBasisPoints > 10_000
    ) {
      findings.push({
        code: "output_schema_invalid",
        severity: "high",
        start: null,
        end: null,
        evidenceHash: sha256(proposal),
        message: "Agent proposal schema or confidence is invalid.",
      });
    }

    const retrievedIds = new Set(receipt.hits.map((hit) => hit.recordId));
    const checksums = locatorChecksums(receipt);
    let citationCount = 0;
    let validCitationCount = 0;
    let claimsWithCitation = 0;
    for (const claim of proposal.factualClaims) {
      if (claim.citations.length) claimsWithCitation += 1;
      else {
        findings.push({
          code: "unsupported_factual_claim",
          severity: "critical",
          start: null,
          end: null,
          evidenceHash: sha256(claim.text),
          message: "Factual claim has no citation.",
        });
      }
      for (const citation of claim.citations) {
        citationCount += 1;
        const valid =
          retrievedIds.has(citation.recordId) &&
          (checksums.get(citation.recordId)?.has(citation.locatorChecksum) ?? false);
        if (valid) validCitationCount += 1;
        else {
          findings.push({
            code: "citation_not_retrieved",
            severity: "critical",
            start: null,
            end: null,
            evidenceHash: sha256(citation),
            message: "Citation does not resolve to an exact retrieved source span.",
          });
        }
      }
    }

    const contentFindings = [
      ...scanSecretExfiltration(proposalText(proposal)),
      ...scanPromptInjection(proposalText(proposal)).findings.filter(
        (finding) => finding.severity === "high" || finding.severity === "critical",
      ),
      ...scanExternalDestinations(proposal.externalDestinations, policy),
    ];
    findings.push(...contentFindings);

    const claimCount = proposal.factualClaims.length;
    const citationCoverageBasisPoints =
      claimCount === 0 ? 10_000 : Math.floor((claimsWithCitation * 10_000) / claimCount);
    const groundednessBasisPoints =
      citationCount === 0
        ? claimCount === 0
          ? 10_000
          : 0
        : Math.floor((validCitationCount * 10_000) / citationCount);
    const schemaValidityBasisPoints = findings.some(
      (finding) => finding.code === "output_schema_invalid",
    )
      ? 0
      : 10_000;
    const policyComplianceBasisPoints = findings.some(
      (finding) => finding.severity === "critical" || finding.severity === "high",
    )
      ? 0
      : 10_000;
    const passed =
      groundednessBasisPoints === 10_000 &&
      citationCoverageBasisPoints === 10_000 &&
      schemaValidityBasisPoints === 10_000 &&
      policyComplianceBasisPoints === 10_000;
    const unsigned = {
      id: deterministicId("aev", {
        runId: run.id,
        proposalHash: sha256(proposal),
        evaluatedAt,
      }),
      schemaVersion: "agent-evaluation.v1" as const,
      evaluatorVersion: "agent-evaluator.2026-07-14.v1",
      runId: run.id,
      groundednessBasisPoints,
      citationCoverageBasisPoints,
      policyComplianceBasisPoints,
      schemaValidityBasisPoints,
      passed,
      findings,
      evaluatedAt,
    };
    const evaluation: AgentEvaluation = {
      ...unsigned,
      integrityHash: sha256(unsigned),
    };
    return evaluation;
  }

  async recordOutput(input: RecordAgentOutputInput) {
    assertVaultScope(input.scope);
    assertVaultActor(input.actor);
    assertVaultIdempotencyKey(input.idempotencyKey);
    if (
      !input.actor.capabilities.includes("agent:submit_output") ||
      !(["agent", "service"] as const).includes(input.actor.role as "agent" | "service")
    ) {
      throw new VaultError("forbidden", "Provider output requires agent submit authority", 403);
    }
    const startedAt = Date.parse(input.providerStartedAt);
    const completedAt = Date.parse(input.providerCompletedAt);
    if (!Number.isFinite(startedAt) || completedAt < startedAt) {
      throw new VaultError("provider_timing_invalid", "Provider timing is invalid");
    }
    if (!/^[a-f0-9]{64}$/.test(input.providerResponseIdHash)) {
      throw new VaultError("provider_response_hash_invalid", "Provider response ID must be hashed");
    }
    const requestHash = sha256({ ...input, idempotencyKey: undefined });

    return this.repository.runExclusive(input.scope, async () => {
      const replay = this.idempotentResource(
        input.scope,
        "record_agent_output",
        input.idempotencyKey,
        requestHash,
      );
      if (replay) return this.deriveView(this.getRunForScope(input.scope, input.runId));

      const run = this.getRunForScope(input.scope, input.runId);
      if (input.actor.id !== run.actor.id) {
        throw new VaultError(
          "execution_principal_mismatch",
          "Only the run's bound execution principal may submit output",
          403,
        );
      }
      if (
        run.executionMode !== "proposal_only" ||
        !permissionsAreDenyAll(run.permissions)
      ) {
        throw new VaultError(
          "execution_permissions_invalid",
          "Agent run does not have deny-all proposal-only permissions",
          409,
        );
      }
      const current = this.deriveView(run);
      if (current.status !== "awaiting_output") {
        throw new VaultError("agent_run_not_awaiting_output", `Agent run is ${current.status}`, 409);
      }
      const receipt = this.repository.getRetrievalReceipt(run.retrievalReceiptId ?? "");
      if (
        !receipt ||
        !sameVaultScope(receipt.scope, input.scope) ||
        receipt.integrityHash !== vaultResourceIntegrity(receipt)
      ) {
        throw new VaultError("retrieval_receipt_missing", "Agent retrieval receipt is missing", 409);
      }
      const policy = this.requirePolicy(input.scope);
      const now = this.now();
      if (completedAt > Date.parse(now) + 5 * 60 * 1_000) {
        throw new VaultError(
          "provider_timing_invalid",
          "Provider timing falls outside the run lifecycle",
        );
      }
      const currentUsage = await this.verifyUsageAuthorization(
        run.usageAuthorization,
        run.scope,
      );
      if (!currentUsage.valid) {
        const gates = current.gates.map((item) =>
          item.code === "budget_reservation"
            ? {
                ...item,
                status: "fail" as const,
                reasons: [...currentUsage.reasons],
              }
            : item,
        );
        const blocked = this.repository.appendAgentRunEvent({
          runId: run.id,
          scope: run.scope,
          type: "blocked",
          actor: input.actor,
          occurredAt: now,
          durationMilliseconds: null,
          proposal: null,
          proposalHash: null,
          evaluation: null,
          gates,
          details: {
            failed_gates: ["budget_reservation"],
            provider_invocation_recorded: false,
            request_hash: requestHash,
          },
        });
        this.repository.appendAuditEvent({
          scope: run.scope,
          type: "agent_run_blocked",
          actor: input.actor,
          resourceId: run.id,
          occurredAt: now,
          details: {
            failed_gates: ["budget_reservation"],
            event_id: blocked.id,
          },
        });
        this.repository.saveIdempotency(
          createVaultIdempotencyRecord(
            input.scope,
            "record_agent_output",
            input.idempotencyKey,
            requestHash,
            "agent_event",
            blocked.id,
            now,
          ),
        );
        return this.deriveView(run);
      }
      const proposalHash = sha256(input.proposal);
      const evaluation = this.evaluateProposal(run, input.proposal, receipt, policy, now);
      let gates = run.gates.map((item) => {
        if (item.code === "citation_grounding") {
          return gate(
            item.code,
            evaluation.groundednessBasisPoints === 10_000 &&
              evaluation.citationCoverageBasisPoints === 10_000
              ? "pass"
              : "fail",
            policy,
            evaluation.findings
              .filter((finding) => finding.code.includes("citation") || finding.code.includes("claim"))
              .map((finding) => finding.code),
            receipt.hits.map((hit) => hit.recordId),
          );
        }
        if (item.code === "output_schema") {
          return gate(
            item.code,
            evaluation.schemaValidityBasisPoints === 10_000 ? "pass" : "fail",
            policy,
            evaluation.schemaValidityBasisPoints === 10_000 ? [] : ["Output schema evaluation failed."],
          );
        }
        if (item.code === "secret_exfiltration") {
          const secretCodes = evaluation.findings
            .filter((finding) => ["private_key_material", "bearer_token", "api_key_material", "password_assignment"].includes(finding.code))
            .map((finding) => finding.code);
          return gate(item.code, secretCodes.length ? "fail" : "pass", policy, secretCodes);
        }
        if (item.code === "external_destination") {
          const destinationCodes = evaluation.findings
            .filter((finding) => finding.code.includes("destination"))
            .map((finding) => finding.code);
          return gate(item.code, destinationCodes.length ? "fail" : "pass", policy, destinationCodes);
        }
        return item;
      });
      const outputPassed = evaluation.passed && gates.every(
        (item) => item.status !== "fail",
      );
      gates = gates.map((item) =>
        item.code === "human_approval"
          ? { ...item, status: outputPassed ? ("pending" as const) : ("fail" as const), reasons: outputPassed ? [] : ["Output failed policy evaluation."] }
          : item,
      );

      this.repository.appendAgentRunEvent({
        runId: run.id,
        scope: run.scope,
        type: "provider_started",
        actor: input.actor,
        occurredAt: input.providerStartedAt,
        durationMilliseconds: null,
        proposal: null,
        proposalHash: null,
        evaluation: null,
        gates: run.gates,
        details: { provider_response_id_hash: input.providerResponseIdHash },
      });
      this.repository.appendAgentRunEvent({
        runId: run.id,
        scope: run.scope,
        type: "provider_completed",
        actor: input.actor,
        occurredAt: input.providerCompletedAt,
        durationMilliseconds: completedAt - startedAt,
        proposal: null,
        proposalHash,
        evaluation: null,
        gates: run.gates,
        details: { provider_response_id_hash: input.providerResponseIdHash },
      });
      const outputEvent = this.repository.appendAgentRunEvent({
        runId: run.id,
        scope: run.scope,
        type: "output_recorded",
        actor: input.actor,
        occurredAt: now,
        durationMilliseconds: null,
        proposal: input.proposal,
        proposalHash,
        evaluation: null,
        gates,
        details: {
          proposal_hash: proposalHash,
          factual_claim_count: input.proposal.factualClaims.length,
          external_destination_hashes: input.proposal.externalDestinations.map(sha256),
        },
      });
      this.repository.appendAgentRunEvent({
        runId: run.id,
        scope: run.scope,
        type: "evaluation_completed",
        actor: input.actor,
        occurredAt: now,
        durationMilliseconds: 0,
        proposal: null,
        proposalHash,
        evaluation,
        gates,
        details: {
          evaluation_id: evaluation.id,
          passed: evaluation.passed,
          finding_codes: evaluation.findings.map((finding) => finding.code),
        },
      });
      const terminal = this.repository.appendAgentRunEvent({
        runId: run.id,
        scope: run.scope,
        type: outputPassed ? "awaiting_human_approval" : "blocked",
        actor: input.actor,
        occurredAt: now,
        durationMilliseconds: null,
        proposal: null,
        proposalHash,
        evaluation: null,
        gates,
        details: outputPassed
          ? { required_approval: true, request_hash: requestHash }
          : {
              failed_gates: gates
                .filter((item) => item.status === "fail")
                .map((item) => item.code),
              request_hash: requestHash,
            },
      });
      this.repository.appendAuditEvent({
        scope: run.scope,
        type: "agent_output_recorded",
        actor: input.actor,
        resourceId: run.id,
        occurredAt: now,
        details: {
          output_event_id: outputEvent.id,
          proposal_hash: proposalHash,
          provider_response_id_hash: input.providerResponseIdHash,
          evaluation_id: evaluation.id,
          evaluation_passed: evaluation.passed,
        },
      });
      this.repository.appendAuditEvent({
        scope: run.scope,
        type: "agent_evaluation_completed",
        actor: input.actor,
        resourceId: evaluation.id,
        occurredAt: now,
        details: {
          run_id: run.id,
          passed: evaluation.passed,
          groundedness_basis_points: evaluation.groundednessBasisPoints,
          citation_coverage_basis_points: evaluation.citationCoverageBasisPoints,
          policy_compliance_basis_points: evaluation.policyComplianceBasisPoints,
        },
      });
      this.repository.saveIdempotency(
        createVaultIdempotencyRecord(
          input.scope,
          "record_agent_output",
          input.idempotencyKey,
          requestHash,
          "agent_event",
          terminal.id,
          now,
        ),
      );
      return this.deriveView(run);
    });
  }

  async decide(input: DecideAgentRunInput) {
    assertVaultScope(input.scope);
    assertVaultActor(input.actor);
    assertVaultIdempotencyKey(input.idempotencyKey);
    if (input.decision !== "approved" && input.decision !== "rejected") {
      throw new VaultError("decision_invalid", "Decision must be approved or rejected");
    }
    if (typeof input.reason !== "string" || !input.reason.trim()) {
      throw new VaultError("decision_reason_required", "Decision reason is required");
    }
    const authorized =
      input.actor.capabilities.includes("agent:approve") &&
      (["owner", "admin", "creator"] as const).includes(
        input.actor.role as "owner" | "admin" | "creator",
      );
    if (!authorized) {
      throw new VaultError("forbidden", "Human approval authority is required", 403);
    }
    const requestHash = sha256({ ...input, idempotencyKey: undefined });

    return this.repository.runExclusive(input.scope, async () => {
      const replay = this.idempotentResource(
        input.scope,
        "decide_agent_run",
        input.idempotencyKey,
        requestHash,
      );
      if (replay) return this.deriveView(this.getRunForScope(input.scope, input.runId));

      const run = this.getRunForScope(input.scope, input.runId);
      const view = this.deriveView(run);
      if (view.status !== "awaiting_human_approval") {
        throw new VaultError("agent_run_not_awaiting_approval", `Agent run is ${view.status}`, 409);
      }
      if (input.actor.kind !== "human") {
        throw new VaultError("human_actor_required", "Approval must come from a human actor", 403);
      }
      if (input.decision === "approved" && (!view.evaluation?.passed || !view.proposal)) {
        throw new VaultError("evaluation_failed", "Failed or missing evaluation cannot be approved", 409);
      }
      if (
        input.decision === "approved" &&
        view.evaluation &&
        view.evaluation.integrityHash !== vaultResourceIntegrity(view.evaluation)
      ) {
        throw new VaultError("evaluation_integrity_failed", "Agent evaluation integrity failed", 409);
      }
      if (input.decision === "approved") {
        const usage = await this.verifyUsageAuthorization(
          run.usageAuthorization,
          run.scope,
        );
        if (!usage.valid) {
          throw new VaultError(
            "usage_authorization_invalid",
            "Agent run usage authorization is no longer valid",
            409,
          );
        }
      }

      const policy = this.requirePolicy(input.scope);
      const gates = view.gates.map((item) =>
        item.code === "human_approval"
          ? gate(
              item.code,
              input.decision === "approved" ? "pass" : "fail",
              policy,
              [input.reason.trim()],
              [input.actor.id],
            )
          : item,
      );
      const now = this.now();
      const event = this.repository.appendAgentRunEvent({
        runId: run.id,
        scope: run.scope,
        type: input.decision === "approved" ? "human_approved" : "human_rejected",
        actor: input.actor,
        occurredAt: now,
        durationMilliseconds: null,
        proposal: null,
        proposalHash: view.proposal ? sha256(view.proposal) : null,
        evaluation: null,
        gates,
        details: {
          decision: input.decision,
          reason: input.reason.trim(),
          proposal_hash: view.proposal ? sha256(view.proposal) : null,
          evaluation_id: view.evaluation?.id ?? null,
          request_hash: requestHash,
        },
      });
      this.repository.appendAuditEvent({
        scope: run.scope,
        type: "agent_human_decision_recorded",
        actor: input.actor,
        resourceId: run.id,
        occurredAt: now,
        details: {
          decision: input.decision,
          reason_hash: sha256(input.reason.trim()),
          event_id: event.id,
          proposal_hash: view.proposal ? sha256(view.proposal) : null,
        },
      });
      this.repository.saveIdempotency(
        createVaultIdempotencyRecord(
          input.scope,
          "decide_agent_run",
          input.idempotencyKey,
          requestHash,
          "agent_event",
          event.id,
          now,
        ),
      );
      return this.deriveView(run);
    });
  }

  async cancel(input: CancelAgentRunInput) {
    assertVaultScope(input.scope);
    assertVaultActor(input.actor);
    assertVaultIdempotencyKey(input.idempotencyKey);
    if (!input.reason.trim()) {
      throw new VaultError("cancellation_reason_required", "Cancellation reason is required");
    }
    const requestHash = sha256({ ...input, idempotencyKey: undefined });

    return this.repository.runExclusive(input.scope, () => {
      const replay = this.idempotentResource(
        input.scope,
        "cancel_agent_run",
        input.idempotencyKey,
        requestHash,
      );
      if (replay) return this.deriveView(this.getRunForScope(input.scope, input.runId));

      const run = this.getRunForScope(input.scope, input.runId);
      const view = this.deriveView(run);
      const authorized =
        input.actor.capabilities.includes("agent:cancel") &&
        (input.actor.id === run.actor.id ||
          (input.actor.kind === "human" &&
            (["owner", "admin", "creator"] as const).includes(
              input.actor.role as "owner" | "admin" | "creator",
            )));
      if (!authorized) {
        throw new VaultError("forbidden", "Agent cancellation authority is required", 403);
      }
      if (
        !(
          ["awaiting_output", "awaiting_human_approval"] as const
        ).includes(view.status as "awaiting_output" | "awaiting_human_approval")
      ) {
        throw new VaultError(
          "agent_run_not_cancellable",
          "Agent run is " + view.status,
          409,
        );
      }

      const now = this.now();
      const event = this.repository.appendAgentRunEvent({
        runId: run.id,
        scope: run.scope,
        type: "cancelled",
        actor: input.actor,
        occurredAt: now,
        durationMilliseconds: null,
        proposal: null,
        proposalHash: view.proposal ? sha256(view.proposal) : null,
        evaluation: null,
        gates: view.gates,
        details: {
          reason: input.reason.trim(),
          execution_mode: run.executionMode,
          external_side_effects: "none",
          request_hash: requestHash,
        },
      });
      this.repository.appendAuditEvent({
        scope: run.scope,
        type: "agent_run_cancelled",
        actor: input.actor,
        resourceId: run.id,
        occurredAt: now,
        details: {
          event_id: event.id,
          reason_hash: sha256(input.reason.trim()),
          external_side_effects: "none",
        },
      });
      this.repository.saveIdempotency(
        createVaultIdempotencyRecord(
          input.scope,
          "cancel_agent_run",
          input.idempotencyKey,
          requestHash,
          "agent_event",
          event.id,
          now,
        ),
      );
      return this.deriveView(run);
    });
  }

  async rollback(input: RollbackAgentRunInput) {
    assertVaultScope(input.scope);
    assertVaultActor(input.actor);
    assertVaultIdempotencyKey(input.idempotencyKey);
    if (!input.reason.trim()) {
      throw new VaultError("rollback_reason_required", "Rollback reason is required");
    }
    const authorized =
      input.actor.kind === "human" &&
      input.actor.capabilities.includes("agent:rollback") &&
      (["owner", "admin", "creator"] as const).includes(
        input.actor.role as "owner" | "admin" | "creator",
      );
    if (!authorized) {
      throw new VaultError("forbidden", "Human rollback authority is required", 403);
    }
    const requestHash = sha256({ ...input, idempotencyKey: undefined });

    return this.repository.runExclusive(input.scope, () => {
      const replay = this.idempotentResource(
        input.scope,
        "rollback_agent_run",
        input.idempotencyKey,
        requestHash,
      );
      if (replay) return this.deriveView(this.getRunForScope(input.scope, input.runId));

      const run = this.getRunForScope(input.scope, input.runId);
      const view = this.deriveView(run);
      if (view.status !== "approved") {
        throw new VaultError(
          "agent_run_not_approved",
          "Agent run is " + view.status,
          409,
        );
      }
      const policy = this.requirePolicy(input.scope);
      const gates = view.gates.map((item) =>
        item.code === "human_approval"
          ? gate(
              item.code,
              "fail",
              policy,
              ["Approval rolled back: " + input.reason.trim()],
              [input.actor.id],
            )
          : item,
      );
      const now = this.now();
      const event = this.repository.appendAgentRunEvent({
        runId: run.id,
        scope: run.scope,
        type: "rollback_recorded",
        actor: input.actor,
        occurredAt: now,
        durationMilliseconds: null,
        proposal: null,
        proposalHash: view.proposal ? sha256(view.proposal) : null,
        evaluation: null,
        gates,
        details: {
          reason: input.reason.trim(),
          side_effects_reversed: "none_required",
          execution_mode: run.executionMode,
          request_hash: requestHash,
        },
      });
      this.repository.appendAuditEvent({
        scope: run.scope,
        type: "agent_rollback_recorded",
        actor: input.actor,
        resourceId: run.id,
        occurredAt: now,
        details: {
          event_id: event.id,
          reason_hash: sha256(input.reason.trim()),
          side_effects_reversed: "none_required",
        },
      });
      this.repository.saveIdempotency(
        createVaultIdempotencyRecord(
          input.scope,
          "rollback_agent_run",
          input.idempotencyKey,
          requestHash,
          "agent_event",
          event.id,
          now,
        ),
      );
      return this.deriveView(run);
    });
  }

  async verifyReplay(scope: VaultScope, runId: string, actor: VaultActor) {
    assertVaultScope(scope);
    assertVaultActor(actor);
    const run = this.getRunForScope(scope, runId);
    if (!this.canReadRun(actor, run)) {
      throw new VaultError("forbidden", "Actor may not verify this replay", 403);
    }
    if (!run.replay || !run.retrievalReceiptId) {
      return { verified: false, mismatches: ["replay_manifest_missing"], manifest: null };
    }
    const receipt = this.repository.getRetrievalReceipt(run.retrievalReceiptId);
    const view = this.deriveView(run);
    const mismatches: string[] = [];
    if (!receipt || receipt.integrityHash !== run.replay.retrievalReceiptHash) {
      mismatches.push("retrieval_receipt_hash_mismatch");
    }
    for (const source of run.replay.sourceRecords) {
      const record = this.repository.getRecord(source.id);
      if (!record || record.integrityHash !== source.integrityHash) {
        mismatches.push(`source_hash_mismatch:${source.id}`);
      }
    }
    if (sha256(run.objective) !== run.replay.objectiveHash) mismatches.push("objective_hash_mismatch");
    if (sha256(run.instruction) !== run.replay.instructionHash) mismatches.push("instruction_hash_mismatch");
    if (sha256(run.model.parameters) !== run.model.parametersHash) mismatches.push("model_parameters_hash_mismatch");

    const outputHash = view.proposal ? sha256(view.proposal) : null;
    const { replayKey: _replayKey, ...baseManifest } = run.replay;
    void _replayKey;
    const completedUnsigned = { ...baseManifest, outputHash };
    const manifest: AgentReplayManifest = {
      ...completedUnsigned,
      replayKey: sha256(completedUnsigned),
    };
    const verified = mismatches.length === 0;
    const now = this.now();
    await this.repository.runExclusive(scope, () => {
      this.repository.appendAgentRunEvent({
        runId: run.id,
        scope: run.scope,
        type: "replay_verified",
        actor,
        occurredAt: now,
        durationMilliseconds: 0,
        proposal: null,
        proposalHash: outputHash,
        evaluation: null,
        gates: view.gates,
        details: { verified, mismatches, replay_key: manifest.replayKey },
      });
      this.repository.appendAuditEvent({
        scope: run.scope,
        type: "agent_replay_verified",
        actor,
        resourceId: run.id,
        occurredAt: now,
        details: { verified, mismatches, replay_key: manifest.replayKey },
      });
    });
    return { verified, mismatches, manifest };
  }
}
