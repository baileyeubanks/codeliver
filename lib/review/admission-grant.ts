import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { isOpaqueRouteToken } from "../dynamic-route-authority.ts";

const FORMAT_VERSION = "v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_ID_PATTERN = /^[0-9a-f]{32}$/;
const COOKIE_PREFIX = "__Host-cvp_review_admission_";
const MAX_GRANT_BYTES = 2_048;
const MAX_COOKIE_HEADER_BYTES = 16 * 1_024;
const FUTURE_CLOCK_SKEW_SECONDS = 30;

export const REVIEW_ADMISSION_GRANT_TTL_SECONDS = 15 * 60;
export const REVIEW_ADMISSION_MAX_TTL_SECONDS = 8 * 60 * 60;

export interface ReviewAdmissionClaims {
  admissionId: string;
  inviteId: string;
  assetId: string;
  versionId: string;
  issuedAt: number;
  expiresAt: number;
  admissionExpiresAt: number;
}

interface ReviewAdmissionGrantInput extends ReviewAdmissionClaims {
  token: string;
}

interface ReviewAdmissionGrantHashInput extends ReviewAdmissionClaims {
  tokenHash: string;
}

export interface ReviewAdmissionKeyring {
  activeKey: string;
  verificationKeys?: string[];
}

type ReviewAdmissionKeyInput = string | ReviewAdmissionKeyring | undefined;

interface KeyMaterial {
  id: string;
  key: Buffer;
}

