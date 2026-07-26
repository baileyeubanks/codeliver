import crypto from "node:crypto";

import type {
  AuthorizedNotificationRequest,
  NotificationAdapter,
  NotificationAdapterResult,
} from "./authority";

export const IMESSAGE_RELAY_PROVIDER = "m2-imessage-relay-v1";
export const IMESSAGE_RELAY_REQUEST_PROTOCOL = "codeliver.imessage.send.v1";
export const IMESSAGE_RELAY_RECEIPT_PROTOCOL = "codeliver.imessage.receipt.v1";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/;
const RELAY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
const MAX_REQUEST_BYTES = 8_192;
const MAX_RECEIPT_BYTES = 16_384;
const MAX_CLOCK_SKEW_MS = 30_000;
const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 512;
const MIN_TIMEOUT_MS = 25;
const MAX_TIMEOUT_MS = 10_000;
const MIN_RECEIPT_AGE_MS = 1_000;
const MAX_RECEIPT_AGE_MS = 300_000;

export interface IMessageRelayConfig {
  enabled: boolean;
  endpoint: string | null;
  relayId: string | null;
  allowedOrigins: readonly string[];
  allowedHosts: readonly string[];
  requestKeyId: string | null;
  requestSigningSecret: string | null;
  receiptKeyId: string | null;
  receiptVerificationSecret: string | null;
  timeoutMs: number | null;
  maxReceiptAgeMs: number | null;
}

export interface IMessageRelayTransportRequest {
  url: string;
  method: "POST";
  redirect: "error";
  headers: Readonly<Record<string, string>>;
  body: string;
  signal: AbortSignal;
}

export interface IMessageRelayTransportResponse {
  status: number;
  url: string;
  headers: Readonly<Record<string, string | undefined>>;
  body: string;
}

export interface IMessageRelayTransport {
  send(request: IMessageRelayTransportRequest): Promise<IMessageRelayTransportResponse>;
}

export type IMessageRelayTransportDeliveryState = "not_sent" | "unknown";

/** Lets an injected transport state whether a failed attempt is safe to retry. */
export class IMessageRelayTransportError extends Error {
  readonly deliveryState: IMessageRelayTransportDeliveryState;

  constructor(deliveryState: IMessageRelayTransportDeliveryState) {
    super("iMessage relay transport failed");
    this.name = "IMessageRelayTransportError";
    this.deliveryState = deliveryState;
  }
}

export interface IMessageRelayRequestEnvelope {
  protocol: typeof IMESSAGE_RELAY_REQUEST_PROTOCOL;
  relay_id: string;
  request_id: string;
  request_nonce: string;
  idempotency_key: string;
  request_fingerprint: string;
  issued_at: string;
  expires_at: string;
  recipient: string;
  consent: {
    granted: true;
    source: string;
    recorded_at: string;
  };
  message: {
    title: string;
    body: string;
    action_url: string | null;
  };
}

interface IMessageRelayReceiptEnvelope {
  protocol: typeof IMESSAGE_RELAY_RECEIPT_PROTOCOL;
  relay_id: string;
  receipt_id: string;
  request_id: string;
  request_nonce: string;
  request_sha256: string;
  idempotency_key: string;
  recipient: string;
  status: "accepted" | "rejected";
  provider_message_id: string | null;
  occurred_at: string;
  error_code: string | null;
}

interface ResolvedIMessageRelayConfig {
  endpoint: string;
  relayId: string;
  requestKeyId: string;
  requestSigningSecret: string;
  receiptKeyId: string;
  receiptVerificationSecret: string;
  timeoutMs: number;
  maxReceiptAgeMs: number;
}

interface ValidatedSendInput {
  recipient: string;
  idempotencyKey: string;
  consent: NonNullable<AuthorizedNotificationRequest["consent"]["imessage"]>;
}

export type IMessageRelayRequestFingerprinter = (
  request: AuthorizedNotificationRequest,
) => string;

