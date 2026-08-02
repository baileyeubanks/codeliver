import { deterministicId, sha256 } from "../metering/canonical";
import { agentRunEventHash, vaultAuditEventHash } from "./in-memory-repository";
import { sameVaultScope, vaultScopeKey } from "./policy";
import type { VaultStateSnapshot } from "./repository";
import type {
  AgentRunEvent,
  VaultAuditEvent,
  VaultReconciliationFinding,
  VaultReconciliationReport,
} from "./types";

function resourceIntegrity(value: { integrityHash: string }) {
  const { integrityHash: _integrityHash, ...unsigned } = value;
  void _integrityHash;
  return sha256(unsigned);
}

function auditEventIntegrity(event: VaultAuditEvent) {
  const { hash: _hash, ...unsigned } = event;
  void _hash;
  return vaultAuditEventHash(unsigned);
}

function runEventIntegrity(event: AgentRunEvent) {
  const { hash: _hash, ...unsigned } = event;
  void _hash;
  return agentRunEventHash(unsigned);
}

function objectDetails(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function reconcileVaultSnapshot(
  snapshot: VaultStateSnapshot,
  checkedAt: string,
): VaultReconciliationReport {
  const findings: VaultReconciliationFinding[] = [];
  const add = (
    code: string,
    message: string,
    resourceId: string | null,
    severity: VaultReconciliationFinding["severity"] = "error",
  ) => findings.push({ code, severity, message, resourceId });
  const checkResource = (
    resource: { id: string; integrityHash: string },
    label: string,
  ) => {
    try {
      if (resource.integrityHash !== resourceIntegrity(resource)) {
        add("integrity_hash_mismatch", label + " integrity hash is invalid", resource.id);
      }
    } catch {
      add("integrity_payload_invalid", label + " cannot be canonically hashed", resource.id);
    }
  };

  const policies = new Map(
    snapshot.policyHistory.map((policy) => [policy.id, policy]),
  );
  if (snapshot.policy && !policies.has(snapshot.policy.id)) {
    add(
      "current_policy_history_missing",
      "Current policy is absent from immutable policy history",
      snapshot.policy.id,
    );
  }
  for (const policy of policies.values()) {
    checkResource(policy, "Vault policy");
    if (!sameVaultScope(policy.scope, snapshot.scope)) {
      add("policy_scope_mismatch", "Vault policy belongs to another scope", policy.id);
    }
  }

  const records = new Map(snapshot.records.map((record) => [record.id, record]));
  for (const record of records.values()) {
    checkResource(record, "Vault record");
    if (!sameVaultScope(record.scope, snapshot.scope)) {
      add("record_scope_mismatch", "Vault record belongs to another scope", record.id);
    }
    if (record.contentHash !== sha256(record.content)) {
      add("record_content_hash_mismatch", "Vault record content hash is invalid", record.id);
    }
    if (record.promptInjection.contentHash !== sha256(record.content.text)) {
      add(
        "record_guard_hash_mismatch",
        "Prompt-injection assessment is bound to different content",
        record.id,
      );
    }
    if (record.promptInjection.blocked && record.reviewStatus !== "quarantined") {
      add(
        "quarantine_state_mismatch",
        "Blocked source is not quarantined",
        record.id,
      );
    }
    if (record.supersedesId) {
      const prior = records.get(record.supersedesId);
      if (
        !prior ||
        prior.family !== record.family ||
        prior.revision + 1 !== record.revision
      ) {
        add(
          "supersession_chain_invalid",
          "Vault supersession chain is incomplete or inconsistent",
          record.id,
        );
      }
    } else if (record.revision !== 1) {
      add("initial_revision_invalid", "Initial vault record revision must be one", record.id);
    }
    for (const citation of record.citations) {
      const source = records.get(citation.sourceRecordId);
      if (!source || !sameVaultScope(source.scope, record.scope)) {
        add("citation_source_missing", "Citation source is unavailable", record.id);
      }
      if (citation.evidenceRecordId) {
        const evidence = records.get(citation.evidenceRecordId);
        if (!evidence || evidence.family !== "evidence") {
          add("citation_evidence_missing", "Citation evidence is unavailable", record.id);
        }
      }
    }
  }

  const retrievals = new Map(
    snapshot.retrievalReceipts.map((receipt) => [receipt.id, receipt]),
  );
  for (const receipt of retrievals.values()) {
    checkResource(receipt, "Retrieval receipt");
    if (!sameVaultScope(receipt.scope, snapshot.scope)) {
      add(
        "retrieval_scope_mismatch",
        "Retrieval receipt belongs to another scope",
        receipt.id,
      );
    }
    const policy = [...policies.values()].find(
      (candidate) =>
        candidate.version === receipt.policyVersion &&
        candidate.integrityHash === receipt.policyHash,
    );
    if (!policy) {
      add(
        "retrieval_policy_missing",
        "Retrieval policy provenance is unavailable",
        receipt.id,
      );
    }
    const contextCharacterCount = receipt.hits.reduce(
      (total, hit) => total + hit.contextBlock.length,
      0,
    );
    if (
      contextCharacterCount !== receipt.contextCharacterCount ||
      receipt.contextCharacterCount > receipt.contextLimit
    ) {
      add(
        "retrieval_context_budget_mismatch",
        "Retrieval context accounting is invalid",
        receipt.id,
      );
    }
    for (const hit of receipt.hits) {
      const record = records.get(hit.recordId);
      if (!record || record.integrityHash !== hit.recordIntegrityHash) {
        add(
          "retrieval_record_hash_mismatch",
          "Retrieval hit is not bound to its vault record",
          receipt.id,
        );
      }
    }
  }

  let previousAuditHash: string | null = null;
  const auditIds = new Set<string>();
  snapshot.auditEvents.forEach((event, index) => {
    if (auditIds.has(event.id)) {
      add("duplicate_audit_event_id", "Audit event ID is not unique", event.id);
    }
    auditIds.add(event.id);
    if (!sameVaultScope(event.scope, snapshot.scope)) {
      add("audit_scope_mismatch", "Audit event belongs to another scope", event.id);
    }
    if (event.sequence !== index + 1 || event.previousHash !== previousAuditHash) {
      add("audit_chain_break", "Audit event chain is not contiguous", event.id);
    }
    try {
      if (event.hash !== auditEventIntegrity(event)) {
        add("audit_hash_mismatch", "Audit event hash is invalid", event.id);
      }
    } catch {
      add("audit_payload_invalid", "Audit event cannot be canonically hashed", event.id);
    }
    previousAuditHash = event.hash;
  });

  const runs = new Map(snapshot.agentRuns.map((run) => [run.id, run]));
  const runEvents = new Map<string, AgentRunEvent[]>();
  const eventById = new Map<string, AgentRunEvent>();
  for (const event of snapshot.agentRunEvents) {
    runEvents.set(event.runId, [...(runEvents.get(event.runId) ?? []), event]);
    if (eventById.has(event.id)) {
      add("duplicate_agent_event_id", "Agent event ID is not unique", event.id);
    }
    eventById.set(event.id, event);
  }

  for (const run of runs.values()) {
    checkResource(run, "Agent run");
    if (!sameVaultScope(run.scope, snapshot.scope)) {
      add("agent_run_scope_mismatch", "Agent run belongs to another scope", run.id);
    }
    if (
      run.executionMode !== "proposal_only" ||
      run.permissions.network !== "deny" ||
      run.permissions.filesystem !== "deny" ||
      run.permissions.externalWrites !== "deny" ||
      run.permissions.secrets !== "deny" ||
      run.permissions.allowedTools.length !== 0
    ) {
      add(
        "agent_execution_permissions_invalid",
        "Agent run is not proposal-only with deny-all permissions",
        run.id,
      );
    }
    if (run.replay) {
      const { replayKey, ...unsignedReplay } = run.replay;
      if (
        sha256(run.objective) !== run.replay.objectiveHash ||
        sha256(run.instruction) !== run.replay.instructionHash ||
        sha256(run.permissions) !== run.replay.executionPermissionsHash ||
        run.usageAuthorization.integrityHash !== run.replay.usageAuthorizationHash ||
        replayKey !== sha256(unsignedReplay)
      ) {
        add("agent_replay_input_mismatch", "Agent replay inputs do not match the run", run.id);
      }
      const receipt = retrievals.get(run.replay.retrievalReceiptId);
      if (!receipt || receipt.integrityHash !== run.replay.retrievalReceiptHash) {
        add(
          "agent_replay_retrieval_mismatch",
          "Agent replay retrieval receipt is unavailable",
          run.id,
        );
      }
      for (const source of run.replay.sourceRecords) {
        if (records.get(source.id)?.integrityHash !== source.integrityHash) {
          add("agent_replay_source_mismatch", "Agent replay source is unavailable", run.id);
        }
      }
    }

    const events = (runEvents.get(run.id) ?? []).sort(
      (left, right) => left.sequence - right.sequence,
    );
    let previousHash: string | null = null;
    let approved = false;
    let decisions = 0;
    let cancellations = 0;
    let rollbacks = 0;
    events.forEach((event, index) => {
      if (
        !sameVaultScope(event.scope, run.scope) ||
        event.runId !== run.id ||
        event.sequence !== index + 1 ||
        event.previousHash !== previousHash
      ) {
        add("agent_event_chain_break", "Agent event chain is not contiguous", event.id);
      }
      try {
        if (event.hash !== runEventIntegrity(event)) {
          add("agent_event_hash_mismatch", "Agent event hash is invalid", event.id);
        }
      } catch {
        add(
          "agent_event_payload_invalid",
          "Agent event cannot be canonically hashed",
          event.id,
        );
      }
      if (event.proposal && event.proposalHash !== sha256(event.proposal)) {
        add("agent_proposal_hash_mismatch", "Agent proposal hash is invalid", event.id);
      }
      if (event.evaluation) checkResource(event.evaluation, "Agent evaluation");
      if (event.type === "human_approved" || event.type === "human_rejected") {
        decisions += 1;
        if (event.type === "human_approved") approved = true;
      }
      if (event.type === "cancelled") cancellations += 1;
      if (event.type === "rollback_recorded") {
        rollbacks += 1;
        if (!approved) {
          add("rollback_without_approval", "Rollback precedes human approval", event.id);
        }
      }
      previousHash = event.hash;
    });
    if (decisions > 1 || cancellations > 1 || rollbacks > 1) {
      add(
        "duplicate_agent_terminal_event",
        "Agent run has duplicate terminal lifecycle events",
        run.id,
      );
    }
  }

  for (const event of snapshot.agentRunEvents) {
    if (!runs.has(event.runId)) {
      add("agent_event_run_missing", "Agent event references a missing run", event.id);
    }
  }

  for (const record of snapshot.idempotencyRecords) {
    const { integrityHash, ...unsigned } = record;
    if (integrityHash !== sha256(unsigned)) {
      add(
        "idempotency_integrity_mismatch",
        "Vault idempotency record integrity is invalid",
        record.resourceId,
      );
    }
    if (record.scopeKey !== vaultScopeKey(snapshot.scope)) {
      add(
        "idempotency_scope_mismatch",
        "Vault idempotency record belongs to another scope",
        record.resourceId,
      );
    }
    const resource =
      record.resourceType === "vault_record"
        ? records.get(record.resourceId)
        : record.resourceType === "retrieval_receipt"
          ? retrievals.get(record.resourceId)
          : record.resourceType === "agent_run"
            ? runs.get(record.resourceId)
            : eventById.get(record.resourceId);
    if (!resource) {
      add(
        "idempotency_resource_missing",
        "Vault idempotency target is missing",
        record.resourceId,
      );
      continue;
    }
    const resourceRequestHash =
      "requestHash" in resource
        ? resource.requestHash
        : objectDetails(resource.details).request_hash;
    if (
      typeof resourceRequestHash === "string" &&
      resourceRequestHash !== record.requestHash
    ) {
      add(
        "idempotency_request_hash_mismatch",
        "Vault idempotency hash differs from its target",
        record.resourceId,
      );
    }
  }

  const unsigned = {
    id: deterministicId("vrec", {
      scope: snapshot.scope,
      checkedAt,
      auditHeadHash: previousAuditHash,
      findings,
    }),
    schemaVersion: "vault-reconciliation.v1" as const,
    scope: snapshot.scope,
    passed: findings.every((finding) => finding.severity !== "error"),
    findings,
    recordCount: snapshot.records.length,
    retrievalReceiptCount: snapshot.retrievalReceipts.length,
    agentRunCount: snapshot.agentRuns.length,
    auditEventCount: snapshot.auditEvents.length,
    auditHeadHash: previousAuditHash,
    checkedAt,
  };
  return { ...unsigned, integrityHash: sha256(unsigned) };
}
