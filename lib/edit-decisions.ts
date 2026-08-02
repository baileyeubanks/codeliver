import type {
  EditDecision,
  EditDecisionSource,
  EditDecisionStatus,
  EditDecisionType,
} from "@/lib/types/codeliver";

const MAX_TIMELINE_SECONDS = 7 * 24 * 60 * 60;

export const EDIT_DECISION_TYPES = [
  "cut",
  "trim",
  "mute",
  "lift",
  "ripple_delete",
  "remove_silence",
  "remove_filler",
  "replace",
] as const satisfies readonly EditDecisionType[];

export const EDIT_DECISION_SOURCES = [
  "keyboard",
  "manual",
  "transcript_ai",
  "silence_scan",
  "filler_scan",
  "import",
] as const satisfies readonly EditDecisionSource[];

export const EDIT_DECISION_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "applied",
] as const satisfies readonly EditDecisionStatus[];

export interface EditDecisionInput {
  decision_type: EditDecisionType;
  source: EditDecisionSource;
  start_seconds: number;
  end_seconds: number | null;
  label: string | null;
  confidence: number | null;
  client_request_id: string;
  metadata: Record<string, unknown>;
}

type ParseResult =
  | { ok: true; value: EditDecisionInput }
  | { ok: false; error: string; status?: 400 | 403 };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isTimelineSecond(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_TIMELINE_SECONDS
  );
}

export function parseEditDecisionInput(input: unknown): ParseResult {
  if (!isPlainRecord(input)) {
    return { ok: false, error: "Edit decision body must be an object" };
  }

  const decisionType = input.decision_type;
  const source = input.source ?? "manual";
  const startSeconds = input.start_seconds;
  const endSeconds = input.end_seconds ?? null;
  const label = typeof input.label === "string" ? input.label.trim() : null;
  const confidence = input.confidence ?? null;
  const clientRequestId = input.client_request_id;
  const metadata = input.metadata ?? {};

  if (!EDIT_DECISION_TYPES.includes(decisionType as EditDecisionType)) {
    return { ok: false, error: "Unsupported edit decision type" };
  }

  if (!EDIT_DECISION_SOURCES.includes(source as EditDecisionSource)) {
    return { ok: false, error: "Unsupported edit decision source" };
  }

  if (!isTimelineSecond(startSeconds)) {
    return { ok: false, error: "start_seconds must be a finite non-negative timeline value" };
  }

  if (endSeconds !== null && !isTimelineSecond(endSeconds)) {
    return { ok: false, error: "end_seconds must be a finite non-negative timeline value" };
  }

  if (endSeconds !== null && endSeconds < startSeconds) {
    return { ok: false, error: "end_seconds cannot be before start_seconds" };
  }

  if (decisionType !== "cut" && (endSeconds === null || endSeconds <= startSeconds)) {
    return { ok: false, error: `${decisionType} decisions require a non-empty time range` };
  }

  if (label && label.length > 160) {
    return { ok: false, error: "Edit decision label is too long" };
  }

  if (
    confidence !== null &&
    (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)
  ) {
    return { ok: false, error: "confidence must be between 0 and 1" };
  }

  if (!isUuid(clientRequestId)) {
    return { ok: false, error: "client_request_id must be a UUID" };
  }

  if (!isPlainRecord(metadata)) {
    return { ok: false, error: "metadata must be an object" };
  }

  if (JSON.stringify(metadata).length > 4096) {
    return { ok: false, error: "metadata is too large" };
  }

  return {
    ok: true,
    value: {
      decision_type: decisionType as EditDecisionType,
      source: source as EditDecisionSource,
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      label: label || null,
      confidence,
      client_request_id: clientRequestId,
      metadata,
    },
  };
}

export function parseExternalReviewEditDecision(input: unknown): ParseResult {
  const parsed = parseEditDecisionInput(input);
  if (!parsed.ok) return parsed;

  if (parsed.value.decision_type !== "cut") {
    return {
      ok: false,
      error: "External review links can only propose cut decisions",
      status: 403,
    };
  }

  if (parsed.value.source !== "keyboard" && parsed.value.source !== "manual") {
    return {
      ok: false,
      error: "External review links cannot create automated edit decisions",
      status: 403,
    };
  }

  return parsed;
}

export function toTimelineCut(decision: EditDecision) {
  if (decision.decision_type !== "cut" || decision.status === "rejected") return null;

  return {
    id: decision.id,
    time: decision.start_seconds,
    status: decision.status,
    author: decision.created_by_name,
  };
}