const RETRYABLE_REJECTIONS = new Map([
  ["relay_busy", "imessage_relay_busy"],
  ["relay_rate_limited", "imessage_relay_rate_limited"],
  ["relay_unavailable", "imessage_relay_unavailable"],
]);

const FINAL_REJECTIONS = new Map([
  ["consent_rejected", "imessage_consent_rejected"],
  ["idempotency_conflict", "imessage_idempotency_conflict"],
  ["invalid_request", "imessage_relay_request_rejected"],
  ["recipient_not_imessage", "imessage_recipient_not_imessage"],
  ["recipient_unreachable", "imessage_recipient_unreachable"],
  ["relay_policy_rejected", "imessage_relay_policy_rejected"],
]);

const TIMEOUT = Symbol("imessage-relay-timeout");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function parseInteger(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseCsv(value: string | undefined) {
  return value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function secretIsStrong(secret: unknown): secret is string {
  if (typeof secret !== "string" || !secret) return false;
  const bytes = Buffer.byteLength(secret, "utf8");
  return bytes >= MIN_SECRET_BYTES && bytes <= MAX_SECRET_BYTES;
}

function normalizeEndpoint(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    const endpoint = new URL(value);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    ) {
      return null;
    }
    return endpoint.toString();
  } catch {
    return null;
  }
}

function normalizeAllowedOrigin(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const origin = new URL(value);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    ) {
      return null;
    }
    return origin.origin;
  } catch {
    return null;
  }
}

function normalizeAllowedHost(value: unknown) {
  if (typeof value !== "string") return null;
  const host = value.trim().toLowerCase();
  if (!host || host.includes("*") || host.includes("/") || /\s/.test(host)) return null;
  return host;
}

function resolveConfig(config: IMessageRelayConfig): ResolvedIMessageRelayConfig | null {
  if (config.enabled !== true) return null;

  const endpoint = normalizeEndpoint(config.endpoint);
  const relayId = normalizedText(config.relayId, 80);
  const requestKeyId = normalizedText(config.requestKeyId, 80);
  const receiptKeyId = normalizedText(config.receiptKeyId, 80);
  const origins = Array.isArray(config.allowedOrigins)
    ? config.allowedOrigins.map(normalizeAllowedOrigin)
    : [];
  const hosts = Array.isArray(config.allowedHosts)
    ? config.allowedHosts.map(normalizeAllowedHost)
    : [];
  if (
    !endpoint ||
    !relayId ||
    !RELAY_ID_PATTERN.test(relayId) ||
    !requestKeyId ||
    !KEY_ID_PATTERN.test(requestKeyId) ||
    !receiptKeyId ||
    !KEY_ID_PATTERN.test(receiptKeyId) ||
    requestKeyId === receiptKeyId ||
    !secretIsStrong(config.requestSigningSecret) ||
    !secretIsStrong(config.receiptVerificationSecret) ||
    config.requestSigningSecret === config.receiptVerificationSecret ||
    !Number.isInteger(config.timeoutMs) ||
    (config.timeoutMs as number) < MIN_TIMEOUT_MS ||
    (config.timeoutMs as number) > MAX_TIMEOUT_MS ||
    !Number.isInteger(config.maxReceiptAgeMs) ||
    (config.maxReceiptAgeMs as number) < MIN_RECEIPT_AGE_MS ||
    (config.maxReceiptAgeMs as number) > MAX_RECEIPT_AGE_MS ||
    origins.length === 0 ||
    origins.some((origin) => origin === null) ||
    hosts.length === 0 ||
    hosts.some((host) => host === null)
  ) {
    return null;
  }

  const endpointUrl = new URL(endpoint);
  if (!origins.includes(endpointUrl.origin) || !hosts.includes(endpointUrl.hostname.toLowerCase())) {
    return null;
  }

  return {
    endpoint,
    relayId,
    requestKeyId,
    requestSigningSecret: config.requestSigningSecret,
    receiptKeyId,
    receiptVerificationSecret: config.receiptVerificationSecret,
    timeoutMs: config.timeoutMs as number,
    maxReceiptAgeMs: config.maxReceiptAgeMs as number,
  };
}

