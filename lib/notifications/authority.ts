import crypto from "crypto";

export const NOTIFICATION_CHANNELS = ["in_app", "email", "sms", "imessage"] as const;
export const NOTIFICATION_MAX_CHANNELS = NOTIFICATION_CHANNELS.length;
export const NOTIFICATION_MAX_BODY_LENGTH = 4_000;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationAction = "preview" | "send";
export type NotificationPurpose = "transactional" | "operational" | "security";

export interface ConsentEvidence {
  granted: true;
  source: string;
  recordedAt: string;
}

export interface NotificationRecipient {
  userId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  imessageHandle: string | null;
}

export interface NotificationMessage {
  title: string;
  body: string;
  actionUrl: string | null;
}

export interface AuthorizedNotificationRequest {
  action: NotificationAction;
  tenantId: string;
  eventType: string;
  purpose: NotificationPurpose;
  channels: NotificationChannel[];
  recipient: NotificationRecipient;
  message: NotificationMessage;
  consent: Partial<Record<"sms" | "imessage", ConsentEvidence>>;
  idempotencyKey: string | null;
  confirmedLiveSend: boolean;
}

export type NotificationParseResult =
  | { ok: true; value: AuthorizedNotificationRequest }
  | { ok: false; error: string; field?: string };

export type NotificationDeliveryStatus =
  | "preview_only"
  | "sent"
  | "not_configured"
  | "preference_disabled"
  | "suppressed"
  | "failed";

export interface NotificationAdapterResult {
  status: "sent" | "failed";
  providerMessageId?: string | null;
  retryable?: boolean;
  errorCode?: string;
}

export interface NotificationAdapter {
  channel: NotificationChannel;
  provider: string;
  configured: boolean;
  send: (input: {
    request: AuthorizedNotificationRequest;
    address: string;
    idempotencyKey: string;
  }) => Promise<NotificationAdapterResult>;
}

export interface NotificationChannelReceipt {
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  provider: string | null;
  providerMessageId: string | null;
  attemptedProviders: string[];
  errorCode: string | null;
}

/** Binds a live-send idempotency key to one normalized recipient, message, and channel set. */
export function fingerprintNotificationRequest(request: AuthorizedNotificationRequest) {
  const consent = Object.fromEntries(
    Object.entries(request.consent)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([channel, evidence]) => [
        channel,
        evidence
          ? {
              granted: evidence.granted,
              source: evidence.source,
              recorded_at: evidence.recordedAt,
            }
          : null,
      ]),
  );

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        tenant_id: request.tenantId,
        event_type: request.eventType,
        purpose: request.purpose,
        channels: [...request.channels].sort(),
        recipient: request.recipient,
        message: request.message,
        consent,
      }),
    )
    .digest("hex");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_.-]{2,79}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(error: string, field?: string): NotificationParseResult {
  return { ok: false, error, field };
}

function normalizeString(value: unknown, maxLength: number, required = false) {
  if (value == null) return required ? undefined : null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return required ? undefined : null;
  if (normalized.length > maxLength) return undefined;
  return normalized;
}

