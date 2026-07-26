import type { JsonValue } from "../metering/canonical";

export interface VaultScope {
  organizationId: string;
  projectId: string;
}

export type VaultRole =
  | "owner"
  | "admin"
  | "creator"
  | "auditor"
  | "agent"
  | "service"
  | "reviewer"
  | "client";

export type VaultCapability =
  | "vault:read"
  | "vault:write"
  | "vault:retrieve"
  | "vault:export"
  | "agent:plan"
  | "agent:submit_output"
  | "agent:approve"
  | "agent:cancel"
  | "agent:rollback"
  | "agent:audit";

export interface VaultActor {
  id: string;
  role: VaultRole;
  kind: "human" | "service" | "agent";
  capabilities: readonly VaultCapability[];
}

export type VaultRecordFamily =
  | "source_artifact"
  | "evidence"
  | "claim"
  | "pattern"
  | "brand_rule"
  | "performance_observation"
  | "script_decision"
  | "edit_decision"
  | "delivery_decision"
  | "agent_run"
  | "usage_receipt";

export type ProvenanceType =
  | "primary"
  | "secondary"
  | "user_assertion"
  | "inference"
  | "hypothesis";

export type ReviewStatus =
  | "unreviewed"
  | "reviewed"
  | "approved"
  | "rejected"
  | "quarantined";

export type VaultPermission =
  | "read"
  | "retrieve"
  | "create"
  | "supersede"
  | "export"
  | "approve_agent";

export interface VaultAclEntry {
  principalType: "actor" | "role";
  principalId: string;
  permissions: readonly VaultPermission[];
}

export interface VaultAcl {
  visibility: "private" | "project" | "organization" | "client";
  allowTenantAdmins: boolean;
  entries: readonly VaultAclEntry[];
}

export interface VaultSourceReference {
  uri: string | null;
  artifactId: string | null;
  externalSourceId: string | null;
  capturedAt: string;
  contentChecksum: string;
  mediaType: string;
}

export type EvidenceLocator =
  | {
      kind: "text_span";
      start: number;
      end: number;
      quote: string;
      quoteChecksum: string;
    }
  | {
      kind: "time_range";
      startMilliseconds: number;
      endMilliseconds: number;
      transcript: string;
      transcriptChecksum: string;
    }
  | {
      kind: "page_region";
      page: number;
      label: string;
      excerpt: string;
      excerptChecksum: string;
    };

export interface VaultCitation {
  sourceRecordId: string;
  evidenceRecordId: string | null;
  relation: "supports" | "challenges" | "context" | "derived_from";
  locator: EvidenceLocator;
}

export interface VaultRetention {
  class: "transient" | "project" | "contract" | "regulated" | "legal_hold";
  retainUntil: string | null;
  deletionEligibleAt: string | null;
  legalHold: boolean;
  policyVersion: string;
}

export interface VaultResidency {
  storageRegion: string;
  allowedProcessingRegions: readonly string[];
  crossBorderTransferAllowed: boolean;
  policyVersion: string;
}

export interface VaultRights {
  classification: "public" | "internal" | "confidential" | "restricted";
  aiUseAllowed: boolean;
  derivativeUseAllowed: boolean;
  exportAllowed: boolean;
  license: string;
  expiresAt: string | null;
}

export interface SecurityFinding {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  start: number | null;
  end: number | null;
  evidenceHash: string;
  message: string;
}

export interface PromptInjectionAssessment {
  scannerVersion: string;
  risk: "none" | "low" | "medium" | "high" | "critical";
  blocked: boolean;
  findings: readonly SecurityFinding[];
  contentHash: string;
}

export interface VaultRecordContent {
  text: string;
  data: JsonValue;
}

