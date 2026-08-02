import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
// Node's strip-types test runner requires an explicit TypeScript extension.
// @ts-expect-error TS5097: the runtime intentionally imports the source module.
import { CO_PRODUCTION_DATA_SCHEMA, getSupabaseDataSchema, type SupabaseDataSchema } from "../data-authority.ts";

const FORMAT_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const AAD = Buffer.from("co-production-opaque-token:v1", "utf8");

export interface LegacyOpaqueTokenFields {
  token: string;
}

export interface IsolatedOpaqueTokenFields {
  token_hash: string;
  token_ciphertext: string;
}

export type PersistedOpaqueTokenFields =
  | LegacyOpaqueTokenFields
  | IsolatedOpaqueTokenFields;

function encryptionKey(value = process.env.CO_PRODUCTION_TOKEN_ENCRYPTION_KEY) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error("Missing required environment variable: CO_PRODUCTION_TOKEN_ENCRYPTION_KEY");
  }

  const key = /^[0-9a-f]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64url");
  if (key.length !== 32) {
    throw new Error(
      "CO_PRODUCTION_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes",
    );
  }
  return key;
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function encryptOpaqueToken(
  token: string,
  keyValue?: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(keyValue), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptOpaqueToken(
  envelope: string,
  keyValue?: string,
): string {
  const [version, ivValue, tagValue, ciphertextValue, ...extra] = envelope.split(".");
  if (
    version !== FORMAT_VERSION ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra.length > 0
  ) {
    throw new Error("Opaque token envelope is invalid");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(keyValue),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function persistedOpaqueTokenFields(
  token: string,
  schema: SupabaseDataSchema = getSupabaseDataSchema(),
  keyValue?: string,
): PersistedOpaqueTokenFields {
  if (schema !== CO_PRODUCTION_DATA_SCHEMA) {
    return { token };
  }

  return {
    token_hash: hashOpaqueToken(token),
    token_ciphertext: encryptOpaqueToken(token, keyValue),
  };
}

export function opaqueTokenLookup(
  token: string,
  schema: SupabaseDataSchema = getSupabaseDataSchema(),
) {
  return schema === CO_PRODUCTION_DATA_SCHEMA
    ? { column: "token_hash" as const, value: hashOpaqueToken(token) }
    : { column: "token" as const, value: token };
}

export function recoverOpaqueToken(
  row: { token?: unknown; token_ciphertext?: unknown },
  keyValue?: string,
): string {
  if (typeof row.token === "string" && row.token) return row.token;
  if (typeof row.token_ciphertext === "string" && row.token_ciphertext) {
    return decryptOpaqueToken(row.token_ciphertext, keyValue);
  }
  throw new Error("Stored opaque token cannot be recovered");
}

export function withoutPersistedTokenSecrets<T extends Record<string, unknown>>(
  row: T,
): Omit<T, "token_hash" | "token_ciphertext"> {
  const safe = { ...row };
  delete safe.token_hash;
  delete safe.token_ciphertext;
  return safe;
}
