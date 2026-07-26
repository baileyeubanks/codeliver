import { canonicalJson, deterministicId, sha256 } from "../metering/canonical";
import { actorHasCapability, vaultActorCan } from "./acl";
import { sanitizeUntrustedContext, scanPromptInjection, scanSecretExfiltration } from "./guards";
import {
  assertVaultActor,
  assertVaultIdentifier,
  assertVaultIdempotencyKey,
  assertVaultScope,
  assertVaultTimestamp,
  createVaultIdempotencyRecord,
  sameVaultScope,
  VaultError,
  vaultResourceIntegrity,
} from "./policy";
import type { VaultRepository } from "./repository";
import type {
  CreateVaultRecordInput,
  EvidenceLocator,
  VaultActor,
  VaultCitation,
  VaultProjectPolicy,
  VaultRecord,
  VaultRecordFamily,
  VaultRetrievalDenial,
  VaultRetrievalHit,
  VaultRetrievalReceipt,
  VaultRetrievalRequest,
  VaultScope,
} from "./types";

export interface VaultServiceOptions {
  clock?: () => Date;
}

function locatorChecksum(locator: EvidenceLocator) {
  switch (locator.kind) {
    case "text_span":
      return locator.quoteChecksum;
    case "time_range":
      return locator.transcriptChecksum;
    case "page_region":
      return locator.excerptChecksum;
  }
}

function locatorText(locator: EvidenceLocator) {
  switch (locator.kind) {
    case "text_span":
      return locator.quote;
    case "time_range":
      return locator.transcript;
    case "page_region":
      return locator.excerpt;
  }
}

function validateLocator(locator: EvidenceLocator) {
  const text = locatorText(locator);
  if (!text.trim() || sha256(text) !== locatorChecksum(locator)) {
    throw new VaultError("citation_checksum_invalid", "Citation locator checksum is invalid");
  }
  if (locator.kind === "text_span") {
    if (
      !Number.isSafeInteger(locator.start) ||
      !Number.isSafeInteger(locator.end) ||
      locator.start < 0 ||
      locator.end <= locator.start
    ) {
      throw new VaultError("citation_span_invalid", "Text citation span is invalid");
    }
  }
  if (locator.kind === "time_range") {
    if (
      !Number.isSafeInteger(locator.startMilliseconds) ||
      !Number.isSafeInteger(locator.endMilliseconds) ||
      locator.startMilliseconds < 0 ||
      locator.endMilliseconds <= locator.startMilliseconds
    ) {
      throw new VaultError("citation_span_invalid", "Time citation range is invalid");
    }
  }
  if (locator.kind === "page_region" && (!Number.isSafeInteger(locator.page) || locator.page < 1)) {
    throw new VaultError("citation_span_invalid", "Page citation is invalid");
  }
}

function tokenize(value: string) {
  return [...new Set(value.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])];
}

function scoreRecord(record: VaultRecord, queryTokens: readonly string[]) {
  const title = record.title.toLowerCase();
  const content = record.content.text.toLowerCase();
  const matches = queryTokens.reduce((score, token) => {
    const titleScore = title.includes(token) ? 400 : 0;
    const bodyScore = content.includes(token) ? 120 : 0;
    return score + titleScore + bodyScore;
  }, 0);
  const reviewScore = record.reviewStatus === "approved" ? 150 : record.reviewStatus === "reviewed" ? 80 : 0;
  return matches + reviewScore + Math.floor(record.confidenceBasisPoints / 100);
}

function recordExpired(record: VaultRecord, now: string) {
  if (record.retention.legalHold) return false;
  return (
    record.retention.deletionEligibleAt !== null &&
    record.retention.deletionEligibleAt <= now
  );
}

function citationLocators(record: VaultRecord) {
  return record.citations
    .map((citation) => citation.locator)
    .filter((locator) => record.content.text.includes(locatorText(locator)));
}

function recordIntegrityValid(record: VaultRecord) {
  try {
    return record.integrityHash === vaultResourceIntegrity(record);
  } catch {
    return false;
  }
}