export interface VaultRecord {
  id: string;
  schemaVersion: "vault-record.v1";
  scope: VaultScope;
  family: VaultRecordFamily;
  revision: number;
  title: string;
  content: VaultRecordContent;
  contentHash: string;
  source: VaultSourceReference;
  provenanceType: ProvenanceType;
  confidenceBasisPoints: number;
  reviewStatus: ReviewStatus;
  citations: readonly VaultCitation[];
  acl: VaultAcl;
  retention: VaultRetention;
  residency: VaultResidency;
  rights: VaultRights;
  promptInjection: PromptInjectionAssessment;
  author: VaultActor;
  supersedesId: string | null;
  createdAt: string;
  idempotencyKey: string;
  requestHash: string;
  integrityHash: string;
}

export interface VaultProjectPolicy {
  id: string;
  schemaVersion: "vault-project-policy.v1";
  scope: VaultScope;
  version: string;
  allowedStorageRegions: readonly string[];
  allowedProcessingRegions: readonly string[];
  allowedExternalDomains: readonly string[];
  allowedProviders: readonly string[];
  allowedModels: readonly string[];
  maximumRetentionDays: number;
  maximumAgentContextCharacters: number;
  maximumAgentAttemptsPerReservation: number;
  requireReviewedAgentSources: boolean;
  promptInjectionAction: "quarantine";
  confidentialProviderUseAllowed: boolean;
  auditRetentionDays: number;
  configuredBy: string;
  configuredAt: string;
  integrityHash: string;
}

export interface CreateVaultRecordInput {
  scope: VaultScope;
  family: VaultRecordFamily;
  title: string;
  content: VaultRecordContent;
  source: VaultSourceReference;
  provenanceType: ProvenanceType;
  confidenceBasisPoints: number;
  reviewStatus: Exclude<ReviewStatus, "quarantined">;
  citations: readonly VaultCitation[];
  acl: VaultAcl;
  retention: VaultRetention;
  residency: VaultResidency;
  rights: VaultRights;
  author: VaultActor;
  supersedesId: string | null;
  idempotencyKey: string;
}

export interface VaultRetrievalRequest {
  scope: VaultScope;
  actor: VaultActor;
  query: string;
  families: readonly VaultRecordFamily[];
  sourceSetIds: readonly string[];
  purpose: "human_read" | "agent_context" | "audit";
  processingRegion: string;
  limit: number;
  idempotencyKey: string;
}

export interface VaultRetrievalHit {
  recordId: string;
  recordIntegrityHash: string;
  family: VaultRecordFamily;
  title: string;
  score: number;
  exactSpans: readonly EvidenceLocator[];
  contextBlock: string;
  provenanceType: ProvenanceType;
  confidenceBasisPoints: number;
  reviewStatus: ReviewStatus;
}

export interface VaultRetrievalDenial {
  recordId: string;
  reasons: readonly string[];
}

export interface VaultRetrievalReceipt {
  id: string;
  schemaVersion: "vault-retrieval-receipt.v1";
  scope: VaultScope;
  actor: VaultActor;
  purpose: VaultRetrievalRequest["purpose"];
  queryHash: string;
  requestedFamilies: readonly VaultRecordFamily[];
  requestedSourceSetIds: readonly string[];
  processingRegion: string;
  hits: readonly VaultRetrievalHit[];
  denials: readonly VaultRetrievalDenial[];
  contextCharacterCount: number;
  contextLimit: number;
  policyVersion: string;
  policyHash: string;
  retrievedAt: string;
  idempotencyKey: string;
  requestHash: string;
  integrityHash: string;
}

export type VaultAuditEventType =
  | "policy_configured"
  | "record_created"
  | "record_superseded"
  | "retrieval_completed"
  | "retrieval_blocked"
  | "agent_run_planned"
  | "agent_run_blocked"
  | "agent_output_recorded"
  | "agent_evaluation_completed"
  | "agent_human_decision_recorded"
  | "agent_run_cancelled"
  | "agent_rollback_recorded"
  | "agent_replay_verified"
  | "audit_exported";

export interface VaultAuditEvent {
  id: string;
  schemaVersion: "vault-audit-event.v1";
  scope: VaultScope;
  sequence: number;
  type: VaultAuditEventType;
  actor: VaultActor;
  resourceId: string | null;
  occurredAt: string;
  details: JsonValue;
  previousHash: string | null;
  hash: string;
}