function normalizeEmail(value: unknown) {
  const email = normalizeString(value, 254);
  if (email === undefined || email === null) return email;
  const normalized = email.toLowerCase();
  return EMAIL_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizePhone(value: unknown) {
  const phone = normalizeString(value, 32);
  if (phone === undefined || phone === null) return phone;
  const normalized = phone.replace(/[\s().-]/g, "");
  return E164_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizeImessageHandle(value: unknown) {
  const handle = normalizeString(value, 254);
  if (handle === undefined || handle === null) return handle;
  const email = normalizeEmail(handle);
  if (email) return email;
  const phone = normalizePhone(handle);
  return phone || undefined;
}

function parseConsent(
  input: unknown,
  channel: "sms" | "imessage",
  now: Date,
): { ok: true; value: ConsentEvidence } | { ok: false; error: string } {
  if (!isRecord(input) || input.granted !== true) {
    return { ok: false, error: `${channel} live sends require explicit recorded consent` };
  }
  const source = normalizeString(input.source, 120, true);
  const recordedAt = normalizeString(input.recorded_at, 64, true);
  if (!source || !recordedAt) {
    return { ok: false, error: `${channel} consent requires source and recorded_at` };
  }
  const recorded = new Date(recordedAt);
  if (Number.isNaN(recorded.getTime()) || recorded.getTime() > now.getTime() + 60_000) {
    return { ok: false, error: `${channel} consent recorded_at is invalid` };
  }
  return { ok: true, value: { granted: true, source, recordedAt: recorded.toISOString() } };
}

function normalizeActionUrl(value: unknown, allowedOrigin?: string) {
  const requested = normalizeString(value, 2_048);
  if (requested === undefined || requested === null) return requested;
  if (requested.startsWith("/") && !requested.startsWith("//")) return requested;

  try {
    const url = new URL(requested);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (allowedOrigin && url.origin !== new URL(allowedOrigin).origin) return undefined;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeChannel(value: unknown): NotificationChannel | null {
  return value === "in_app" || value === "email" || value === "sms" || value === "imessage"
    ? value
    : null;
}

export function parseNotificationRequest(
  input: unknown,
  context: {
    authenticatedTenantId: string;
    allowedOrigin?: string;
    now?: Date;
    forcePreview?: boolean;
  },
): NotificationParseResult {
  if (!isRecord(input)) return fail("A notification object is required");
  const now = context.now ?? new Date();

  const requestedAction = context.forcePreview ? "preview" : input.action;
  if (requestedAction !== "preview" && requestedAction !== "send") {
    return fail("notification action must be preview or send", "action");
  }

  const requestedTenant = normalizeString(input.tenant_id, 128);
  if (requestedTenant === undefined) return fail("tenant_id is invalid", "tenant_id");
  if (requestedTenant && requestedTenant !== context.authenticatedTenantId) {
    return fail("Notification tenant does not match the authenticated tenant", "tenant_id");
  }

  const eventType = normalizeString(input.event_type, 80, true);
  if (!eventType || !EVENT_TYPE_PATTERN.test(eventType)) {
    return fail("event_type is invalid", "event_type");
  }

  const purpose = input.purpose ?? "transactional";
  if (purpose !== "transactional" && purpose !== "operational" && purpose !== "security") {
    return fail("Marketing or unspecified notification purposes are not supported", "purpose");
  }

  if (!Array.isArray(input.channels) || input.channels.length === 0) {
    return fail("At least one notification channel is required", "channels");
  }
  if (input.channels.length > NOTIFICATION_MAX_CHANNELS) {
    return fail(`At most ${NOTIFICATION_MAX_CHANNELS} channels are allowed`, "channels");
  }
  const channels: NotificationChannel[] = [];
  for (const requested of input.channels) {
    const channel = normalizeChannel(requested);
    if (!channel) return fail("Notification channel is invalid", "channels");
    if (channels.includes(channel)) return fail("Notification channels must be unique", "channels");
    channels.push(channel);
  }

  const recipientInput = isRecord(input.recipient) ? input.recipient : {};
  const userId = normalizeString(recipientInput.user_id, 128);
  const name = normalizeString(recipientInput.name, 120);
  const email = normalizeEmail(recipientInput.email);
  const phone = normalizePhone(recipientInput.phone);
  const imessageHandle = normalizeImessageHandle(recipientInput.imessage_handle);
  if (userId === undefined) return fail("recipient.user_id is invalid", "recipient.user_id");
  if (name === undefined) return fail("recipient.name is invalid", "recipient.name");
  if (email === undefined) return fail("recipient.email is invalid", "recipient.email");
  if (phone === undefined) return fail("recipient.phone must use E.164 format", "recipient.phone");
  if (imessageHandle === undefined) {
    return fail(
      "recipient.imessage_handle must be an email or E.164 phone number",
      "recipient.imessage_handle",
    );
  }

  const recipient: NotificationRecipient = { userId, name, email, phone, imessageHandle };
  for (const channel of channels) {
    if (!notificationAddress(recipient, channel)) {
      return fail(`${channel} requires a matching recipient address`, `recipient.${channel}`);
    }
  }

  const messageInput = isRecord(input.message) ? input.message : {};
  const title = normalizeString(messageInput.title, 160, true);
  const body = normalizeString(messageInput.body, NOTIFICATION_MAX_BODY_LENGTH) ?? "";
  const actionUrl = normalizeActionUrl(messageInput.action_url, context.allowedOrigin);
  if (!title) return fail("message.title is required and must be 160 characters or fewer", "message.title");
  if (body === undefined) return fail(`message.body exceeds ${NOTIFICATION_MAX_BODY_LENGTH} characters`, "message.body");
  if (actionUrl === undefined) return fail("message.action_url must be a safe same-origin HTTP URL", "message.action_url");

  const consentInput = isRecord(input.consent) ? input.consent : {};
  const consent: Partial<Record<"sms" | "imessage", ConsentEvidence>> = {};
  if (requestedAction === "send") {
    for (const channel of channels) {
      if (channel !== "sms" && channel !== "imessage") continue;
      const parsed = parseConsent(consentInput[channel], channel, now);
      if (!parsed.ok) return fail(parsed.error, `consent.${channel}`);
      consent[channel] = parsed.value;
    }
  }

  const idempotencyKey = normalizeString(input.idempotency_key, 128);
  if (idempotencyKey === undefined) return fail("idempotency_key is invalid", "idempotency_key");
  const confirmedLiveSend = requestedAction === "send" && input.confirm_live_send === true;
  if (requestedAction === "send") {
    if (!confirmedLiveSend) {
      return fail("Live sends require confirm_live_send=true", "confirm_live_send");
    }
    if (!idempotencyKey || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      return fail(
        "Live sends require a 16-128 character idempotency_key",
        "idempotency_key",
      );
    }
  }

  return {
    ok: true,
    value: {
      action: requestedAction,
      tenantId: context.authenticatedTenantId,
      eventType,
      purpose,
      channels,
      recipient,
      message: { title, body, actionUrl },
      consent,
      idempotencyKey: requestedAction === "send" ? idempotencyKey || null : null,
      confirmedLiveSend,
    },
  };
}

export function notificationAddress(
  recipient: NotificationRecipient,
  channel: NotificationChannel,
) {
  if (channel === "in_app") return recipient.userId;
  if (channel === "email") return recipient.email;
  if (channel === "sms") return recipient.phone;
  return recipient.imessageHandle;
}

export function maskNotificationAddress(value: string | null, channel: NotificationChannel) {
  if (!value) return null;
  if (channel === "email" || (channel === "imessage" && value.includes("@"))) {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 1)}***@${domain}`;
  }
  if (channel === "sms" || channel === "imessage") {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function buildNotificationPreview(
  request: AuthorizedNotificationRequest,
  adapters: NotificationAdapter[],
) {
  return {
    action: "preview" as const,
    event_type: request.eventType,
    purpose: request.purpose,
    message: request.message,
    channels: request.channels.map((channel) => ({
      channel,
      recipient: maskNotificationAddress(notificationAddress(request.recipient, channel), channel),
      configured_providers: adapters
        .filter((adapter) => adapter.channel === channel && adapter.configured)
        .map((adapter) => adapter.provider),
      live_send_authorized: false,
    })),
  };
}

export async function dispatchNotificationChannels({
  request,
  adapters,
  preferenceEnabled = {},
  suppressedAddresses = new Set<string>(),
}: {
  request: AuthorizedNotificationRequest;
  adapters: NotificationAdapter[];
  preferenceEnabled?: Partial<Record<NotificationChannel, boolean>>;
  suppressedAddresses?: Set<string>;
}): Promise<NotificationChannelReceipt[]> {
  const receipts: NotificationChannelReceipt[] = [];

  for (const channel of request.channels) {
    const address = notificationAddress(request.recipient, channel);
    if (!address) continue;

    if (request.action !== "send") {
      receipts.push({
        channel,
        status: "preview_only",
        provider: null,
        providerMessageId: null,
        attemptedProviders: [],
        errorCode: null,
      });
      continue;
    }

    if (preferenceEnabled[channel] === false) {
      receipts.push({
        channel,
        status: "preference_disabled",
        provider: null,
        providerMessageId: null,
        attemptedProviders: [],
        errorCode: "preference_disabled",
      });
      continue;
    }

    if (suppressedAddresses.has(address)) {
      receipts.push({
        channel,
        status: "suppressed",
        provider: null,
        providerMessageId: null,
        attemptedProviders: [],
        errorCode: "recipient_suppressed",
      });
      continue;
    }

    const candidates = adapters.filter((adapter) => adapter.channel === channel && adapter.configured);
    if (candidates.length === 0) {
      receipts.push({
        channel,
        status: "not_configured",
        provider: null,
        providerMessageId: null,
        attemptedProviders: [],
        errorCode: "provider_not_configured",
      });
      continue;
    }

    const attemptedProviders: string[] = [];
    let finalResult: NotificationAdapterResult | null = null;
    let finalProvider: string | null = null;
    for (const adapter of candidates.slice(0, 3)) {
      attemptedProviders.push(adapter.provider);
      finalProvider = adapter.provider;
      try {
        finalResult = await adapter.send({
          request,
          address,
          idempotencyKey: request.idempotencyKey as string,
        });
      } catch {
        finalResult = { status: "failed", retryable: true, errorCode: "provider_exception" };
      }

      if (finalResult.status === "sent" || finalResult.retryable !== true) break;
    }

    receipts.push({
      channel,
      status: finalResult?.status === "sent" ? "sent" : "failed",
      provider: finalProvider,
      providerMessageId: finalResult?.providerMessageId ?? null,
      attemptedProviders,
      errorCode: finalResult?.errorCode ?? (finalResult ? "provider_failed" : "provider_unavailable"),
    });
  }

  return receipts;
}

export function evaluateFixedWindowRateLimit({
  attemptsInWindow,
  requestedAttempts,
  limit,
}: {
  attemptsInWindow: number;
  requestedAttempts: number;
  limit: number;
}) {
  const remaining = Math.max(0, limit - attemptsInWindow);
  return {
    allowed: requestedAttempts > 0 && requestedAttempts <= remaining,
    remaining,
    limit,
  };
}