function decodeKey(value: string, variable: string): Buffer {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${variable} is required`);
  }
  const key = /^[0-9a-f]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64url");
  if (key.length !== 32) {
    throw new Error(`${variable} must encode exactly 32 bytes`);
  }
  return key;
}

function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

function keyringFromEnvironment(
  env: NodeJS.ProcessEnv,
): ReviewAdmissionKeyring {
  const activeKey =
    env.CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY?.trim();
  if (!activeKey) {
    throw new Error(
      "Missing required environment variable: CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY",
    );
  }
  const rawVerificationKeys =
    env.CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS?.trim();
  const verificationKeys = rawVerificationKeys
    ? rawVerificationKeys.split(",").map((value) => value.trim())
    : [];
  if (verificationKeys.some((value) => !value)) {
    throw new Error(
      "CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS contains an empty key",
    );
  }
  return { activeKey, verificationKeys };
}

function defaultKeyring(): ReviewAdmissionKeyring {
  return keyringFromEnvironment(process.env);
}

function normalizedKeyring(
  input: ReviewAdmissionKeyInput,
): ReviewAdmissionKeyring {
  if (typeof input === "string") {
    return { activeKey: input, verificationKeys: [] };
  }
  return input ?? defaultKeyring();
}

function keyMaterials(input: ReviewAdmissionKeyInput): {
  active: KeyMaterial;
  verification: KeyMaterial[];
} {
  const keyring = normalizedKeyring(input);
  const activeKey = decodeKey(
    keyring.activeKey,
    "CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY",
  );
  const active = { id: keyId(activeKey), key: activeKey };
  const byId = new Map<string, KeyMaterial>([[active.id, active]]);
  for (const value of keyring.verificationKeys ?? []) {
    const key = decodeKey(
      value,
      "CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS",
    );
    const material = { id: keyId(key), key };
    byId.set(material.id, material);
  }
  return { active, verification: [...byId.values()] };
}

export function assertReviewAdmissionSigningConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): void {
  keyMaterials(keyringFromEnvironment(env));
}

function hashToken(token: string): string {
  if (!isOpaqueRouteToken(token)) {
    throw new Error("Review token is invalid");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function safeEqualText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function assertClaims(claims: ReviewAdmissionClaims): void {
  for (const value of [
    claims.admissionId,
    claims.inviteId,
    claims.assetId,
    claims.versionId,
  ]) {
    if (!UUID_PATTERN.test(value)) {
      throw new Error("Review admission identity is invalid");
    }
  }
  if (
    !Number.isSafeInteger(claims.issuedAt) ||
    !Number.isSafeInteger(claims.expiresAt) ||
    !Number.isSafeInteger(claims.admissionExpiresAt) ||
    claims.expiresAt <= claims.issuedAt ||
    claims.expiresAt - claims.issuedAt >
      REVIEW_ADMISSION_GRANT_TTL_SECONDS ||
    claims.admissionExpiresAt < claims.expiresAt ||
    claims.admissionExpiresAt - claims.issuedAt >
      REVIEW_ADMISSION_MAX_TTL_SECONDS
  ) {
    throw new Error("Review admission lifetime is invalid");
  }
}

function payloadValue({
  token,
  admissionId,
  inviteId,
  assetId,
  versionId,
  issuedAt,
  expiresAt,
  admissionExpiresAt,
}: ReviewAdmissionGrantInput): [
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  number,
] {
  return payloadValueFromTokenHash({
    tokenHash: hashToken(token),
    admissionId,
    inviteId,
    assetId,
    versionId,
    issuedAt,
    expiresAt,
    admissionExpiresAt,
  });
}

function payloadValueFromTokenHash({
  tokenHash,
  admissionId,
  inviteId,
  assetId,
  versionId,
  issuedAt,
  expiresAt,
  admissionExpiresAt,
}: ReviewAdmissionGrantHashInput): [
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  number,
] {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) {
    throw new Error("Review token hash is invalid");
  }
  return [
    admissionId,
    inviteId,
    assetId,
    versionId,
    tokenHash,
    issuedAt,
    expiresAt,
    admissionExpiresAt,
  ];
}

function signature(message: string, key: Buffer): Buffer {
  return createHmac("sha256", key).update(message, "utf8").digest();
}

export function issueReviewAdmissionGrant(
  input: ReviewAdmissionGrantInput,
  keyValue?: ReviewAdmissionKeyInput,
): string {
  assertClaims(input);
  const { active } = keyMaterials(keyValue);
  const encodedPayload = Buffer.from(
    JSON.stringify(payloadValue(input)),
    "utf8",
  ).toString("base64url");
  const message = `${FORMAT_VERSION}.${active.id}.${encodedPayload}`;
  return `${message}.${signature(message, active.key).toString("base64url")}`;
}

export function issueReviewAdmissionGrantFromTokenHash(
  input: ReviewAdmissionGrantHashInput,
  keyValue?: ReviewAdmissionKeyInput,
): string {
  assertClaims(input);
  const { active } = keyMaterials(keyValue);
  const encodedPayload = Buffer.from(
    JSON.stringify(payloadValueFromTokenHash(input)),
    "utf8",
  ).toString("base64url");
  const message = `${FORMAT_VERSION}.${active.id}.${encodedPayload}`;
  return `${message}.${signature(message, active.key).toString("base64url")}`;
}

function matchingVerificationKey(
  id: string,
  candidates: KeyMaterial[],
): KeyMaterial | null {
  if (!KEY_ID_PATTERN.test(id)) return null;
  return (
    candidates.find((candidate) => safeEqualText(candidate.id, id)) ?? null
  );
}

export function verifyReviewAdmissionGrant(
  grant: string,
  {
    token,
    admissionId: expectedAdmissionId,
    now = Math.floor(Date.now() / 1_000),
    keyValue,
    allowExpiredForRefresh = false,
  }: {
    token?: string;
    admissionId?: string;
    now?: number;
    keyValue?: ReviewAdmissionKeyInput;
    allowExpiredForRefresh?: boolean;
  },
): ReviewAdmissionClaims | null {
  if (
    typeof grant !== "string" ||
    !grant ||
    Buffer.byteLength(grant) > MAX_GRANT_BYTES ||
    !Number.isSafeInteger(now) ||
    (!token && !expectedAdmissionId) ||
    (token !== undefined && expectedAdmissionId !== undefined)
  ) {
    return null;
  }
  const { verification } = keyMaterials(keyValue);
  try {
    const [version, id, encodedPayload, encodedSignature, ...extra] =
      grant.split(".");
    if (
      version !== FORMAT_VERSION ||
      !id ||
      !encodedPayload ||
      !encodedSignature ||
      extra.length > 0
    ) {
      return null;
    }
    const key = matchingVerificationKey(id, verification);
    if (!key) return null;
    const message = `${version}.${id}.${encodedPayload}`;
    const suppliedSignature = Buffer.from(encodedSignature, "base64url");
    const expectedSignature = signature(message, key.key);
    if (
      suppliedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(suppliedSignature, expectedSignature)
    ) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;
    if (!Array.isArray(decoded) || decoded.length !== 8) return null;
    const [
      admissionId,
      inviteId,
      assetId,
      versionId,
      storedTokenHash,
      issuedAt,
      expiresAt,
      admissionExpiresAt,
    ] = decoded;
    if (
      typeof admissionId !== "string" ||
      typeof inviteId !== "string" ||
      typeof assetId !== "string" ||
      typeof versionId !== "string" ||
      typeof storedTokenHash !== "string" ||
      typeof issuedAt !== "number" ||
      typeof expiresAt !== "number" ||
      typeof admissionExpiresAt !== "number"
    ) {
      return null;
    }
    const claims: ReviewAdmissionClaims = {
      admissionId,
      inviteId,
      assetId,
      versionId,
      issuedAt,
      expiresAt,
      admissionExpiresAt,
    };
    assertClaims(claims);
    if (
      (token && !safeEqualText(storedTokenHash, hashToken(token))) ||
      (expectedAdmissionId &&
        !safeEqualText(admissionId, expectedAdmissionId)) ||
      issuedAt > now + FUTURE_CLOCK_SKEW_SECONDS ||
      (allowExpiredForRefresh
        ? admissionExpiresAt <= now
        : expiresAt <= now)
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

export function verifyReviewAdmissionMediaGrant(
  grant: string,
  {
    admissionId,
    now,
    keyValue,
    allowExpiredForRefresh = false,
  }: {
    admissionId: string;
    now?: number;
    keyValue?: ReviewAdmissionKeyInput;
    allowExpiredForRefresh?: boolean;
  },
): { claims: ReviewAdmissionClaims; tokenHash: string } | null {
  const claims = verifyReviewAdmissionGrant(grant, {
    admissionId,
    now,
    keyValue,
    allowExpiredForRefresh,
  });
  if (!claims) return null;

  try {
    const encodedPayload = grant.split(".")[2];
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;
    const tokenHash =
      Array.isArray(decoded) && typeof decoded[4] === "string"
        ? decoded[4]
        : null;
    return tokenHash && /^[0-9a-f]{64}$/.test(tokenHash)
      ? { claims, tokenHash }
      : null;
  } catch {
    return null;
  }
}

export function reviewAdmissionCookieName(admissionId: string): string {
  if (!UUID_PATTERN.test(admissionId)) {
    throw new Error("Review admission identity is invalid");
  }
  const digest = createHash("sha256")
    .update(admissionId.toLowerCase(), "utf8")
    .digest("hex")
    .slice(0, 16);
  return `${COOKIE_PREFIX}${digest}`;
}

function cookiePairs(request: Request): Array<[string, string]> {
  const header = request.headers.get("cookie") ?? "";
  if (Buffer.byteLength(header, "utf8") > MAX_COOKIE_HEADER_BYTES) {
    return [];
  }
  return header
    .split(";")
    .flatMap((part): Array<[string, string]> => {
      const separator = part.indexOf("=");
      if (separator < 0) return [];
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      return name && value ? [[name, value]] : [];
    });
}

export function readReviewAdmissionCookie(
  request: Request,
  admissionId: string,
): string | null {
  const name = reviewAdmissionCookieName(admissionId);
  return (
    cookiePairs(request).find(([candidate]) => candidate === name)?.[1] ?? null
  );
}

export function findReviewAdmissionCookie(
  request: Request,
  token: string,
  options: {
    now?: number;
    keyValue?: ReviewAdmissionKeyInput;
    allowExpiredForRefresh?: boolean;
  } = {},
): { grant: string; claims: ReviewAdmissionClaims } | null {
  for (const [name, grant] of cookiePairs(request)) {
    if (!name.startsWith(COOKIE_PREFIX)) continue;
    const claims = verifyReviewAdmissionGrant(grant, {
      token,
      now: options.now,
      keyValue: options.keyValue,
      allowExpiredForRefresh: options.allowExpiredForRefresh ?? false,
    });
    if (
      claims &&
      safeEqualText(name, reviewAdmissionCookieName(claims.admissionId))
    ) {
      return { grant, claims };
    }
  }
  return null;
}

export function serializeReviewAdmissionCookie({
  admissionId,
  grant,
  admissionExpiresAt,
  now = Math.floor(Date.now() / 1_000),
}: {
  admissionId: string;
  grant: string;
  admissionExpiresAt: number;
  now?: number;
}): string {
  const maxAge = Math.max(
    0,
    Math.min(
      REVIEW_ADMISSION_MAX_TTL_SECONDS,
      admissionExpiresAt - now,
    ),
  );
  return [
    `${reviewAdmissionCookieName(admissionId)}=${grant}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
  ].join("; ");
}