export interface VaultIdempotencyRecord {
  scopeKey: string;
  action: string;
  key: string;
  requestHash: string;
  resourceType: "vault_record" | "retrieval_receipt" | "agent_run" | "agent_event";
  resourceId: string;
  createdAt: string;
  integrityHash: string;
}

export interface ModelLineage {
  provider: string;
  model: string;
  modelVersion: string;
  deployment: string | null;
  region: string;
  parameters: JsonValue;
  parametersHash: string;
}

export interface PromptLineage {
  promptId: string;
  promptVersion: string;
  templateHash: string;
  systemInstructionHash: string;
  toolSchemaHash: string;
}

export interface AgentUsageAuthorization {
  reservationId: string;
  quoteId: string;
  scope: VaultScope;
  operation: "ai_research" | "ai_generation" | "media_analysis" | "generated_media";
  status: "active";
  maximumCoUnits: number;
  rateVersion: string;
  pricingVersion: string;
  expiresAt: string;
  integrityHash: string;
}

export type AgentPolicyGateCode =
  | "project_scope"
  | "agent_capability"
  | "budget_reservation"
  | "usage_operation"
  | "execution_permissions"
  | "source_authority"
  | "prompt_injection"
  | "residency"
  | "provider_allowlist"
  | "model_allowlist"
  | "confidentiality"
  | "rights"
  | "citation_grounding"
  | "output_schema"
  | "secret_exfiltration"
  | "external_destination"
  | "human_approval";

export interface AgentPolicyGate {
  code: AgentPolicyGateCode;
  status: "pass" | "fail" | "pending";
  policyVersion: string;
  reasons: readonly string[];
  evidenceIds: readonly string[];
}

export interface AgentRunRequest {
  scope: VaultScope;
  actor: VaultActor;
  capability: "research" | "draft" | "analyze" | "propose_edit" | "generate_media";
  objective: string;
  instruction: string;
  sourceSetIds: readonly string[];
  retrievalQuery: string;
  retrievalFamilies: readonly VaultRecordFamily[];
  processingRegion: string;
  model: ModelLineage;
  prompt: PromptLineage;
  usageAuthorization: AgentUsageAuthorization;
  deterministicSeed: number;
  permissions?: AgentExecutionPermissions;
  idempotencyKey: string;
}

export interface AgentExecutionPermissions {
  network: "deny";
  filesystem: "deny";
  externalWrites: "deny";
  secrets: "deny";
  allowedTools: readonly string[];
}

export interface AgentCitation {
  recordId: string;
  evidenceRecordId: string | null;
  locatorChecksum: string;
}

export interface AgentFactualClaim {
  id: string;
  text: string;
  citations: readonly AgentCitation[];
}

export interface AgentProposal {
  schemaVersion: "agent-proposal.v1";
  summary: string;
  factualClaims: readonly AgentFactualClaim[];
  assumptions: readonly string[];
  recommendedActions: readonly string[];
  externalDestinations: readonly string[];
  confidenceBasisPoints: number;
}

export type AgentRunStatus =
  | "blocked"
  | "awaiting_output"
  | "awaiting_human_approval"
  | "approved"
  | "rejected"
  | "cancelled"
  | "rolled_back";

export interface AgentReplayManifest {
  schemaVersion: "agent-replay-manifest.v1";
  scope: VaultScope;
  objectiveHash: string;
  instructionHash: string;
  sourceRecords: readonly { id: string; integrityHash: string }[];
  retrievalReceiptId: string;
  retrievalReceiptHash: string;
  model: ModelLineage;
  prompt: PromptLineage;
  policyVersion: string;
  usageAuthorizationHash: string;
  executionPermissionsHash: string;
  deterministicSeed: number;
  canonicalInputHash: string;
  outputHash: string | null;
  replayKey: string;
}

