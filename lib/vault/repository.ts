import type { JsonValue } from "../metering/canonical";
import type {
  AgentRunContract,
  AgentRunEvent,
  VaultActor,
  VaultAuditEvent,
  VaultAuditEventType,
  VaultIdempotencyRecord,
  VaultProjectPolicy,
  VaultRecord,
  VaultRetrievalReceipt,
  VaultScope,
} from "./types";

export interface VaultAuditEventDraft {
  scope: VaultScope;
  type: VaultAuditEventType;
  actor: VaultActor;
  resourceId: string | null;
  occurredAt: string;
  details: JsonValue;
}

export interface AgentRunEventDraft {
  runId: string;
  scope: VaultScope;
  type: AgentRunEvent["type"];
  actor: VaultActor;
  occurredAt: string;
  durationMilliseconds: number | null;
  proposal: AgentRunEvent["proposal"];
  proposalHash: string | null;
  evaluation: AgentRunEvent["evaluation"];
  gates: AgentRunEvent["gates"];
  details: JsonValue;
}

export interface VaultStateSnapshot {
  scope: VaultScope;
  policy: VaultProjectPolicy | null;
  policyHistory: readonly VaultProjectPolicy[];
  records: readonly VaultRecord[];
  retrievalReceipts: readonly VaultRetrievalReceipt[];
  auditEvents: readonly VaultAuditEvent[];
  agentRuns: readonly AgentRunContract[];
  agentRunEvents: readonly AgentRunEvent[];
  idempotencyRecords: readonly VaultIdempotencyRecord[];
}

export interface VaultRepository {
  /** Atomic project transaction. Every write must roll back if the callback fails. */
  runExclusive<T>(scope: VaultScope, operation: () => T | Promise<T>): Promise<T>;

  getPolicy(scope: VaultScope): VaultProjectPolicy | null;
  savePolicy(policy: VaultProjectPolicy): void;
  listPolicyHistory(scope: VaultScope): readonly VaultProjectPolicy[];

  getRecord(id: string): VaultRecord | null;
  saveRecord(record: VaultRecord): void;
  listRecords(scope: VaultScope): readonly VaultRecord[];

  getRetrievalReceipt(id: string): VaultRetrievalReceipt | null;
  saveRetrievalReceipt(receipt: VaultRetrievalReceipt): void;
  listRetrievalReceipts(scope: VaultScope): readonly VaultRetrievalReceipt[];

  appendAuditEvent(draft: VaultAuditEventDraft): VaultAuditEvent;
  listAuditEvents(scope: VaultScope): readonly VaultAuditEvent[];

  getAgentRun(id: string): AgentRunContract | null;
  saveAgentRun(run: AgentRunContract): void;
  listAgentRuns(scope: VaultScope): readonly AgentRunContract[];
  appendAgentRunEvent(draft: AgentRunEventDraft): AgentRunEvent;
  listAgentRunEvents(runId: string): readonly AgentRunEvent[];

  getIdempotency(scope: VaultScope, action: string, key: string): VaultIdempotencyRecord | null;
  saveIdempotency(record: VaultIdempotencyRecord): void;

  snapshot(scope: VaultScope): VaultStateSnapshot;
}
