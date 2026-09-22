import { createHash, timingSafeEqual } from "node:crypto";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface ConfirmedReviewRecipient {
  email?: string | null;
  email_confirmed_at?: string | null;
}

/** Uses the same trim/lowercase contract as review invite recipients. */
export function normalizeReviewRecipientEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

/** Keeps the recipient's address out of signed admission grants and RPC inputs. */
export function hashReviewRecipientEmail(value: unknown): string | null {
  const normalized = normalizeReviewRecipientEmail(value);
  return normalized
    ? createHash("sha256").update(normalized, "utf8").digest("hex")
    : null;
}

/** A session proves a recipient only after its provider-confirmed email is present. */
export function reviewRecipientHashForConfirmedUser(
  identity: ConfirmedReviewRecipient | null | undefined,
): string | null {
  if (
    !identity ||
    typeof identity.email_confirmed_at !== "string" ||
    !identity.email_confirmed_at.trim()
  ) {
    return null;
  }
  return hashReviewRecipientEmail(identity.email);
}

export function reviewRecipientHashMatches(
  expected: string | null | undefined,
  actual: string | null | undefined,
): boolean {
  if (
    typeof expected !== "string" ||
    typeof actual !== "string" ||
    !SHA256_PATTERN.test(expected) ||
    !SHA256_PATTERN.test(actual)
  ) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(actual, "utf8"));
}
