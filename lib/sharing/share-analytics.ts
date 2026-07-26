import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { CO_PRODUCTION_DATA_SCHEMA, getSupabaseDataSchema } from "@/lib/data-authority";

export const SHARE_ANALYTICS_EVENTS = [
  "view_started",
  "play",
  "pause",
  "seek",
  "comment_submitted",
  "approval_submitted",
  "download_started",
  "view_completed",
] as const;

export type ShareAnalyticsEvent = (typeof SHARE_ANALYTICS_EVENTS)[number];

const SURFACES = ["review", "approval", "preview"] as const;
const DEVICES = ["desktop", "mobile", "tablet", "unknown"] as const;
const ACTION_KEYS = new Set([
  "event",
  "position_seconds",
  "completion_percent",
  "session_id",
  "surface",
  "device",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{16,256}$/;

export interface ShareAnalyticsActions {
  event: ShareAnalyticsEvent;
  position_seconds?: number;
  completion_percent?: number;
  session_id?: string;
  surface?: (typeof SURFACES)[number];
  device?: (typeof DEVICES)[number];
}

export interface ShareAnalyticsInput {
  inviteId: string;
  clientRequestId: string;
  durationSeconds: number;
  actions: ShareAnalyticsActions;
}

type NormalizeResult =
  | { ok: true; value: ShareAnalyticsInput }
  | { ok: false; error: string };

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteRange(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum &&
    (!integer || Number.isInteger(value))
  );
}

export function normalizeShareAnalyticsInput(value: unknown): NormalizeResult {
  if (!plainObject(value)) {
    return { ok: false, error: "Analytics payload must be an object" };
  }

  const inviteId = value.invite_id;
  const clientRequestId = value.client_request_id;
  if (typeof inviteId !== "string" || !UUID_PATTERN.test(inviteId)) {
    return { ok: false, error: "invite_id must be a UUID" };
  }
  if (
    typeof clientRequestId !== "string" ||
    !UUID_PATTERN.test(clientRequestId)
  ) {
    return { ok: false, error: "client_request_id must be a UUID" };
  }

  const durationSeconds = value.duration_seconds ?? 0;
  if (!finiteRange(durationSeconds, 0, 604_800, true)) {
    return {
      ok: false,
      error: "duration_seconds must be a whole number between 0 and 604800",
    };
  }

  const actionsValue = value.actions;
  if (!plainObject(actionsValue)) {
    return { ok: false, error: "actions must be an object" };
  }
  if (Object.keys(actionsValue).some((key) => !ACTION_KEYS.has(key))) {
    return { ok: false, error: "actions contains an unsupported field" };
  }
  if (
    typeof actionsValue.event !== "string" ||
    !SHARE_ANALYTICS_EVENTS.includes(
      actionsValue.event as ShareAnalyticsEvent,
    )
  ) {
    return { ok: false, error: "actions.event is not supported" };
  }

  const actions: ShareAnalyticsActions = {
    event: actionsValue.event as ShareAnalyticsEvent,
  };
  if (actionsValue.position_seconds !== undefined) {
    if (!finiteRange(actionsValue.position_seconds, 0, 604_800)) {
      return { ok: false, error: "actions.position_seconds is invalid" };
    }
    actions.position_seconds = actionsValue.position_seconds as number;
  }
  if (actionsValue.completion_percent !== undefined) {
    if (!finiteRange(actionsValue.completion_percent, 0, 100)) {
      return { ok: false, error: "actions.completion_percent is invalid" };
    }
    actions.completion_percent = actionsValue.completion_percent as number;
  }
  if (actionsValue.session_id !== undefined) {
    if (
      typeof actionsValue.session_id !== "string" ||
      !/^[A-Za-z0-9._~-]{8,128}$/.test(actionsValue.session_id)
    ) {
      return { ok: false, error: "actions.session_id is invalid" };
    }
    actions.session_id = actionsValue.session_id;
  }
  if (actionsValue.surface !== undefined) {
    if (!SURFACES.includes(actionsValue.surface as (typeof SURFACES)[number])) {
      return { ok: false, error: "actions.surface is invalid" };
    }
    actions.surface = actionsValue.surface as (typeof SURFACES)[number];
  }
  if (actionsValue.device !== undefined) {
    if (!DEVICES.includes(actionsValue.device as (typeof DEVICES)[number])) {
      return { ok: false, error: "actions.device is invalid" };
    }
    actions.device = actionsValue.device as (typeof DEVICES)[number];
  }

  return {
    ok: true,
    value: {
      inviteId,
      clientRequestId,
      durationSeconds: durationSeconds as number,
      actions,
    },
  };
}

export function extractReviewAnalyticsToken(
  request: Request,
  body: Record<string, unknown>,
) {
  const explicit = request.headers.get("x-co-production-review-token")?.trim();
  const authorization = request.headers.get("authorization")?.trim();
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const bodyToken =
    typeof body.review_token === "string" ? body.review_token.trim() : undefined;
  const values = [explicit, bearer, bodyToken].filter(
    (token): token is string => Boolean(token),
  );
  if (new Set(values).size > 1) {
    return { ok: false as const, error: "Conflicting review authorization" };
  }
  const token = values[0];
  if (!token || !TOKEN_PATTERN.test(token)) {
    return { ok: false as const, error: "Review authorization is required" };
  }
  return { ok: true as const, token };
}

export function extractClientAddress(request: Request) {
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0],
    request.headers.get("x-real-ip"),
  ];
  for (const candidate of candidates) {
    const address = candidate?.trim();
    if (address && isIP(address)) return address;
  }
  return null;
}

function analyticsHashKey(
  value = process.env.CO_PRODUCTION_ANALYTICS_HASH_KEY,
) {
  const normalized = value?.trim();
  if (!normalized) {
    if (getSupabaseDataSchema() !== CO_PRODUCTION_DATA_SCHEMA) return null;
    throw new Error("Analytics privacy key is not configured");
  }
  const key = /^[0-9a-f]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64url");
  if (key.length !== 32) {
    throw new Error("Analytics privacy key is invalid");
  }
  return key;
}

export function hashViewerAddress({
  address,
  inviteId,
  observedAt = new Date(),
  keyValue,
}: {
  address: string | null;
  inviteId: string;
  observedAt?: Date;
  keyValue?: string;
}) {
  if (!address || !isIP(address)) return null;
  const key = analyticsHashKey(keyValue);
  if (!key) return null;
  const day = observedAt.toISOString().slice(0, 10);
  return createHmac("sha256", key)
    .update(`${inviteId}:${day}:${address}`, "utf8")
    .digest("hex");
}