export function readIMessageRelayConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): IMessageRelayConfig {
  return {
    enabled: env.CODELIVER_IMESSAGE_RELAY_ENABLED === "true",
    endpoint: env.CODELIVER_IMESSAGE_RELAY_URL ?? null,
    relayId: env.CODELIVER_IMESSAGE_RELAY_ID ?? null,
    allowedOrigins: parseCsv(env.CODELIVER_IMESSAGE_RELAY_ALLOWED_ORIGINS),
    allowedHosts: parseCsv(env.CODELIVER_IMESSAGE_RELAY_ALLOWED_HOSTS),
    requestKeyId: env.CODELIVER_IMESSAGE_RELAY_REQUEST_KEY_ID ?? null,
    requestSigningSecret: env.CODELIVER_IMESSAGE_RELAY_REQUEST_SECRET ?? null,
    receiptKeyId: env.CODELIVER_IMESSAGE_RELAY_RECEIPT_KEY_ID ?? null,
    receiptVerificationSecret: env.CODELIVER_IMESSAGE_RELAY_RECEIPT_SECRET ?? null,
    timeoutMs: parseInteger(env.CODELIVER_IMESSAGE_RELAY_TIMEOUT_MS),
    maxReceiptAgeMs: parseInteger(env.CODELIVER_IMESSAGE_RELAY_MAX_RECEIPT_AGE_MS),
  };
}

export function normalizeIMessageHandle(value: unknown) {
  const handle = normalizedText(value, 254);
  if (!handle) return null;

  const email = handle.toLowerCase();
  if (EMAIL_PATTERN.test(email)) return email;

  const phone = handle.replace(/[\s().-]/g, "");
  return E164_PATTERN.test(phone) ? phone : null;
}

