import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

export const REVIEW_PASSWORD_MIN_LENGTH = 8;
export const REVIEW_PASSWORD_MAX_LENGTH = 128;

const PASSWORD_FORMAT = "scrypt";
const PASSWORD_VERSION = "v1";
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 32 * 1024 * 1024;
const REVIEW_ACCESS_VERSION = 1;
const REVIEW_ACCESS_TTL_MS = 12 * 60 * 60 * 1000;
const REVIEW_ACCESS_KEY_LABEL = "co-videopro-review-access:v1";

interface ReviewAccessPayload {
  v: number;
  invite: string;
  token: string;
  password: string;
  expires: number;
}

interface ReviewAccessGrantInput {
  token: string;
  inviteId: string;
  passwordHash: string;
  inviteExpiresAt?: string | null;
  now?: Date;
  keyValue?: string;
}

function validPassword(password: string) {
  return (
    password.length >= REVIEW_PASSWORD_MIN_LENGTH &&
    password.length <= REVIEW_PASSWORD_MAX_LENGTH &&
    Buffer.byteLength(password, "utf8") <= REVIEW_PASSWORD_MAX_LENGTH * 4
  );
}

function derivePasswordKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key as Buffer);
      },
    );
  });
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
    .update(REVIEW_ACCESS_KEY_LABEL, "utf8")
    .digest();
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
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

function accessCookieName(token: string) {
  return `cvp_review_access_${sha256(token).slice(0, 24)}`;
}

function signAccessPayload(payload: string, keyValue?: string) {
  return createHmac("sha256", decodeSigningKey(keyValue))
    .update(payload, "utf8")
    .digest("base64url");
}

export async function hashReviewPassword(password: string) {
  if (!validPassword(password)) {
    throw new Error(
      `Review passwords must be ${REVIEW_PASSWORD_MIN_LENGTH}-${REVIEW_PASSWORD_MAX_LENGTH} characters`,
    );
  }

  const salt = randomBytes(16);
  const key = await derivePasswordKey(password, salt);
  return [
    PASSWORD_FORMAT,
    PASSWORD_VERSION,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyReviewPassword(password: string, encodedHash: string) {
  if (!validPassword(password)) return false;

  const parts = encodedHash.split("$");
  if (parts.length !== 7) return false;
  const [format, version, costValue, blockValue, parallelValue, saltValue, keyValue] =
    parts;
  if (format !== PASSWORD_FORMAT || version !== PASSWORD_VERSION) return false;

  const cost = Number(costValue);
  const blockSize = Number(blockValue);
  const parallelization = Number(parallelValue);
  if (
    cost !== SCRYPT_COST ||
    blockSize !== SCRYPT_BLOCK_SIZE ||
    parallelization !== SCRYPT_PARALLELIZATION
  ) {
    return false;
  }

  const salt = Buffer.from(saltValue, "base64url");
  const expected = Buffer.from(keyValue, "base64url");
  if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;

  const actual = await derivePasswordKey(password, salt);
  return timingSafeEqual(actual, expected);
}

export function createReviewAccessGrant({
  token,
  inviteId,
  passwordHash,
  inviteExpiresAt,
  now = new Date(),
  keyValue,
}: ReviewAccessGrantInput) {
  const inviteExpiry = inviteExpiresAt ? Date.parse(inviteExpiresAt) : Number.POSITIVE_INFINITY;
  const expiresAt = Math.min(now.getTime() + REVIEW_ACCESS_TTL_MS, inviteExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw new Error("Review access grant cannot outlive the review invite");
  }

  const payload: ReviewAccessPayload = {
    v: REVIEW_ACCESS_VERSION,
    invite: inviteId,
    token: sha256(token),
    password: sha256(passwordHash),
    expires: Math.floor(expiresAt / 1000),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );

  return {
    name: accessCookieName(token),
    value: `${encodedPayload}.${signAccessPayload(encodedPayload, keyValue)}`,
    maxAge: Math.max(1, Math.floor((expiresAt - now.getTime()) / 1000)),
  };
}

export function hasValidReviewAccessGrant(
  request: Request,
  {
    token,
    inviteId,
    passwordHash,
    now = new Date(),
    keyValue,
  }: Omit<ReviewAccessGrantInput, "inviteExpiresAt">,
) {
  const grant = parseCookieHeader(request.headers.get("cookie")).get(
    accessCookieName(token),
  );
  if (!grant) return false;

  const [encodedPayload, signature, ...extra] = grant.split(".");
  if (!encodedPayload || !signature || extra.length > 0) return false;
  const expectedSignature = signAccessPayload(encodedPayload, keyValue);
  if (!safeEqual(signature, expectedSignature)) return false;

  let payload: ReviewAccessPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as ReviewAccessPayload;
  } catch {
    return false;
  }

  return (
    payload.v === REVIEW_ACCESS_VERSION &&
    payload.invite === inviteId &&
    safeEqual(payload.token, sha256(token)) &&
    safeEqual(payload.password, sha256(passwordHash)) &&
    Number.isSafeInteger(payload.expires) &&
    payload.expires > Math.floor(now.getTime() / 1000)
  );
}
