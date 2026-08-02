import type { SharePermission } from "@/lib/types/codeliver";

export const REVIEW_COMPLETION_NOTE_MAX_LENGTH = 2_000;
export const REVIEWER_NAME_MAX_LENGTH = 120;

export interface ReviewInviteCompletionRecord {
  id: string;
  review_invite_id: string;
  asset_id: string;
  version_id: string;
  reviewer_name: string;
  reviewer_email: string;
  note: string | null;
  completed_at: string;
}

export interface PublicReviewCompletion {
  reviewer_name: string;
  note: string | null;
  completed_at: string;
}

interface CompletionInviteIdentity {
  permissions: SharePermission;
  reviewer_name: string | null;
  reviewer_email: string | null;
}

interface RecordValue {
  [key: string]: unknown;
}

export function normalizeReviewCompletionReviewerName({
  requestedReviewerName,
  invite,
}: {
  requestedReviewerName?: string | null;
  invite: Pick<CompletionInviteIdentity, "reviewer_name" | "reviewer_email">;
}) {
  const candidate =
    requestedReviewerName?.trim() ||
    invite.reviewer_name?.trim() ||
    invite.reviewer_email?.trim() ||
    "";

  return candidate.slice(0, REVIEWER_NAME_MAX_LENGTH);
}

export function canInviteCompleteReview(invite: CompletionInviteIdentity) {
  return (
    (invite.permissions === "comment" || invite.permissions === "approve") &&
    Boolean(invite.reviewer_email?.trim())
  );
}

export function parseReviewCompletionRequest(value: unknown):
  | { ok: true; reviewerName: string; note: string | null }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Invalid review completion request" };
  }

  const body = value as RecordValue;
  const rawReviewerName = body.reviewer_name;
  const rawNote = body.note;

  if (rawReviewerName != null && typeof rawReviewerName !== "string") {
    return { ok: false, error: "Reviewer name is invalid" };
  }
  if (rawNote != null && typeof rawNote !== "string") {
    return { ok: false, error: "Completion note is invalid" };
  }

  const reviewerName = rawReviewerName?.trim() ?? "";
  const note = rawNote?.trim() || null;

  if (reviewerName.length > REVIEWER_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Reviewer name must be ${REVIEWER_NAME_MAX_LENGTH} characters or fewer`,
    };
  }
  if (note && note.length > REVIEW_COMPLETION_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Completion note must be ${REVIEW_COMPLETION_NOTE_MAX_LENGTH} characters or fewer`,
    };
  }

  return { ok: true, reviewerName, note };
}

export function toPublicReviewCompletion(
  completion: ReviewInviteCompletionRecord | Record<string, unknown>,
): PublicReviewCompletion {
  return {
    reviewer_name:
      typeof completion.reviewer_name === "string" && completion.reviewer_name.trim()
        ? completion.reviewer_name
        : "External reviewer",
    note: typeof completion.note === "string" && completion.note.trim() ? completion.note : null,
    completed_at: String(completion.completed_at),
  };
}
