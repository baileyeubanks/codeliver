import crypto from "crypto";

export type ProviderEventChannel = "email" | "sms" | "imessage";
export type ProviderEventType = "delivered" | "deferred" | "failed" | "bounced" | "complained";

export interface ProviderDeliveryEvent {
  eventId: string;
  provider: string;
  channel: ProviderEventChannel;
  type: ProviderEventType;
  recipient: string;
  providerMessageId: string | null;
  occurredAt: string;
  reasonCode: string | null;
}

export type ProviderEventParseResult =
  | { ok: true; value: ProviderDeliveryEvent }
  | { ok: false; error: string };

const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedString(value: unknown, maxLength: number) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function normalizeRecipient(channel: ProviderEventChannel, value: unknown) {
  const recipient = normalizedString(value, 254);
  if (!recipient) return undefined;
  if (channel === "email") {
    const email = recipient.toLowerCase();
    return EMAIL_PATTERN.test(email) ? email : undefined;
  }
  if (channel === "sms") {
    const phone = recipient.replace(/[\s().-]/g, "");
    return E164_PATTERN.test(phone) ? phone : undefined;
  }
  const email = recipient.toLowerCase();
  if (EMAIL_PATTERN.test(email)) return email;
  const phone = recipient.replace(/[\s().-]/g, "");
  return E164_PATTERN.test(phone) ? phone : undefined;
}

export function parseProviderDeliveryEvent(input: unknown): ProviderEventParseResult {
  if (!isRecord(input)) return { ok: false, error: "A provider event object is required" };

  const eventId = normalizedString(input.event_id, 128);
  const provider = normalizedString(input.provider, 80);
  const providerMessageId = normalizedString(input.provider_message_id, 256);
  const reasonCode = normalizedString(input.reason_code, 120);
  if (!eventId || !EVENT_ID_PATTERN.test(eventId)) {
    return { ok: false, error: "event_id is invalid" };
  }
  if (!provider) return { ok: false, error: "provider is required" };
  if (!providerMessageId) return { ok: false, error: "provider_message_id is required" };
  if (reasonCode === undefined) return { ok: false, error: "reason_code is invalid" };

  const channel = input.channel;
  if (channel !== "email" && channel !== "sms" && channel !== "imessage") {
    return { ok: false, error: "channel is invalid" };
  }
  const type = input.type;
  if (
    type !== "delivered" &&
    type !== "deferred" &&
    type !== "failed" &&
    type !== "bounced" &&
    type !== "complained"
  ) {
    return { ok: false, error: "type is invalid" };
  }

  const recipient = normalizeRecipient(channel, input.recipient);
  if (!recipient) return { ok: false, error: "recipient is invalid for channel" };
  const occurredAtInput = normalizedString(input.occurred_at, 64);
  if (!occurredAtInput) return { ok: false, error: "occurred_at is required" };
  const occurredAt = new Date(occurredAtInput);
  if (Number.isNaN(occurredAt.getTime())) return { ok: false, error: "occurred_at is invalid" };

  return {
    ok: true,
    value: {
      eventId,
      provider,
      channel,
      type,
      recipient,
      providerMessageId,
      occurredAt: occurredAt.toISOString(),
      reasonCode,
    },
  };
}

export function providerReceiptMatchesEvent(receipts: unknown, event: ProviderDeliveryEvent) {
  if (!Array.isArray(receipts) || !event.providerMessageId) return false;
  return receipts.some((receipt) => {
    if (!isRecord(receipt)) return false;
    return (
      receipt.channel === event.channel &&
      receipt.status === "sent" &&
      receipt.provider === event.provider &&
      receipt.providerMessageId === event.providerMessageId
    );
  });
}

export function signProviderEvent(rawBody: string, secret: string) {
  return `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifyProviderEventSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const expected = Buffer.from(signProviderEvent(rawBody, secret));
  const actual = Buffer.from(signature.trim());
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function providerEventSuppressesRecipient(type: ProviderEventType) {
  return type === "bounced" || type === "complained";
}
