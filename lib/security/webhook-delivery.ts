import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const WEBHOOK_EVENTS = [
  "asset.uploaded",
  "asset.approved",
  "asset.changes_requested",
  "comment.created",
  "review.completed",
  "version.created",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

type AddressLookup = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

export interface WebhookDeliveryResult {
  responseCode: number;
  success: boolean;
  durationMs: number;
}

function ipv4Number(address: string) {
  return address
    .split(".")
    .reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function inIpv4Range(address: string, base: string, prefix: number) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
}

export function isPublicWebhookAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    return ![
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, prefix]) =>
      inIpv4Range(address, base as string, prefix as number),
    );
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      return isPublicWebhookAddress(normalized.slice(7));
    }
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:")
    );
  }
  return false;
}

export function normalizeWebhookEvents(value: unknown) {
  if (value === undefined) return { ok: true as const, events: [] as WebhookEvent[] };
  if (!Array.isArray(value) || value.length > WEBHOOK_EVENTS.length) {
    return { ok: false as const, error: "events must be a supported event list" };
  }
  const events = Array.from(new Set(value));
  if (
    events.some(
      (event) =>
        typeof event !== "string" ||
        !WEBHOOK_EVENTS.includes(event as WebhookEvent),
    )
  ) {
    return { ok: false as const, error: "events contains an unsupported event" };
  }
  return { ok: true as const, events: events as WebhookEvent[] };
}

export async function assertSafeWebhookUrl(
  value: string,
  addressLookup: AddressLookup = async (hostname) =>
    lookup(hostname, { all: true, verbatim: true }),
) {
  if (value.length > 2_048) throw new Error("Webhook URL is too long");
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Webhook URLs must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Webhook URLs cannot include credentials");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Webhook URLs must use the standard HTTPS port");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Webhook URL cannot target a local network");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await addressLookup(hostname);
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicWebhookAddress(address))
  ) {
    throw new Error("Webhook URL cannot target a private or reserved address");
  }
  return url.toString();
}

export function signWebhookPayload({
  secret,
  timestamp,
  body,
}: {
  secret: string;
  timestamp: string;
  body: string;
}) {
  return `v1=${createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex")}`;
}

export async function deliverSignedWebhook({
  url,
  secret,
  event,
  payload,
  fetchImpl = fetch,
  addressLookup,
  now = Date.now,
}: {
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  addressLookup?: AddressLookup;
  now?: () => number;
}): Promise<WebhookDeliveryResult> {
  const safeUrl = await assertSafeWebhookUrl(url, addressLookup);
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(now() / 1000));
  const signature = signWebhookPayload({ secret, timestamp, body });
  const startedAt = performance.now();
  const response = await fetchImpl(safeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Co-Production-Event": event,
      "X-Co-Production-Signature": signature,
      "X-Co-Production-Timestamp": timestamp,
      "X-CoDeliver-Event": event,
      "X-CoDeliver-Signature": signature,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  return {
    responseCode: response.status,
    success: response.status >= 200 && response.status < 300,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}
