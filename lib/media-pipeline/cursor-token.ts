import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { MediaPipelineError } from "./errors.ts";
import type { MediaPipelineConfig } from "./config.ts";

const TOKEN_PREFIX = "codeliver_rcc_v1";
const TOKEN_TYPE = "co_deliver_receipt_catalog_cursor_token";
const TOKEN_AAD = "co-deliver:media-pipeline:receipt-catalog-cursor:v1";
const MAX_CURSOR_BYTES = 4096;
const MAX_TOKEN_BYTES = 8192;

interface ReceiptCatalogCursorTokenClaims {
  schemaVersion: 1;
  type: typeof TOKEN_TYPE;
  provider: string;
  scanRoot: "provider-catalog";
  kind: "restore_attestation";
  cursor: string;
  cursorDigest: string;
  issuedAt: string;
  expiresAt: string;
  scanLimit: number;
  pagesScanned: number;
}

export interface ReceiptCatalogContinuationToken {
  token: string;
  tokenDigest: string;
  tokenKeyDigest: string;
  cursorDigest: string;
  expiresAt: string;
}

export interface DecodedReceiptCatalogContinuationToken {
  cursor: string;
  cursorDigest: string;
  issuedAt: string;
  expiresAt: string;
  scanLimit: number;
  pagesScanned: number;
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function keyDigest(secret: string): string {
  return sha256Hex(secret).slice(0, 32);
}

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function fromBase64url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid base64url segment");
  }
  return Buffer.from(value, "base64url");
}

function isIsoString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function assertTokenShape(value: unknown): ReceiptCatalogCursorTokenClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Cursor token payload is not an object");
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    record.type !== TOKEN_TYPE ||
    typeof record.provider !== "string" ||
    !record.provider.trim() ||
    record.scanRoot !== "provider-catalog" ||
    record.kind !== "restore_attestation" ||
    typeof record.cursor !== "string" ||
    !record.cursor.trim() ||
    Buffer.byteLength(record.cursor) > MAX_CURSOR_BYTES ||
    !isSha256(record.cursorDigest) ||
    record.cursorDigest !== sha256Hex(record.cursor) ||
    !isIsoString(record.issuedAt) ||
    !isIsoString(record.expiresAt) ||
    Date.parse(record.expiresAt) <= Date.parse(record.issuedAt) ||
    !Number.isSafeInteger(record.scanLimit) ||
    Number(record.scanLimit) <= 0 ||
    !Number.isSafeInteger(record.pagesScanned) ||
    Number(record.pagesScanned) < 0
  ) {
    throw new Error("Cursor token payload is invalid");
  }
  return record as unknown as ReceiptCatalogCursorTokenClaims;
}

function availableVerificationKeys(config: MediaPipelineConfig): string[] {
  return [
    ...new Set(
      [
        config.receiptCatalogCursorTokenKey,
        ...config.receiptCatalogCursorTokenVerificationKeys,
      ].filter((key): key is string => Boolean(key))
    ),
  ];
}

export function issueReceiptCatalogContinuationToken(input: {
  provider: string;
  cursor: string;
  scanLimit: number;
  pagesScanned: number;
  config: MediaPipelineConfig;
  now: () => Date;
}): ReceiptCatalogContinuationToken | null {
  const secret = input.config.receiptCatalogCursorTokenKey;
  if (!secret) return null;
  if (
    !input.provider.trim() ||
    !input.cursor.trim() ||
    Buffer.byteLength(input.cursor) > MAX_CURSOR_BYTES ||
    !Number.isSafeInteger(input.scanLimit) ||
    input.scanLimit <= 0 ||
    !Number.isSafeInteger(input.pagesScanned) ||
    input.pagesScanned < 0
  ) {
    throw new MediaPipelineError(
      "PIPELINE_RECEIPT_CATALOG_CURSOR_INVALID",
      "Receipt catalog continuation cursor is invalid"
    );
  }

  const issuedAtMs = input.now().getTime();
  const issuedAt = new Date(issuedAtMs).toISOString();
  const expiresAt = new Date(
    issuedAtMs + input.config.receiptCatalogCursorTokenTtlMs
  ).toISOString();
  const claims: ReceiptCatalogCursorTokenClaims = {
    schemaVersion: 1,
    type: TOKEN_TYPE,
    provider: input.provider,
    scanRoot: "provider-catalog",
    kind: "restore_attestation",
    cursor: input.cursor,
    cursorDigest: sha256Hex(input.cursor),
    issuedAt,
    expiresAt,
    scanLimit: input.scanLimit,
    pagesScanned: input.pagesScanned,
  };

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(TOKEN_AAD));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(claims), "utf8"),
    cipher.final(),
  ]);
  const token = [
    TOKEN_PREFIX,
    keyDigest(secret),
    base64url(iv),
    base64url(ciphertext),
    base64url(cipher.getAuthTag()),
  ].join(".");
  return {
    token,
    tokenDigest: sha256Hex(token),
    tokenKeyDigest: keyDigest(secret),
    cursorDigest: claims.cursorDigest,
    expiresAt,
  };
}

export function decodeReceiptCatalogContinuationToken(input: {
  token: string;
  expectedProvider: string;
  config: MediaPipelineConfig;
  now: () => Date;
}): DecodedReceiptCatalogContinuationToken {
  try {
    if (!input.token.trim() || Buffer.byteLength(input.token) > MAX_TOKEN_BYTES) {
      throw new Error("Cursor token size is invalid");
    }
    const [prefix, kid, ivSegment, ciphertextSegment, tagSegment, extra] =
      input.token.split(".");
    if (
      prefix !== TOKEN_PREFIX ||
      extra !== undefined ||
      !/^[a-f0-9]{32}$/.test(kid) ||
      !input.expectedProvider.trim()
    ) {
      throw new Error("Cursor token envelope is invalid");
    }
    const secret = availableVerificationKeys(input.config).find((candidate) => {
      const left = Buffer.from(keyDigest(candidate));
      const right = Buffer.from(kid);
      return left.length === right.length && timingSafeEqual(left, right);
    });
    if (!secret) {
      throw new Error("Cursor token key is unavailable");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(secret),
      fromBase64url(ivSegment)
    );
    decipher.setAAD(Buffer.from(TOKEN_AAD));
    decipher.setAuthTag(fromBase64url(tagSegment));
    const payload = Buffer.concat([
      decipher.update(fromBase64url(ciphertextSegment)),
      decipher.final(),
    ]).toString("utf8");
    const claims = assertTokenShape(JSON.parse(payload));
    if (
      claims.provider !== input.expectedProvider ||
      claims.scanRoot !== "provider-catalog" ||
      claims.kind !== "restore_attestation" ||
      Date.parse(claims.expiresAt) <= input.now().getTime()
    ) {
      throw new Error("Cursor token claims are not valid for this provider");
    }
    return {
      cursor: claims.cursor,
      cursorDigest: claims.cursorDigest,
      issuedAt: claims.issuedAt,
      expiresAt: claims.expiresAt,
      scanLimit: claims.scanLimit,
      pagesScanned: claims.pagesScanned,
    };
  } catch {
    throw new MediaPipelineError(
      "PIPELINE_RECEIPT_CATALOG_CURSOR_INVALID",
      "Receipt catalog continuation token is invalid"
    );
  }
}
