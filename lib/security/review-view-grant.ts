import { createHmac, timingSafeEqual } from "node:crypto";

const REVIEW_VIEW_GRANT_VERSION = 1;
const REVIEW_VIEW_GRANT_TTL_MS = 12 * 60 * 60 * 1000;
const REVIEW_VIEW_GRANT_KEY_LABEL = "co-videopro-review-view-claim:v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ReviewViewGrantPayload {
  v: number;
  invite: string;
  binding: string;
  claim: string;
  request: string;
  expires: number;
}

interface CreateReviewViewGrantInput {
  token: string;
  inviteId: string;
  claimId: string;
  requestId: string;
  inviteExpiresAt?: string | null;
  now?: Date;
  keyValue?: string;
}

interface ValidateReviewViewGrantInput {
  token: string;
  inviteId: string;
  now?: Date;
  keyValue?: string;
}

function decodeSigningKey(value = process.env.CO_PRODUCTION_TOKEN_ENCRYPTION_KEY) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(
      "Missing required environment variable: CO_PRODUCTION_TOKEN_ENCRYPTION_KEY",
    );
  }

  const key = /^[0-9a-f]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64url");
  if (key.length !== 32) {
    throw new Error(
      "CO_PRODUCTION_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes",
    );
  }

  return createHmac("sha256", key)
    .update(REVIEW_VIEW_GRANT_KEY_LABEL, "utf8")
    .digest();
}

function tokenBinding(token: string, keyValue?: string) {
  return createHmac("sha256", decodeSigningKey(keyValue))
    .update("token:", "utf8")
    .update(token, "utf8")
    .digest("base64url");
}

function cookieName(token: string, keyValue?: string) {
  return `cvp_review_view_${tokenBinding(token, keyValue).slice(0, 24)}`;
}

function signPayload(payload: string, keyValue?: string) {
  return createHmac("sha256", decodeSigningKey(keyValue))
    .update(payload, "utf8")
    .digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function parseCookieHeader(header: string | null) {
  const values = new Map<string, string>();
  for (const segment of (header ?? "").split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (name && !values.has(name)) values.set(name, value);
  }
  return values;
}

export function createReviewViewGrant({
  token,
  inviteId,
  claimId,
  requestId,
  inviteExpiresAt,
  now = new Date(),
  keyValue,
}: CreateReviewViewGrantInput) {
  if (
    !token ||
    !UUID_PATTERN.test(inviteId) ||
    !UUID_PATTERN.test(claimId) ||
    !UUID_PATTERN.test(requestId)
  ) {
    throw new Error("Review view grant authority is invalid");
  }

  const inviteExpiry = inviteExpiresAt
    ? Date.parse(inviteExpiresAt)
    : Number.POSITIVE_INFINITY;
  const expiresAt = Math.min(now.getTime() + REVIEW_VIEW_GRANT_TTL_MS, inviteExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw new Error("Review view grant cannot outlive the review invite");
  }

  const payload: ReviewViewGrantPayload = {
    v: REVIEW_VIEW_GRANT_VERSION,
    invite: inviteId,
    binding: tokenBinding(token, keyValue),
    claim: claimId,
    request: requestId,
    expires: Math.floor(expiresAt / 1000),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );

  return {
    name: cookieName(token, keyValue),
    value: `${encodedPayload}.${signPayload(encodedPayload, keyValue)}`,
    maxAge: Math.max(1, Math.floor((expiresAt - now.getTime()) / 1000)),
  };
}

export function hasValidReviewViewGrant(
  request: Request,
  {
    token,
    inviteId,
    now = new Date(),
    keyValue,
  }: ValidateReviewViewGrantInput,
) {
  const grant = parseCookieHeader(request.headers.get("cookie")).get(
    cookieName(token, keyValue),
  );
  if (!grant) return false;

  const [encodedPayload, signature, ...extra] = grant.split(".");
  if (!encodedPayload || !signature || extra.length > 0) return false;
  if (!safeEqual(signature, signPayload(encodedPayload, keyValue))) return false;

  let payload: ReviewViewGrantPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as ReviewViewGrantPayload;
  } catch {
    return false;
  }

  return (
    payload.v === REVIEW_VIEW_GRANT_VERSION &&
    payload.invite === inviteId &&
    safeEqual(payload.binding, tokenBinding(token, keyValue)) &&
    UUID_PATTERN.test(payload.claim) &&
    UUID_PATTERN.test(payload.request) &&
    Number.isSafeInteger(payload.expires) &&
    payload.expires > Math.floor(now.getTime() / 1000)
  );
}