export function signIMessageRelayBody(rawBody: string, secret: string) {
  return `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

function verifyIMessageRelayBody(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const expected = Buffer.from(signIMessageRelayBody(rawBody, secret));
  const actual = Buffer.from(signature.trim());
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getSingleHeader(
  headers: Readonly<Record<string, string | undefined>>,
  requestedName: string,
) {
  const matching = Object.entries(headers).filter(
    ([name, value]) => name.toLowerCase() === requestedName && typeof value === "string",
  );
  return matching.length === 1 ? matching[0][1]?.trim() || null : null;
}

function isTransportResponse(value: unknown): value is IMessageRelayTransportResponse {
  if (!isRecord(value) || !Number.isInteger(value.status)) return false;
  if (typeof value.url !== "string" || typeof value.body !== "string" || !isRecord(value.headers)) {
    return false;
  }
  return Object.values(value.headers).every(
    (header) => typeof header === "string" || header === undefined,
  );
}

function isExactEndpoint(value: string, expected: string) {
  try {
    return new URL(value).toString() === expected;
  } catch {
    return false;
  }
}

function isJsonContentType(value: string | null) {
  return Boolean(value && /^application\/json(?:\s*;|$)/i.test(value));
}

function validateSendInput(
  request: AuthorizedNotificationRequest,
  address: string,
  idempotencyKey: string,
  now: Date,
): ValidatedSendInput | NotificationAdapterResult {
  if (
    request.action !== "send" ||
    request.confirmedLiveSend !== true ||
    !request.channels.includes("imessage")
  ) {
    return { status: "failed", retryable: false, errorCode: "imessage_send_not_authorized" };
  }

  const title = normalizedText(request.message.title, 160);
  const actionUrl =
    request.message.actionUrl === null
      ? null
      : normalizedText(request.message.actionUrl, 2_048);
  if (
    !title ||
    title !== request.message.title ||
    typeof request.message.body !== "string" ||
    request.message.body.length > 4_000 ||
    (request.message.actionUrl !== null && actionUrl !== request.message.actionUrl)
  ) {
    return { status: "failed", retryable: false, errorCode: "imessage_relay_request_invalid" };
  }

  const recipient = normalizeIMessageHandle(address);
  const requestRecipient = normalizeIMessageHandle(request.recipient.imessageHandle);
  if (!recipient || !requestRecipient) {
    return { status: "failed", retryable: false, errorCode: "imessage_recipient_invalid" };
  }
  if (recipient !== requestRecipient) {
    return { status: "failed", retryable: false, errorCode: "imessage_recipient_mismatch" };
  }

  const consent = request.consent.imessage;
  const consentSource = normalizedText(consent?.source, 120);
  const consentRecordedAt = consent ? new Date(consent.recordedAt) : null;
  if (
    !consent ||
    consent.granted !== true ||
    !consentSource ||
    consentSource !== consent.source ||
    !consentRecordedAt ||
    Number.isNaN(consentRecordedAt.getTime()) ||
    consentRecordedAt.toISOString() !== consent.recordedAt ||
    consentRecordedAt.getTime() > now.getTime() + 60_000
  ) {
    return { status: "failed", retryable: false, errorCode: "imessage_consent_missing" };
  }

  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey) || !request.idempotencyKey) {
    return { status: "failed", retryable: false, errorCode: "imessage_idempotency_invalid" };
  }
  if (idempotencyKey !== request.idempotencyKey) {
    return { status: "failed", retryable: false, errorCode: "imessage_idempotency_mismatch" };
  }

  return {
    recipient,
    idempotencyKey,
    consent: {
      granted: true,
      source: consentSource,
      recordedAt: consentRecordedAt.toISOString(),
    },
  };
}

function parseReceipt(rawBody: string): IMessageRelayReceiptEnvelope | null {
  if (Buffer.byteLength(rawBody, "utf8") > MAX_RECEIPT_BYTES) return null;
  try {
    const input: unknown = JSON.parse(rawBody);
    if (!isRecord(input)) return null;
    if (
      input.protocol !== IMESSAGE_RELAY_RECEIPT_PROTOCOL ||
      typeof input.relay_id !== "string" ||
      typeof input.receipt_id !== "string" ||
      !ID_PATTERN.test(input.receipt_id) ||
      typeof input.request_id !== "string" ||
      !ID_PATTERN.test(input.request_id) ||
      typeof input.request_nonce !== "string" ||
      !NONCE_PATTERN.test(input.request_nonce) ||
      typeof input.request_sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(input.request_sha256) ||
      typeof input.idempotency_key !== "string" ||
      !IDEMPOTENCY_PATTERN.test(input.idempotency_key) ||
      typeof input.recipient !== "string" ||
      (input.status !== "accepted" && input.status !== "rejected") ||
      (input.provider_message_id !== null && typeof input.provider_message_id !== "string") ||
      typeof input.occurred_at !== "string" ||
      (input.error_code !== null && typeof input.error_code !== "string")
    ) {
      return null;
    }
    return input as unknown as IMessageRelayReceiptEnvelope;
  } catch {
    return null;
  }
}

function classifyReceipt({
  response,
  receipt,
  config,
  request,
  rawRequestBody,
  recipient,
  startedAt,
  completedAt,
}: {
  response: IMessageRelayTransportResponse;
  receipt: IMessageRelayReceiptEnvelope;
  config: ResolvedIMessageRelayConfig;
  request: IMessageRelayRequestEnvelope;
  rawRequestBody: string;
  recipient: string;
  startedAt: Date;
  completedAt: Date;
}): NotificationAdapterResult {
  if (receipt.request_nonce !== request.request_nonce) {
    return { status: "failed", retryable: false, errorCode: "imessage_relay_receipt_replayed" };
  }
  if (
    receipt.relay_id !== config.relayId ||
    receipt.request_id !== request.request_id ||
    receipt.request_sha256 !== sha256(rawRequestBody) ||
    receipt.idempotency_key !== request.idempotency_key
  ) {
    return { status: "failed", retryable: false, errorCode: "imessage_relay_receipt_mismatch" };
  }

  const receiptRecipient = normalizeIMessageHandle(receipt.recipient);
  if (!receiptRecipient || receiptRecipient !== recipient) {
    return { status: "failed", retryable: false, errorCode: "imessage_relay_recipient_mismatch" };
  }

  const occurredAt = new Date(receipt.occurred_at);
  if (
    Number.isNaN(occurredAt.getTime()) ||
    occurredAt.getTime() < startedAt.getTime() - MAX_CLOCK_SKEW_MS ||
    occurredAt.getTime() > completedAt.getTime() + MAX_CLOCK_SKEW_MS ||
    completedAt.getTime() - occurredAt.getTime() > config.maxReceiptAgeMs
  ) {
    return { status: "failed", retryable: false, errorCode: "imessage_relay_receipt_replayed" };
  }

  if (receipt.status === "accepted") {
    if (
      (response.status !== 200 && response.status !== 202) ||
      !receipt.provider_message_id ||
      !ID_PATTERN.test(receipt.provider_message_id) ||
      receipt.error_code !== null
    ) {
      return { status: "failed", retryable: false, errorCode: "imessage_relay_receipt_invalid" };
    }
    return {
      status: "sent",
      providerMessageId: receipt.provider_message_id,
      retryable: false,
    };
  }

  if (
    response.status < 400 ||
    response.status > 599 ||
    receipt.provider_message_id !== null ||
    !receipt.error_code
  ) {
    return { status: "failed", retryable: false, errorCode: "imessage_relay_receipt_invalid" };
  }

  const retryableCode = RETRYABLE_REJECTIONS.get(receipt.error_code);
  if (retryableCode) return { status: "failed", retryable: true, errorCode: retryableCode };

  return {
    status: "failed",
    retryable: false,
    errorCode: FINAL_REJECTIONS.get(receipt.error_code) ?? "imessage_relay_rejected",
  };
}

async function invokeTransport(
  transport: IMessageRelayTransport,
  request: Omit<IMessageRelayTransportRequest, "signal">,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const transportRequest: IMessageRelayTransportRequest = { ...request, signal: controller.signal };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(TIMEOUT);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => transport.send(transportRequest)),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createIMessageRelayAdapter({
  config,
  transport,
  fingerprintRequest,
  now = () => new Date(),
  createNonce = () => crypto.randomBytes(24).toString("base64url"),
}: {
  config: IMessageRelayConfig;
  transport?: IMessageRelayTransport;
  fingerprintRequest?: IMessageRelayRequestFingerprinter;
  now?: () => Date;
  createNonce?: () => string;
}): NotificationAdapter {
  const resolvedConfig = resolveConfig(config);
  const configured =
    typeof window === "undefined" &&
    Boolean(resolvedConfig) &&
    typeof transport?.send === "function" &&
    typeof fingerprintRequest === "function";

  return {
    channel: "imessage",
    provider: IMESSAGE_RELAY_PROVIDER,
    configured,
    async send({ request, address, idempotencyKey }) {
      if (!configured || !resolvedConfig || !transport || !fingerprintRequest) {
        return { status: "failed", retryable: false, errorCode: "provider_not_configured" };
      }

      const startedAt = now();
      if (Number.isNaN(startedAt.getTime())) {
        return { status: "failed", retryable: false, errorCode: "imessage_relay_request_invalid" };
      }
      const validated = validateSendInput(request, address, idempotencyKey, startedAt);
      if ("status" in validated) return validated;

      let requestFingerprint: string;
      try {
        requestFingerprint = fingerprintRequest(request);
      } catch {
        return { status: "failed", retryable: false, errorCode: "imessage_relay_request_invalid" };
      }
      if (!/^[a-f0-9]{64}$/.test(requestFingerprint)) {
        return { status: "failed", retryable: false, errorCode: "imessage_relay_request_invalid" };
      }

      let requestNonce: string;
      try {
        requestNonce = createNonce();
      } catch {
        return { status: "failed", retryable: false, errorCode: "imessage_relay_request_invalid" };
      }
      if (!NONCE_PATTERN.test(requestNonce)) {
        return { status: "failed", retryable: false, errorCode: "imessage_relay_request_invalid" };
      }

      const requestId = `imr-${sha256(
        `${request.tenantId}\0${validated.idempotencyKey}\0${requestFingerprint}`,
      ).slice(0, 48)}`;
      const envelope: IMessageRelayRequestEnvelope = {
        protocol: IMESSAGE_RELAY_REQUEST_PROTOCOL,
        relay_id: resolvedConfig.relayId,
        request_id: requestId,
        request_nonce: requestNonce,
        idempotency_key: validated.idempotencyKey,
        request_fingerprint: requestFingerprint,
        issued_at: startedAt.toISOString(),
        expires_at: new Date(startedAt.getTime() + resolvedConfig.timeoutMs).toISOString(),
        recipient: validated.recipient,
        consent: {
          granted: true,
          source: validated.consent.source,
          recorded_at: validated.consent.recordedAt,
        },
        message: {
          title: request.message.title,
          body: request.message.body,
          action_url: request.message.actionUrl,
        },
      };
      const rawBody = JSON.stringify(envelope);
      if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
        return { status: "failed", retryable: false, errorCode: "imessage_relay_request_invalid" };
      }

      let response: IMessageRelayTransportResponse;
      try {
        response = await invokeTransport(
          transport,
          {
            url: resolvedConfig.endpoint,
            method: "POST",
            redirect: "error",
            headers: {
              "content-type": "application/json",
              "x-codeliver-relay-key-id": resolvedConfig.requestKeyId,
              "x-codeliver-relay-protocol": IMESSAGE_RELAY_REQUEST_PROTOCOL,
              "x-codeliver-relay-request-id": requestId,
              "x-codeliver-relay-signature": signIMessageRelayBody(
                rawBody,
                resolvedConfig.requestSigningSecret,
              ),
            },
            body: rawBody,
          },
          resolvedConfig.timeoutMs,
        );
      } catch (error) {
        if (error === TIMEOUT) {
          return { status: "failed", retryable: false, errorCode: "imessage_relay_timeout" };
        }
        if (error instanceof IMessageRelayTransportError && error.deliveryState === "not_sent") {
          return {
            status: "failed",
            retryable: true,
            errorCode: "imessage_relay_transport_unavailable",
          };
        }
        return {
          status: "failed",
          retryable: false,
          errorCode: "imessage_relay_delivery_indeterminate",
        };
      }

      if (
        !isTransportResponse(response) ||
        response.status < 100 ||
        response.status > 599 ||
        Buffer.byteLength(response.body, "utf8") > MAX_RECEIPT_BYTES
      ) {
        return { status: "failed", retryable: false, errorCode: "imessage_relay_receipt_invalid" };
      }

      const contentType = getSingleHeader(response.headers, "content-type");
      const receiptKeyId = getSingleHeader(
        response.headers,
        "x-codeliver-relay-receipt-key-id",
      );
      const receiptSignature = getSingleHeader(
        response.headers,
        "x-codeliver-relay-receipt-signature",
      );
      if (
        !isExactEndpoint(response.url, resolvedConfig.endpoint) ||
        !isJsonContentType(contentType) ||
        receiptKeyId !== resolvedConfig.receiptKeyId ||
        !verifyIMessageRelayBody(
          response.body,
          receiptSignature,
          resolvedConfig.receiptVerificationSecret,
        )
      ) {
        return {
          status: "failed",
          retryable: false,
          errorCode: "imessage_relay_receipt_untrusted",
        };
      }

      const receipt = parseReceipt(response.body);
      if (!receipt) {
        return { status: "failed", retryable: false, errorCode: "imessage_relay_receipt_invalid" };
      }

      const completedAt = now();
      if (Number.isNaN(completedAt.getTime())) {
        return { status: "failed", retryable: false, errorCode: "imessage_relay_receipt_invalid" };
      }

      return classifyReceipt({
        response,
        receipt,
        config: resolvedConfig,
        request: envelope,
        rawRequestBody: rawBody,
        recipient: validated.recipient,
        startedAt,
        completedAt,
      });
    },
  };
}
