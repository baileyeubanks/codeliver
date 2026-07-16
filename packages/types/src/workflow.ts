export type RepoHealthStatus = "healthy" | "degraded" | "critical";
export type RepoHealthCheckStatus = "ok" | "warn" | "fail" | "missing";

export interface RepoHealthCheck {
  id: string;
  label: string;
  status: RepoHealthCheckStatus;
  detail: string;
  updatedAt: string;
  meta?: Record<string, unknown>;
}

export interface RepoHealthSnapshot {
  service: "contentco-op-monorepo";
  scope: "full" | "local";
  status: RepoHealthStatus;
  generatedAt: string;
  version: string;
  summary: {
    ok: number;
    warn: number;
    fail: number;
    missing: number;
  };
  checks: RepoHealthCheck[];
}

export type WorkflowState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "dead_lettered"
  | "cancelled";

export type JobStatus = WorkflowState;

export interface RetryPolicy {
  maxAttempts: number;
  backoffSeconds: number;
}

export interface OperationalEntityRef {
  type: string;
  id: string;
}

export interface PlatformEvent {
  name: string;
  version: string;
  sourceSurface: string;
  actorType: "user" | "service" | "automation_actor" | "external_share_actor";
  subject: OperationalEntityRef;
  correlationId: string;
  causationId?: string | null;
  idempotencyKey: string;
  workflowState?: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowTransition {
  workflowId: string;
  from: WorkflowState | "none";
  to: WorkflowState;
  reason: string;
  timestamp: string;
}

export interface DeadLetterRecord {
  jobId: string;
  workflowId: string;
  reason: string;
  lastError: string | null;
  attempts: number;
  movedAt: string;
}

export interface ManualInterventionAction {
  type: "replay" | "cancel" | "force_complete";
  actor: string;
  reason: string;
  timestamp: string;
}