export interface AgentRunContract {
  id: string;
  schemaVersion: "agent-run-contract.v1";
  scope: VaultScope;
  actor: VaultActor;
  capability: AgentRunRequest["capability"];
  status: "blocked" | "awaiting_output";
  objective: string;
  instruction: string;
  retrievalReceiptId: string | null;
  model: ModelLineage;
  prompt: PromptLineage;
  usageAuthorization: AgentUsageAuthorization;
  executionMode: "proposal_only";
  permissions: AgentExecutionPermissions;
  gates: readonly AgentPolicyGate[];
  replay: AgentReplayManifest | null;
  createdAt: string;
  idempotencyKey: string;
  requestHash: string;
  integrityHash: string;
}

export interface AgentEvaluation {
  id: string;
  schemaVersion: "agent-evaluation.v1";
  evaluatorVersion: string;
  runId: string;
  groundednessBasisPoints: number;
  citationCoverageBasisPoints: number;
  policyComplianceBasisPoints: number;
  schemaValidityBasisPoints: number;
  passed: boolean;
  findings: readonly SecurityFinding[];
  evaluatedAt: string;
  integrityHash: string;
}

export type AgentRunEventType =
  | "planned"
  | "blocked"
  | "retrieval_completed"
  | "provider_started"
  | "provider_completed"
  | "output_recorded"
  | "evaluation_completed"
  | "awaiting_human_approval"
  | "human_approved"
  | "human_rejected"
  | "cancelled"
  | "rollback_recorded"
  | "replay_verified";

export interface AgentRunEvent {
  id: string;
  schemaVersion: "agent-run-event.v1";
  runId: string;
  scope: VaultScope;
  sequence: number;
  type: AgentRunEventType;
  actor: VaultActor;
  occurredAt: string;
  durationMilliseconds: number | null;
  proposal: AgentProposal | null;
  proposalHash: string | null;
  evaluation: AgentEvaluation | null;
  gates: readonly AgentPolicyGate[];
  details: JsonValue;
  previousHash: string | null;
  hash: string;
}

export interface AgentRunView {
  contract: AgentRunContract;
  status: AgentRunStatus;
  events: readonly AgentRunEvent[];
  proposal: AgentProposal | null;
  evaluation: AgentEvaluation | null;
  gates: readonly AgentPolicyGate[];
  humanDecision: {
    decision: "approved" | "rejected";
    actorId: string;
    reason: string;
    occurredAt: string;
  } | null;
  cancellation: {
    actorId: string;
    reason: string;
    occurredAt: string;
  } | null;
  rollback: {
    actorId: string;
    reason: string;
    occurredAt: string;
    sideEffectsReversed: "none_required";
  } | null;
}

export interface RecordAgentOutputInput {
  scope: VaultScope;
  runId: string;
  actor: VaultActor;
  proposal: AgentProposal;
  providerStartedAt: string;
  providerCompletedAt: string;
  providerResponseIdHash: string;
  idempotencyKey: string;
}

export interface DecideAgentRunInput {
  scope: VaultScope;
  runId: string;
  actor: VaultActor;
  decision: "approved" | "rejected";
  reason: string;
  idempotencyKey: string;
}

export interface CancelAgentRunInput {
  scope: VaultScope;
  runId: string;
  actor: VaultActor;
  reason: string;
  idempotencyKey: string;
}

export interface RollbackAgentRunInput {
  scope: VaultScope;
  runId: string;
  actor: VaultActor;
  reason: string;
  idempotencyKey: string;
}

export interface VaultReconciliationFinding {
  code: string;
  severity: "error" | "warning";
  message: string;
  resourceId: string | null;
}

export interface VaultReconciliationReport {
  id: string;
  schemaVersion: "vault-reconciliation.v1";
  scope: VaultScope;
  passed: boolean;
  findings: readonly VaultReconciliationFinding[];
  recordCount: number;
  retrievalReceiptCount: number;
  agentRunCount: number;
  auditEventCount: number;
  auditHeadHash: string | null;
  checkedAt: string;
  integrityHash: string;
}
