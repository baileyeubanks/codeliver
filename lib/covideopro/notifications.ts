/**
 * Co‑ProVideo — notification outbox (provider-neutral).
 *
 * Guidance source: sms-communications skill — reuse the repo's channel model,
 * normalize E.164, keep an audit trail with idempotency keys, dry-run cannot
 * send through a live provider, missing credentials degrade to
 * queued/pending — never claimed delivery.
 */

import type {
  NotificationChannel,
  NotificationOutboxItem,
  NotificationOutboxStatus,
} from "./record.ts";

const SHA256_INITIAL_STATE = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
] as const;

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * Synchronous, browser-safe SHA-256 for deterministic local outbox keys.
 * Keeping this implementation in the shared module preserves the existing
 * digest contract without pulling Node's crypto runtime into hydrated pages.
 */
function sha256Hex(value: string): string {
  const input = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;

  const bitLength = input.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const state: number[] = [...SHA256_INITIAL_STATE];
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const low =
        rotateRight(schedule[index - 15], 7)
        ^ rotateRight(schedule[index - 15], 18)
        ^ (schedule[index - 15] >>> 3);
      const high =
        rotateRight(schedule[index - 2], 17)
        ^ rotateRight(schedule[index - 2], 19)
        ^ (schedule[index - 2] >>> 10);
      schedule[index] =
        (schedule[index - 16] + low + schedule[index - 7] + high) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sumOne = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporaryOne =
        (h + sumOne + choice + SHA256_ROUND_CONSTANTS[index] + schedule[index]) >>> 0;
      const sumZero = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporaryTwo = (sumZero + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temporaryOne) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporaryOne + temporaryTwo) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

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
  return sha256Hex(
    `${draft.intent}:${draft.channel}:${draft.recipient.toLowerCase()}:${draft.subject}:${draft.body}`,
  ).slice(0, 32);
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
