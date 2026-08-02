import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const FORMAT_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const AAD = Buffer.from("co-production-webhook-secret:v1", "utf8");

export type WebhookSecretSchema = "public" | "co_production";

export interface LegacyWebhookSecretFields {
  secret: string;
}

export interface IsolatedWebhookSecretFields {
  secret_ciphertext: string;
}

function encryptionKey(
  value = process.env.CO_PRODUCTION_WEBHOOK_SECRET_ENCRYPTION_KEY,
) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(
      "Missing required environment variable: CO_PRODUCTION_WEBHOOK_SECRET_ENCRYPTION_KEY",
    );
  }

  const key = /^[0-9a-f]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64url");
  if (key.length !== 32) {
    throw new Error(
      "CO_PRODUCTION_WEBHOOK_SECRET_ENCRYPTION_KEY must encode exactly 32 bytes",
    );
  }
  return key;
}

export function encryptWebhookSecret(secret: string, keyValue?: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(keyValue), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    FORMAT_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptWebhookSecret(envelope: string, keyValue?: string) {
  const [version, ivValue, tagValue, ciphertextValue, ...extra] =
    envelope.split(".");
  if (
    version !== FORMAT_VERSION ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra.length > 0
  ) {
    throw new Error("Webhook secret envelope is invalid");
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

export function persistedWebhookSecretFields(
  secret: string,
  schema: WebhookSecretSchema,
  keyValue?: string,
): LegacyWebhookSecretFields | IsolatedWebhookSecretFields {
  return schema === "co_production"
    ? { secret_ciphertext: encryptWebhookSecret(secret, keyValue) }
    : { secret };
}

export function recoverWebhookSecret(
  row: { secret?: unknown; secret_ciphertext?: unknown },
  keyValue?: string,
) {
  if (typeof row.secret === "string" && row.secret) return row.secret;
  if (
    typeof row.secret_ciphertext === "string" &&
    row.secret_ciphertext
  ) {
    return decryptWebhookSecret(row.secret_ciphertext, keyValue);
  }
  throw new Error("Stored webhook secret cannot be recovered");
}

export function withoutPersistedWebhookSecrets<
  T extends Record<string, unknown>,
>(row: T): Omit<T, "secret" | "secret_ciphertext"> {
  const safe = { ...row };
  delete safe.secret;
  delete safe.secret_ciphertext;
  return safe;
}
