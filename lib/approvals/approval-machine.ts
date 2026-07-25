import type {
  ApprovalDecision,
  ApprovalStep,
  WorkflowMode,
} from "@/lib/types/codeliver";

/**
 * P20 — asset-level approval state machine (Documenso approver pattern).
 *
 * Pure functions only: no I/O, no framework imports, no clock access. The
 * caller owns persistence and timestamps; this module owns the rules.
 *
 * Lifecycle: needs_review → feedback_submitted → changes_in_progress →
 * approved → locked. `locked` is terminal and only reachable from `approved`;
 * it is never derived from data — it is an explicit gate applied via
 * `transition(state, "lock")`.
 */
export type AssetApprovalState =
  | "needs_review"
  | "feedback_submitted"
  | "changes_in_progress"
  | "approved"
  | "locked";

export type ApprovalAction =
  | "submit_feedback"
  | "request_changes"
  | "approve"
  | "lock";

const LEGAL_TRANSITIONS: Readonly<
  Record<AssetApprovalState, readonly AssetApprovalState[]>
> = {
  needs_review: ["feedback_submitted", "approved"],
  feedback_submitted: ["changes_in_progress", "approved"],
  changes_in_progress: ["approved"],
  approved: ["locked"],
  locked: [],
};

const ACTION_TARGETS: Readonly<Record<ApprovalAction, AssetApprovalState>> = {
  submit_feedback: "feedback_submitted",
  request_changes: "changes_in_progress",
  approve: "approved",
  lock: "locked",
};

export function canTransition(from: AssetApprovalState, to: AssetApprovalState): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export type ApprovalTransitionResult =
  | { ok: true; state: AssetApprovalState }
  | { ok: false; error: string };

export function transition(
  state: AssetApprovalState,
  action: ApprovalAction,
): ApprovalTransitionResult {
  const target = ACTION_TARGETS[action];
  if (state === "locked") {
    return {
      ok: false,
      error: `This asset is locked; "${action}" is not allowed once locked.`,
    };
  }
  if (!canTransition(state, target)) {
    return {
      ok: false,
      error: `Cannot ${action} from ${state}: ${state} → ${target} is not a legal transition.`,
    };
  }
  return { ok: true, state: target };
}

const APPROVED_STEP_STATUSES: ReadonlySet<ApprovalDecision> = new Set([
  "approved",
  "approved_with_changes",
]);

const BLOCKING_STEP_STATUSES: ReadonlySet<ApprovalDecision> = new Set([
  "changes_requested",
  "rejected",
]);

/**
 * Derive the asset's lifecycle state from its approval steps and review
 * comments. Never returns "locked" — locking is an explicit act, not a
 * derivation, so callers compose it themselves:
 * `locked ? "locked" : currentAssetState(steps, comments)`.
 */
export function currentAssetState(
  steps: readonly Pick<ApprovalStep, "status">[],
  comments: readonly { id: string }[],
): AssetApprovalState {
  if (steps.length > 0 && steps.every((step) => APPROVED_STEP_STATUSES.has(step.status))) {
    return "approved";
  }
  if (steps.some((step) => BLOCKING_STEP_STATUSES.has(step.status))) {
    return "changes_in_progress";
  }
  if (comments.length > 0) {
    return "feedback_submitted";
  }
  return "needs_review";
}

/**
 * The steps a reviewer can act on right now: sequential workflows activate
 * only the lowest-order pending step; parallel (or unknown) workflows
 * activate every pending step.
 */
export function activeApprovalSteps(
  steps: readonly ApprovalStep[],
  workflowMode: WorkflowMode | null,
): ApprovalStep[] {
  const pending = steps
    .filter((step) => step.status === "pending")
    .sort((left, right) => left.step_order - right.step_order);
  if (workflowMode === "sequential") return pending.slice(0, 1);
  return pending;
}

export type StepChipState = "pending" | "current" | "approved" | "rejected";

export function stepChipState(
  step: Pick<ApprovalStep, "id" | "status">,
  activeStepIds: readonly string[],
): StepChipState {
  if (APPROVED_STEP_STATUSES.has(step.status)) return "approved";
  if (BLOCKING_STEP_STATUSES.has(step.status)) return "rejected";
  return activeStepIds.includes(step.id) ? "current" : "pending";
}

/**
 * Documenso-style audit entry: who decided what on which step, and when.
 * `user_agent` is present only when the runtime genuinely supplied it — it
 * is never fabricated.
 */
export interface ApprovalAuditEntry {
  step_id: string;
  step_order: number;
  role_label: string;
  actor: {
    id: string | null;
    /** Null when the record does not carry the decider's name (derived entries). */
    name: string | null;
    email: string | null;
  };
  action: ApprovalDecision;
  note: string | null;
  decided_at: string;
  user_agent?: string;
}

export function shapeAuditEntry(input: {
  step: Pick<ApprovalStep, "id" | "step_order" | "role_label">;
  actor: { id?: string | null; name: string; email?: string | null };
  decision: ApprovalDecision;
  note?: string | null;
  decidedAt: string;
  userAgent?: string | null;
}): ApprovalAuditEntry {
  if (input.decision === "pending") {
    throw new Error('Audit entries record decisions; "pending" is not a decision.');
  }
  const actorName = input.actor.name.trim();
  if (!actorName) {
    throw new Error("Audit entries require a named actor.");
  }
  if (Number.isNaN(Date.parse(input.decidedAt))) {
    throw new Error(`Audit entries require a valid decidedAt timestamp, got "${input.decidedAt}".`);
  }

  const note = input.note?.trim() || null;
  const userAgent = input.userAgent?.trim();

  const entry: ApprovalAuditEntry = {
    step_id: input.step.id,
    step_order: input.step.step_order,
    role_label: input.step.role_label,
    actor: {
      id: input.actor.id ?? null,
      name: actorName,
      email: input.actor.email?.trim() || null,
    },
    action: input.decision,
    note,
    decided_at: input.decidedAt,
  };
  if (userAgent) entry.user_agent = userAgent;
  return entry;
}

/**
 * Rebuild the audit trail from already-decided steps, oldest decision first.
 * Steps record the assignee, not the decider — so derived entries carry the
 * assignee email but a null actor name rather than an invented one.
 */
export function auditEntriesFromSteps(steps: readonly ApprovalStep[]): ApprovalAuditEntry[] {
  return steps
    .filter((step) => step.status !== "pending" && step.decided_at)
    .sort(
      (left, right) =>
        Date.parse(left.decided_at as string) - Date.parse(right.decided_at as string),
    )
    .map((step) => ({
      step_id: step.id,
      step_order: step.step_order,
      role_label: step.role_label,
      actor: {
        id: step.assignee_id,
        name: null,
        email: step.assignee_email,
      },
      action: step.status,
      note: step.decision_note,
      decided_at: step.decided_at as string,
    }));
}