export class VaultService {
  private readonly repository: VaultRepository;
  private readonly clock: () => Date;

  constructor(repository: VaultRepository, options: VaultServiceOptions = {}) {
    this.repository = repository;
    this.clock = options.clock ?? (() => new Date());
  }

  private now() {
    return this.clock().toISOString();
  }

  private requirePolicy(scope: VaultScope) {
    const policy = this.repository.getPolicy(scope);
    if (!policy) {
      throw new VaultError("vault_policy_missing", "Project vault policy is not configured", 409);
    }
    if (policy.integrityHash !== vaultResourceIntegrity(policy)) {
      throw new VaultError("vault_policy_integrity_failed", "Vault policy integrity failed", 409);
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

  async configurePolicy(policy: VaultProjectPolicy, actor: VaultActor) {
    assertVaultScope(policy.scope);
    assertVaultActor(actor);
    if (!(["owner", "admin", "service"] as const).includes(actor.role as "owner" | "admin" | "service")) {
      throw new VaultError("forbidden", "Vault policy requires owner, admin, or service authority", 403);
    }
    if (!actorHasCapability(actor, "vault:write")) {
      throw new VaultError("capability_denied", "Actor lacks vault:write capability", 403);
    }
    if (policy.configuredBy !== actor.id) {
      throw new VaultError(
        "configuration_actor_mismatch",
        "Vault policy configuredBy must match the configuring actor",
        403,
      );
    }
    if (policy.integrityHash !== vaultResourceIntegrity(policy)) {
      throw new VaultError("vault_policy_integrity_failed", "Vault policy integrity hash is invalid", 409);
    }

    return this.repository.runExclusive(policy.scope, () => {
      this.repository.savePolicy(policy);
      return this.repository.appendAuditEvent({
        scope: policy.scope,
        type: "policy_configured",
        actor,
        resourceId: policy.id,
        occurredAt: policy.configuredAt,
        details: {
          policy_version: policy.version,
          storage_regions: [...policy.allowedStorageRegions],
          processing_regions: [...policy.allowedProcessingRegions],
          prompt_injection_action: policy.promptInjectionAction,
        },
      });
    });
  }

  private validateRecordPolicy(input: CreateVaultRecordInput, policy: VaultProjectPolicy, now: string) {
    if (!(["owner", "admin", "creator", "service", "agent"] as const).includes(input.author.role as "owner" | "admin" | "creator" | "service" | "agent")) {
      throw new VaultError("forbidden", "Actor may not create vault records", 403);
    }
    if (!actorHasCapability(input.author, "vault:write")) {
      throw new VaultError("capability_denied", "Actor lacks vault:write capability", 403);
    }
    if (!policy.allowedStorageRegions.includes(input.residency.storageRegion)) {
      throw new VaultError("residency_denied", "Storage region is not allowed by project policy", 409);
    }
    if (
      input.residency.allowedProcessingRegions.some(
        (region) => !policy.allowedProcessingRegions.includes(region),
      )
    ) {
      throw new VaultError("residency_denied", "Record processing region exceeds project policy", 409);
    }
    assertVaultTimestamp(input.source.capturedAt, "source.capturedAt");
    if (input.source.capturedAt > now) {
      throw new VaultError("source_timestamp_invalid", "Source capture time cannot be in the future");
    }
    for (const [field, value] of [
      ["retention.retainUntil", input.retention.retainUntil],
      ["retention.deletionEligibleAt", input.retention.deletionEligibleAt],
      ["rights.expiresAt", input.rights.expiresAt],
    ] as const) {
      if (value !== null) assertVaultTimestamp(value, field);
    }
    if (
      input.retention.retainUntil !== null &&
      input.retention.deletionEligibleAt !== null &&
      input.retention.deletionEligibleAt < input.retention.retainUntil
    ) {
      throw new VaultError(
        "retention_invalid",
        "Deletion eligibility cannot precede the retention boundary",
      );
    }
    if (
      input.retention.legalHold !== (input.retention.class === "legal_hold") ||
      (input.retention.legalHold && input.retention.deletionEligibleAt !== null)
    ) {
      throw new VaultError("retention_invalid", "Legal-hold retention fields are inconsistent");
    }
    if (input.retention.retainUntil) {
      const retentionDays =
        (Date.parse(input.retention.retainUntil) - Date.parse(now)) / 86_400_000;
      if (retentionDays > policy.maximumRetentionDays && !input.retention.legalHold) {
        throw new VaultError("retention_exceeds_policy", "Record retention exceeds project maximum", 409);
      }
    }
    if (!input.acl.allowTenantAdmins && input.acl.entries.length === 0) {
      throw new VaultError("acl_empty", "Deny-by-default ACL requires at least one principal");
    }
    if (!/^[a-f0-9]{64}$/.test(input.source.contentChecksum)) {
      throw new VaultError("source_checksum_invalid", "Source content checksum must be SHA-256");
    }
    if (!input.source.uri && !input.source.artifactId) {
      throw new VaultError("source_authority_missing", "Source URI or artifact ID is required");
    }
    if (!Number.isInteger(input.confidenceBasisPoints) || input.confidenceBasisPoints < 0 || input.confidenceBasisPoints > 10_000) {
      throw new VaultError("confidence_invalid", "Confidence must be 0-10000 basis points");
    }
    if (!input.title.trim() || input.title.length > 240 || input.content.text.length > 1_000_000) {
      throw new VaultError("record_content_invalid", "Record title or content length is invalid");
    }
    for (const entry of input.acl.entries) {
      assertVaultIdentifier(entry.principalId, "acl.principalId");
      if (entry.permissions.length === 0) {
        throw new VaultError("acl_empty_permission", "ACL entries must grant a permission");
      }
    }
  }

  private validateCitation(scope: VaultScope, actor: VaultActor, citation: VaultCitation) {
    validateLocator(citation.locator);
    const source = this.repository.getRecord(citation.sourceRecordId);
    if (
      !source ||
      !sameVaultScope(source.scope, scope) ||
      !recordIntegrityValid(source) ||
      !vaultActorCan(actor, source, "read")
    ) {
      throw new VaultError("citation_source_denied", "Citation source is unavailable in this project", 403);
    }
    if (citation.locator.kind === "text_span") {
      const exact = source.content.text.slice(citation.locator.start, citation.locator.end);
      if (exact !== citation.locator.quote) {
        throw new VaultError("citation_span_mismatch", "Citation text does not match its source span");
      }
    }
    if (citation.evidenceRecordId) {
      const evidence = this.repository.getRecord(citation.evidenceRecordId);
      if (
        !evidence ||
        !sameVaultScope(evidence.scope, scope) ||
        evidence.family !== "evidence" ||
        !recordIntegrityValid(evidence) ||
        !vaultActorCan(actor, evidence, "read")
      ) {
        throw new VaultError("citation_evidence_denied", "Citation evidence is unavailable in this project", 403);
      }
    }
  }

  async createRecord(input: CreateVaultRecordInput): Promise<{ record: VaultRecord; replayed: boolean }> {
    assertVaultScope(input.scope);
    assertVaultActor(input.author);
    assertVaultIdempotencyKey(input.idempotencyKey);
    const injection = scanPromptInjection(input.content.text);
    const contentHash = sha256(input.content);
    const requestHash = sha256({ ...input, idempotencyKey: undefined, contentHash, injection });

    return this.repository.runExclusive(input.scope, () => {
      const replay = this.idempotentResource(
        input.scope,
        "create_record",
        input.idempotencyKey,
        requestHash,
      );
      if (replay) {
        const record = this.repository.getRecord(replay.resourceId);
        if (!record) throw new VaultError("idempotency_orphan", "Vault record replay target is missing", 500);
        return { record, replayed: true };
      }

      const now = this.now();
      const policy = this.requirePolicy(input.scope);
      this.validateRecordPolicy(input, policy, now);
      for (const citation of input.citations) {
        this.validateCitation(input.scope, input.author, citation);
      }
      if (
        input.family === "claim" &&
        input.provenanceType !== "hypothesis" &&
        input.citations.length === 0
      ) {
        throw new VaultError("claim_evidence_required", "Non-hypothesis claims require evidence citations");
      }
      if (input.family === "evidence" && input.citations.length === 0) {
        throw new VaultError("evidence_source_required", "Evidence records require an exact source citation");
      }

      let revision = 1;
      if (input.supersedesId) {
        const prior = this.repository.getRecord(input.supersedesId);
        if (!prior || !sameVaultScope(prior.scope, input.scope)) {
          throw new VaultError("superseded_record_denied", "Superseded record is unavailable in this project", 403);
        }
        if (!recordIntegrityValid(prior)) {
          throw new VaultError(
            "superseded_record_integrity_failed",
            "Superseded record failed integrity validation",
            409,
          );
        }
        if (prior.family !== input.family) {
          throw new VaultError("supersession_family_mismatch", "Supersession must preserve record family");
        }
        if (!vaultActorCan(input.author, prior, "supersede")) {
          throw new VaultError("acl_denied", "Actor may not supersede this record", 403);
        }
        revision = prior.revision + 1;
      }

      const reviewStatus = injection.blocked ? ("quarantined" as const) : input.reviewStatus;
      const unsigned = {
        id: deterministicId("vlt", {
          scope: input.scope,
          family: input.family,
          revision,
          contentHash,
          sourceChecksum: input.source.contentChecksum,
          supersedesId: input.supersedesId,
        }),
        schemaVersion: "vault-record.v1" as const,
        scope: input.scope,
        family: input.family,
        revision,
        title: input.title.trim(),
        content: input.content,
        contentHash,
        source: input.source,
        provenanceType: input.provenanceType,
        confidenceBasisPoints: input.confidenceBasisPoints,
        reviewStatus,
        citations: input.citations,
        acl: input.acl,
        retention: input.retention,
        residency: input.residency,
        rights: input.rights,
        promptInjection: injection,
        author: input.author,
        supersedesId: input.supersedesId,
        createdAt: now,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      };
      const record: VaultRecord = { ...unsigned, integrityHash: sha256(unsigned) };
      this.repository.saveRecord(record);
      this.repository.appendAuditEvent({
        scope: input.scope,
        type: input.supersedesId ? "record_superseded" : "record_created",
        actor: input.author,
        resourceId: record.id,
        occurredAt: now,
        details: {
          family: record.family,
          revision: record.revision,
          review_status: record.reviewStatus,
          provenance_type: record.provenanceType,
          source_checksum: record.source.contentChecksum,
          content_hash: record.contentHash,
          supersedes_id: record.supersedesId,
          injection_risk: record.promptInjection.risk,
        },
      });
      this.repository.saveIdempotency(
        createVaultIdempotencyRecord(
          input.scope,
          "create_record",
          input.idempotencyKey,
          requestHash,
          "vault_record",
          record.id,
          now,
        ),
      );
      return { record, replayed: false };
    });
  }

  async getRecord(scope: VaultScope, recordId: string, actor: VaultActor) {
    assertVaultScope(scope);
    assertVaultActor(actor);
    if (!actorHasCapability(actor, "vault:read")) {
      throw new VaultError("capability_denied", "Actor lacks vault:read capability", 403);
    }
    const record = this.repository.getRecord(recordId);
    if (
      !record ||
      !sameVaultScope(record.scope, scope) ||
      !vaultActorCan(actor, record, "read") ||
      recordExpired(record, this.now())
    ) {
      throw new VaultError("record_not_found", "Vault record was not found", 404);
    }
    if (!recordIntegrityValid(record)) {
      throw new VaultError("vault_record_integrity_failed", "Vault record integrity failed", 409);
    }
    return record;
  }

  async listRecords(scope: VaultScope, actor: VaultActor, families: readonly VaultRecordFamily[] = []) {
    assertVaultScope(scope);
    assertVaultActor(actor);
    if (!actorHasCapability(actor, "vault:read")) {
      throw new VaultError("capability_denied", "Actor lacks vault:read capability", 403);
    }
    const now = this.now();
    const familySet = new Set(families);
    const superseded = new Set(
      this.repository
        .listRecords(scope)
        .map((record) => record.supersedesId)
        .filter((id): id is string => id !== null),
    );
    const records = this.repository.listRecords(scope);
    if (records.some((record) => !recordIntegrityValid(record))) {
      throw new VaultError("vault_record_integrity_failed", "Vault record integrity failed", 409);
    }
    return records
      .filter(
        (record) =>
          (familySet.size === 0 || familySet.has(record.family)) &&
          !superseded.has(record.id) &&
          !recordExpired(record, now) &&
          vaultActorCan(actor, record, "read"),
      );
  }

  private retrievalDenials(
    record: VaultRecord,
    request: VaultRetrievalRequest,
    policy: VaultProjectPolicy,
    now: string,
    superseded: ReadonlySet<string>,
  ) {
    const reasons: string[] = [];
    if (!recordIntegrityValid(record)) reasons.push("record_integrity_failed");
    if (superseded.has(record.id)) reasons.push("superseded");
    if (!vaultActorCan(request.actor, record, "retrieve")) reasons.push("acl_denied");
    if (recordExpired(record, now)) reasons.push("retention_expired");
    if (!record.residency.allowedProcessingRegions.includes(request.processingRegion)) {
      reasons.push("record_processing_region_denied");
    }
    if (!policy.allowedProcessingRegions.includes(request.processingRegion)) {
      reasons.push("policy_processing_region_denied");
    }
    if (request.purpose === "agent_context" && !record.rights.aiUseAllowed) {
      reasons.push("ai_use_denied");
    }
    if (
      request.purpose === "agent_context" &&
      policy.requireReviewedAgentSources &&
      !(["reviewed", "approved"] as const).includes(record.reviewStatus as "reviewed" | "approved")
    ) {
      reasons.push("source_not_reviewed");
    }
    if (record.reviewStatus === "quarantined" || record.promptInjection.blocked) {
      reasons.push("prompt_injection_quarantined");
    }
    if (record.rights.expiresAt !== null && record.rights.expiresAt <= now) {
      reasons.push("rights_expired");
    }
    return reasons;
  }

  async retrieve(request: VaultRetrievalRequest): Promise<VaultRetrievalReceipt> {
    assertVaultScope(request.scope);
    assertVaultActor(request.actor);
    if (!actorHasCapability(request.actor, "vault:retrieve")) {
      throw new VaultError("capability_denied", "Actor lacks vault:retrieve capability", 403);
    }
    assertVaultIdempotencyKey(request.idempotencyKey);
    if (!request.query.trim() || request.query.length > 2_000) {
      throw new VaultError("query_invalid", "Retrieval query must be 1-2000 characters");
    }
    if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 50) {
      throw new VaultError("limit_invalid", "Retrieval limit must be 1-50");
    }
    const requestHash = sha256({ ...request, idempotencyKey: undefined });

    return this.repository.runExclusive(request.scope, () => {
      const replay = this.idempotentResource(
        request.scope,
        "retrieve",
        request.idempotencyKey,
        requestHash,
      );
      if (replay) {
        const receipt = this.repository.getRetrievalReceipt(replay.resourceId);
        if (
          !receipt ||
          !sameVaultScope(receipt.scope, request.scope) ||
          receipt.integrityHash !== vaultResourceIntegrity(receipt)
        ) {
          throw new VaultError(
            "idempotency_orphan",
            "Retrieval replay target is missing or invalid",
            500,
          );
        }
        return receipt;
      }

      const now = this.now();
      const policy = this.requirePolicy(request.scope);
      const queryInjection = scanPromptInjection(request.query);
      const querySecrets = scanSecretExfiltration(request.query);
      const records = this.repository.listRecords(request.scope);
      const allRequested = request.sourceSetIds.map((id) => this.repository.getRecord(id));
      if (
        allRequested.some(
          (record) => record !== null && !sameVaultScope(record.scope, request.scope),
        )
      ) {
        throw new VaultError(
          "source_set_scope_denied",
          "One or more requested sources are unavailable in this project",
          403,
        );
      }

      const superseded = new Set(
        records
          .map((record) => record.supersedesId)
          .filter((id): id is string => id !== null),
      );
      const sourceSet = new Set(request.sourceSetIds);
      const familySet = new Set(request.families);
      const queryTokens = tokenize(request.query);
      const denials: VaultRetrievalDenial[] = [];
      let hits: VaultRetrievalHit[] = [];

      if (queryInjection.blocked || querySecrets.length > 0) {
        denials.push({
          recordId: "request",
          reasons: [
            ...(queryInjection.blocked ? ["query_prompt_injection"] : []),
            ...(querySecrets.length ? ["query_secret_exfiltration"] : []),
          ],
        });
      } else {
        const candidates = records.filter(
          (record) =>
            (familySet.size === 0 || familySet.has(record.family)) &&
            (sourceSet.size === 0 || sourceSet.has(record.id)),
        );
        for (const record of candidates) {
          const reasons = this.retrievalDenials(record, request, policy, now, superseded);
          if (reasons.length) {
            denials.push({ recordId: record.id, reasons });
            continue;
          }
          const score = scoreRecord(record, queryTokens);
          if (score === 0 && sourceSet.size === 0) continue;
          hits.push({
            recordId: record.id,
            recordIntegrityHash: record.integrityHash,
            family: record.family,
            title: record.title,
            score,
            exactSpans: citationLocators(record),
            contextBlock: sanitizeUntrustedContext(
              record.id,
              record.scope,
              record.content.text.slice(0, 16_000),
            ),
            provenanceType: record.provenanceType,
            confidenceBasisPoints: record.confidenceBasisPoints,
            reviewStatus: record.reviewStatus,
          });
        }
        const ranked = hits
          .sort((a, b) => b.score - a.score || a.recordId.localeCompare(b.recordId))
          .slice(0, request.limit);
        hits = [];
        let consumedContextCharacters = 0;
        for (const hit of ranked) {
          if (
            consumedContextCharacters + hit.contextBlock.length >
            policy.maximumAgentContextCharacters
          ) {
            denials.push({
              recordId: hit.recordId,
              reasons: ["context_budget_exceeded"],
            });
            continue;
          }
          hits.push(hit);
          consumedContextCharacters += hit.contextBlock.length;
        }
      }
      const contextCharacterCount = hits.reduce(
        (total, hit) => total + hit.contextBlock.length,
        0,
      );

      const unsigned = {
        id: deterministicId("vrr", {
          requestHash,
          retrievedAt: now,
          hitIds: hits.map((hit) => hit.recordId),
          idempotencyKey: request.idempotencyKey,
        }),
        schemaVersion: "vault-retrieval-receipt.v1" as const,
        scope: request.scope,
        actor: request.actor,
        purpose: request.purpose,
        queryHash: sha256(request.query),
        requestedFamilies: [...request.families],
        requestedSourceSetIds: [...request.sourceSetIds],
        processingRegion: request.processingRegion,
        hits,
        denials,
        contextCharacterCount,
        contextLimit: policy.maximumAgentContextCharacters,
        policyVersion: policy.version,
        policyHash: policy.integrityHash,
        retrievedAt: now,
        idempotencyKey: request.idempotencyKey,
        requestHash,
      };
      const receipt: VaultRetrievalReceipt = {
        ...unsigned,
        integrityHash: sha256(unsigned),
      };
      this.repository.saveRetrievalReceipt(receipt);
      this.repository.appendAuditEvent({
        scope: request.scope,
        type: hits.length === 0 && denials.length > 0 ? "retrieval_blocked" : "retrieval_completed",
        actor: request.actor,
        resourceId: receipt.id,
        occurredAt: now,
        details: {
          purpose: request.purpose,
          query_hash: receipt.queryHash,
          hit_ids: hits.map((hit) => hit.recordId),
          denied_record_ids: denials.map((denial) => denial.recordId),
          processing_region: request.processingRegion,
          policy_version: policy.version,
          context_character_count: contextCharacterCount,
          context_limit: policy.maximumAgentContextCharacters,
        },
      });
      this.repository.saveIdempotency(
        createVaultIdempotencyRecord(
          request.scope,
          "retrieve",
          request.idempotencyKey,
          requestHash,
          "retrieval_receipt",
          receipt.id,
          now,
        ),
      );
      return receipt;
    });
  }

  getRepository() {
    return this.repository;
  }

  async exportAudit(scope: VaultScope, actor: VaultActor) {
    assertVaultScope(scope);
    assertVaultActor(actor);
    if (
      !(["owner", "admin", "auditor", "service"] as const).includes(
        actor.role as "owner" | "admin" | "auditor" | "service",
      ) ||
      !actor.capabilities.includes("vault:export")
    ) {
      throw new VaultError("forbidden", "Vault audit export requires audit authority", 403);
    }

    return this.repository.runExclusive(scope, () => {
      const exportedAt = this.now();
      const snapshot = this.repository.snapshot(scope);
      const redactedRetrievals = snapshot.retrievalReceipts.map((receipt) => ({
        ...receipt,
        hits: receipt.hits.map((hit) => {
          const { contextBlock: _contextBlock, ...redactedHit } = hit;
          void _contextBlock;
          return redactedHit;
        }),
      }));
      const redactedAgentRuns = snapshot.agentRuns.map((run) => ({
        ...run,
        objective: "[redacted]",
        instruction: "[redacted]",
      }));
      const redactedAgentEvents = snapshot.agentRunEvents.map((event) => ({
        ...event,
        proposal: event.proposal
          ? {
              schemaVersion: event.proposal.schemaVersion,
              proposalHash: event.proposalHash,
              factualClaimCount: event.proposal.factualClaims.length,
              externalDestinationHashes: event.proposal.externalDestinations.map(sha256),
            }
          : null,
      }));
      const records = [
        ...snapshot.policyHistory.map((record) => ({ type: "policy", record })),
        ...snapshot.records.map((record) => ({
          type: "vault_record_manifest",
          record: {
            id: record.id,
            family: record.family,
            revision: record.revision,
            scope: record.scope,
            source: {
              ...record.source,
              uri: record.source.uri
                ? "sha256:" + sha256(record.source.uri)
                : null,
              externalSourceId: record.source.externalSourceId
                ? "sha256:" + sha256(record.source.externalSourceId)
                : null,
            },
            provenanceType: record.provenanceType,
            reviewStatus: record.reviewStatus,
            contentHash: record.contentHash,
            integrityHash: record.integrityHash,
            supersedesId: record.supersedesId,
            createdAt: record.createdAt,
          },
        })),
        ...redactedRetrievals.map((record) => ({ type: "retrieval_receipt", record })),
        ...redactedAgentRuns.map((record) => ({ type: "agent_run", record })),
        ...redactedAgentEvents.map((record) => ({ type: "agent_run_event", record })),
        ...snapshot.auditEvents.map((record) => ({ type: "audit_event", record })),
      ];
      const manifest = {
        schemaVersion: "vault-audit-export.v1",
        scope,
        exportedAt,
        exportedBy: actor.id,
        contentIncluded: false,
        recordCount: records.length,
        auditHeadHash: snapshot.auditEvents.at(-1)?.hash ?? null,
      };
      const lines = [
        canonicalJson({ type: "manifest", record: manifest }),
        ...records.map(canonicalJson),
      ];
      const jsonl = `${lines.join("\n")}\n`;
      const event = this.repository.appendAuditEvent({
        scope,
        type: "audit_exported",
        actor,
        resourceId: null,
        occurredAt: exportedAt,
        details: {
          content_included: false,
          record_count: records.length,
          export_hash: sha256(jsonl),
        },
      });
      return {
        manifest: { ...manifest, auditExportEventId: event.id },
        jsonl,
        sha256: sha256(jsonl),
        filename: `vault-audit-${scope.organizationId}-${scope.projectId}.jsonl`,
      };
    });
  }
}
