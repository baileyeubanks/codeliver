/**
 * Co‑ProVideo — notification outbox (provider-neutral).
 *
 * Guidance source: sms-communications skill — reuse the repo's channel model,
 * normalize E.164, keep an audit trail with idempotency keys, dry-run cannot
 * send through a live provider, missing credentials degrade to
 * queued/pending — never claimed delivery.
 */

import { createHash } from "node:crypto";
import type {
  NotificationChannel,
  NotificationOutboxItem,
  NotificationOutboxStatus,
} from "./record.ts";

/* ------------------------------ E.164 -------------------------------------- */

/**
 * Normalize to E.164. Returns null when the input cannot become a plausible
 * E.164 number. US/CA default (+1) for bare 10-digit numbers; leading "+" is
 * respected; anything longer than 15 digits is rejected.
 */
export function normalizeE164(input: string): string | null {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (!hasPlus && digits.length === 10) return `+1${digits}`;
  if (!hasPlus && digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (hasPlus && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/* --------------------------- Outbox building -------------------------------- */

export interface OutboxDraft {
  projectId: string;
  intent: string;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  body: string;
}

/** Stable idempotency key: same intent+channel+recipient+body ⇒ same key. */
export function notificationIdempotencyKey(draft: OutboxDraft): string {
  return createHash("sha256")
    .update(`${draft.intent}:${draft.channel}:${draft.recipient.toLowerCase()}:${draft.subject}:${draft.body}`)
    .digest("hex")
    .slice(0, 32);
}

/** Deduplicate drafts against existing items (same idempotency key). */
export function dedupeOutboxDrafts(
  drafts: OutboxDraft[],
  existing: Pick<NotificationOutboxItem, "idempotency_key">[],
): OutboxDraft[] {
  const keys = new Set(existing.map((item) => item.idempotency_key));
  return drafts.filter((draft) => !keys.has(notificationIdempotencyKey(draft)));
}

/* --------------------------- Dry-run dispatch -------------------------------- */

export interface OutboxDispatchContext {
  emailConfigured: boolean;
  smsConfigured: boolean;
  imessageConfigured: boolean;
}

export interface OutboxDispatchResult {
  status: NotificationOutboxStatus;
  provider: string | null;
  error: string | null;
}

/**
 * Resolve what would happen to an outbox item in THIS environment. Demo/local
 * dispatch is always dry-run: it never claims live delivery, and unconfigured
 * providers degrade to pending_provider for operator review.
 */
export function dispatchOutboxDraft(
  draft: Pick<OutboxDraft, "channel" | "recipient">,
  context: OutboxDispatchContext,
): OutboxDispatchResult {
  if (draft.channel === "sms" && !normalizeE164(draft.recipient)) {
    return { status: "failed", provider: null, error: "invalid_e164_recipient" };
  }

  const configured =
    draft.channel === "email"
      ? context.emailConfigured
      : draft.channel === "sms"
        ? context.smsConfigured
        : context.imessageConfigured;

  if (!configured) {
    return { status: "pending_provider", provider: null, error: "provider_not_configured" };
  }

  // Dry-run only: a real provider handoff happens in the API runtime with
  // signed delivery events. Local dispatch proves formatting and routing only.
  return { status: "dry_run_sent", provider: "dry-run", error: null };
}

/** Build review-link notification drafts (client reviewer per channel). */
export function buildReviewLinkDrafts(input: {
  projectId: string;
  linkId: string;
  message: string;
  reviewerEmail: string | null;
  reviewerPhone: string | null;
  channels: readonly NotificationChannel[];
  publicUrl: string;
}): OutboxDraft[] {
  const drafts: OutboxDraft[] = [];
  for (const channel of input.channels) {
    const recipient = channel === "email" ? input.reviewerEmail : input.reviewerPhone;
    if (!recipient) continue;
    drafts.push({
      projectId: input.projectId,
      intent: "review_link",
      channel,
      recipient,
      subject: input.message,
      body: `${input.message}\n${input.publicUrl}`,
    });
  }
  return drafts;
}
