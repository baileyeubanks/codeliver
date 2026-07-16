import { compositeKey, deterministicId, immutableClone, sha256 } from "../metering/canonical";
import { vaultScopeKey } from "./policy";
import type {
  AgentRunEventDraft,
  VaultAuditEventDraft,
  VaultRepository,
  VaultStateSnapshot,
} from "./repository";
import type {
  AgentRunContract,
  AgentRunEvent,
  VaultAuditEvent,
  VaultIdempotencyRecord,
  VaultProjectPolicy,
  VaultRecord,
  VaultRetrievalReceipt,
  VaultScope,
} from "./types";

function sameScope(left: VaultScope, right: VaultScope) {
  return (
    left.organizationId === right.organizationId && left.projectId === right.projectId
  );
}

function idempotencyKey(scope: VaultScope, action: string, key: string) {
  return compositeKey(vaultScopeKey(scope), action, key);
}

export function vaultAuditEventHash(event: Omit<VaultAuditEvent, "hash">) {
  return sha256(event);
}

export function agentRunEventHash(event: Omit<AgentRunEvent, "hash">) {
  return sha256(event);
}

export class InMemoryVaultRepository implements VaultRepository {
  private readonly policies = new Map<string, VaultProjectPolicy>();
  private readonly policyHistory = new Map<string, VaultProjectPolicy>();
  private readonly records = new Map<string, VaultRecord>();
  private readonly retrievalReceipts = new Map<string, VaultRetrievalReceipt>();
  private readonly auditEvents = new Map<string, VaultAuditEvent[]>();
  private readonly agentRuns = new Map<string, AgentRunContract>();
  private readonly agentRunEvents = new Map<string, AgentRunEvent[]>();
  private readonly idempotency = new Map<string, VaultIdempotencyRecord>();
  private transactionTail: Promise<void> = Promise.resolve();

  private captureState() {
    return immutableClone({
      policies: [...this.policies],
      policyHistory: [...this.policyHistory],
      records: [...this.records],
      retrievalReceipts: [...this.retrievalReceipts],
      auditEvents: [...this.auditEvents],
      agentRuns: [...this.agentRuns],
      agentRunEvents: [...this.agentRunEvents],
      idempotency: [...this.idempotency],
    });
  }

  private restoreState(snapshot: ReturnType<InMemoryVaultRepository["captureState"]>) {
    const restore = <K, V>(target: Map<K, V>, entries: readonly (readonly [K, V])[]) => {
      target.clear();
      for (const [key, value] of entries) target.set(key, value);
    };
    restore(this.policies, snapshot.policies);
    restore(this.policyHistory, snapshot.policyHistory);
    restore(this.records, snapshot.records);
    restore(this.retrievalReceipts, snapshot.retrievalReceipts);
    restore(this.auditEvents, snapshot.auditEvents);
    restore(this.agentRuns, snapshot.agentRuns);
    restore(this.agentRunEvents, snapshot.agentRunEvents);
    restore(this.idempotency, snapshot.idempotency);
  }

  async runExclusive<T>(scope: VaultScope, operation: () => T | Promise<T>): Promise<T> {
    void scope;
    const previous = this.transactionTail;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    this.transactionTail = previous.then(() => gate);

    await previous;
    const snapshot = this.captureState();
    try {
      return await operation();
    } catch (error) {
      this.restoreState(snapshot);
      throw error;
    } finally {
      release();
    }
  }

  getPolicy(scope: VaultScope) {
    const policy = this.policies.get(vaultScopeKey(scope));
    return policy ? immutableClone(policy) : null;
  }

  savePolicy(policy: VaultProjectPolicy) {
    const historical = this.policyHistory.get(policy.id);
    if (historical && historical.integrityHash !== policy.integrityHash) {
      throw new Error(`Vault policy history is immutable: ${policy.id}`);
    }
    this.policyHistory.set(policy.id, immutableClone(policy));
    this.policies.set(vaultScopeKey(policy.scope), immutableClone(policy));
  }

  listPolicyHistory(scope: VaultScope) {
    return [...this.policyHistory.values()]
      .filter((policy) => sameScope(policy.scope, scope))
      .sort(
        (a, b) =>
          a.configuredAt.localeCompare(b.configuredAt) || a.id.localeCompare(b.id),
      )
      .map(immutableClone);
  }

  getRecord(id: string) {
    const record = this.records.get(id);
    return record ? immutableClone(record) : null;
  }

  saveRecord(record: VaultRecord) {
    if (this.records.has(record.id)) throw new Error(`Vault record already exists: ${record.id}`);
    this.records.set(record.id, immutableClone(record));
  }

  listRecords(scope: VaultScope) {
    return [...this.records.values()]
      .filter((record) => sameScope(record.scope, scope))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(immutableClone);
  }

