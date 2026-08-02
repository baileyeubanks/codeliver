export type ReviewThreadAudience = "internal" | "external";

const EXTERNAL_REVIEW_RESPONDER_ROLES = new Set([
  "editor",
  "producer",
  "admin",
  "owner",
]);

export function canReplyToReviewThread({
  audience,
  actorRole,
}: {
  audience: ReviewThreadAudience;
  actorRole?: string | null;
}) {
  return audience === "internal" || EXTERNAL_REVIEW_RESPONDER_ROLES.has(actorRole ?? "");
}

export function replyAudienceFromParent({
  visibility,
  reviewInviteId,
}: {
  visibility: ReviewThreadAudience;
  reviewInviteId?: string | null;
}) {
  return {
    visibility,
    reviewInviteId: visibility === "external" ? reviewInviteId ?? null : null,
  } as const;
}

/**
 * Replies belong to their parent thread's moment; they do not create another
 * frame annotation. Keeping this rule server-side prevents any client from
 * turning a reply into a second pinned review note.
 */
export function replySourceFromParent({
  timecodeSeconds,
}: {
  timecodeSeconds?: number | null;
}) {
  return {
    timecodeSeconds: timecodeSeconds ?? null,
    pinX: null,
    pinY: null,
  } as const;
}

export function isExternalReviewThreadForInvite({
  audience,
  reviewInviteId,
  inviteId,
}: {
  audience: ReviewThreadAudience;
  reviewInviteId?: string | null;
  inviteId: string;
}) {
  return (
    audience === "external" &&
    typeof reviewInviteId === "string" &&
    reviewInviteId === inviteId
  );
}