  getRetrievalReceipt(id: string) {
    const receipt = this.retrievalReceipts.get(id);
    return receipt ? immutableClone(receipt) : null;
  }

  saveRetrievalReceipt(receipt: VaultRetrievalReceipt) {
    if (this.retrievalReceipts.has(receipt.id)) {
      throw new Error(`Retrieval receipt already exists: ${receipt.id}`);
    }
    this.retrievalReceipts.set(receipt.id, immutableClone(receipt));
  }

  listRetrievalReceipts(scope: VaultScope) {
    return [...this.retrievalReceipts.values()]
      .filter((receipt) => sameScope(receipt.scope, scope))
      .sort(
        (a, b) =>
          a.retrievedAt.localeCompare(b.retrievedAt) || a.id.localeCompare(b.id),
      )
      .map(immutableClone);
  }

  appendAuditEvent(draft: VaultAuditEventDraft) {
    const key = vaultScopeKey(draft.scope);
    const events = this.auditEvents.get(key) ?? [];
    const previous = events.at(-1) ?? null;
    const sequence = events.length + 1;
    const unsigned: Omit<VaultAuditEvent, "hash"> = {
      id: deterministicId("vae", {
        scope: draft.scope,
        sequence,
        type: draft.type,
        resourceId: draft.resourceId,
        occurredAt: draft.occurredAt,
      }),
      schemaVersion: "vault-audit-event.v1",
      ...immutableClone(draft),
      sequence,
      previousHash: previous?.hash ?? null,
    };
    const event: VaultAuditEvent = { ...unsigned, hash: vaultAuditEventHash(unsigned) };
    events.push(event);
    this.auditEvents.set(key, events);
    return immutableClone(event);
  }

  listAuditEvents(scope: VaultScope) {
    return (this.auditEvents.get(vaultScopeKey(scope)) ?? []).map(immutableClone);
  }

  getAgentRun(id: string) {
    const run = this.agentRuns.get(id);
    return run ? immutableClone(run) : null;
  }

  saveAgentRun(run: AgentRunContract) {
    if (this.agentRuns.has(run.id)) throw new Error(`Agent run already exists: ${run.id}`);
    this.agentRuns.set(run.id, immutableClone(run));
  }

  listAgentRuns(scope: VaultScope) {
    return [...this.agentRuns.values()]
      .filter((run) => sameScope(run.scope, scope))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(immutableClone);
  }

  appendAgentRunEvent(draft: AgentRunEventDraft) {
    const events = this.agentRunEvents.get(draft.runId) ?? [];
    const previous = events.at(-1) ?? null;
    const sequence = events.length + 1;
    const unsigned: Omit<AgentRunEvent, "hash"> = {
      id: deterministicId("are", {
        runId: draft.runId,
        sequence,
        type: draft.type,
        occurredAt: draft.occurredAt,
      }),
      schemaVersion: "agent-run-event.v1",
      ...immutableClone(draft),
      sequence,
      previousHash: previous?.hash ?? null,
    };
    const event: AgentRunEvent = { ...unsigned, hash: agentRunEventHash(unsigned) };
    events.push(event);
    this.agentRunEvents.set(draft.runId, events);
    return immutableClone(event);
  }

  listAgentRunEvents(runId: string) {
    return (this.agentRunEvents.get(runId) ?? []).map(immutableClone);
  }

  getIdempotency(scope: VaultScope, action: string, key: string) {
    const record = this.idempotency.get(idempotencyKey(scope, action, key));
    return record ? immutableClone(record) : null;
  }

  saveIdempotency(record: VaultIdempotencyRecord) {
    const key = compositeKey(record.scopeKey, record.action, record.key);
    const { integrityHash, ...unsigned } = record;
    if (integrityHash !== sha256(unsigned)) {
      throw new Error(
        "Vault idempotency integrity failed: " + record.action + ":" + record.key,
      );
    }
    const existing = this.idempotency.get(key);
    if (existing && existing.integrityHash !== record.integrityHash) {
      throw new Error(`Vault idempotency conflict: ${record.action}:${record.key}`);
    }
    if (existing) return;
    this.idempotency.set(key, immutableClone(record));
  }

  snapshot(scope: VaultScope): VaultStateSnapshot {
    const runs = this.listAgentRuns(scope);
    return {
      scope: immutableClone(scope),
      policy: this.getPolicy(scope),
      policyHistory: this.listPolicyHistory(scope),
      records: this.listRecords(scope),
      retrievalReceipts: this.listRetrievalReceipts(scope),
      auditEvents: this.listAuditEvents(scope),
      agentRuns: runs,
      agentRunEvents: runs.flatMap((run) => this.listAgentRunEvents(run.id)),
      idempotencyRecords: [...this.idempotency.values()]
        .filter((record) => record.scopeKey === vaultScopeKey(scope))
        .map(immutableClone),
    };
  }
}
