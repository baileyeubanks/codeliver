import {
  OPERATIONS_CONFIG_VERSION,
  OPERATIONS_LIMITS,
  OperationsError,
  makeObservation,
  makeReceipt,
  parseEnvelope,
  requireScope,
  stableJson,
  type OperationObservation,
  type OperationReceipt,
  type OperationsAuthority,
} from "./contracts";
import { OperationsIdempotencyLedger } from "./idempotency";

type BundleVisibility = "admin" | "owner";

export interface SupportBundleResult {
  tenantId: string;
  snapshotVersion: string;
  format: "application/json";
  archive: "not_created";
  bounded: true;
  byteLength: number;
  entries: Array<{ key: string; value: unknown }>;
  omittedEntryCount: number;
  redactionCount: number;
  guidance: string;
  receipt: OperationReceipt;
  observation: OperationObservation;
}

const SECRET_KEY = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|private[-_]?key|session)/i;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?:\+?\d[\d .()\-]{7,}\d)/g;

function boundedId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw new OperationsError("INVALID_REQUEST", `${field} is invalid.`);
  }
  return value;
}

function redactValue(value: unknown, depth: number, counter: { value: number }): unknown {
  if (depth > OPERATIONS_LIMITS.maximumValueDepth) {
    counter.value += 1;
    return "[REDACTED_DEPTH_LIMIT]";
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : "[REDACTED_INVALID_NUMBER]";
  if (typeof value === "string") {
    let text = value
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/[\r\n]+/g, " ")
      .slice(0, OPERATIONS_LIMITS.maximumStringLength);
    const before = text;
    text = text.replace(BEARER, "[REDACTED_SECRET]").replace(EMAIL, "[REDACTED_PII]").replace(PHONE, "[REDACTED_PII]");
    if (text !== before || value.length > text.length) counter.value += 1;
    return text;
  }
  if (Array.isArray(value)) {
    if (value.length > OPERATIONS_LIMITS.maximumCollectionEntries) {
      throw new OperationsError("LIMIT_EXCEEDED", "Support bundle arrays exceed their entry bound.", 413);
    }
    return value.map((item) => redactValue(item, depth + 1, counter));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > OPERATIONS_LIMITS.maximumCollectionEntries) {
      throw new OperationsError("LIMIT_EXCEEDED", "Support bundle objects exceed their key bound.", 413);
    }
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, child] of entries) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        counter.value += 1;
        continue;
      }
      if (SECRET_KEY.test(key)) {
        output[key] = "[REDACTED_SECRET]";
        counter.value += 1;
      } else {
        output[key] = redactValue(child, depth + 1, counter);
      }
    }
    return output;
  }
  counter.value += 1;
  return "[REDACTED_UNSUPPORTED_VALUE]";
}

export function createSupportBundle(
  authority: OperationsAuthority,
  unknownInput: unknown,
  ledger: OperationsIdempotencyLedger,
  now: Date,
): SupportBundleResult {
  const envelope = parseEnvelope(unknownInput);
  requireScope(authority, envelope, "operations.create_support_bundle");
  const input = unknownInput as Record<string, unknown>;
  const expectedSnapshotVersion = boundedId(input.expectedSnapshotVersion, "expectedSnapshotVersion");
  const snapshotVersion = boundedId(input.snapshotVersion, "snapshotVersion");
  if (snapshotVersion !== expectedSnapshotVersion) {
    throw new OperationsError("STALE_BINDING", "Support bundle evidence is bound to another snapshot.", 409);
  }
  if (!Array.isArray(input.entries)) {
    throw new OperationsError("INVALID_REQUEST", "Support bundle entries are required.");
  }
  if (input.entries.length > OPERATIONS_LIMITS.maximumBundleEntries) {
    throw new OperationsError("LIMIT_EXCEEDED", "Too many support bundle entries.", 413);
  }

  const seen = new Set<string>();
  const parsed = input.entries.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new OperationsError("INVALID_REQUEST", `entries[${index}] must be an object.`);
    }
    const entry = candidate as Record<string, unknown>;
    const key = boundedId(entry.key, `entries[${index}].key`);
    if (seen.has(key)) throw new OperationsError("INVALID_REQUEST", "Support bundle keys must be unique.");
    seen.add(key);
    if (entry.tenantId !== envelope.tenantId) {
      throw new OperationsError("TENANT_MISMATCH", "Support bundle evidence crossed tenant scope.", 403);
    }
    if (entry.sourceVersion !== OPERATIONS_CONFIG_VERSION) {
      throw new OperationsError("STALE_BINDING", "Support bundle evidence has a stale contract version.", 409);
    }
    if (entry.visibility !== "admin" && entry.visibility !== "owner") {
      throw new OperationsError("INVALID_REQUEST", "Support bundle visibility is invalid.");
    }
    return { key, value: entry.value, visibility: entry.visibility as BundleVisibility };
  });

  return ledger.run("support_bundle.create", envelope, unknownInput, (requestDigest) => {
    const redactions = { value: 0 };
    const visible = parsed.filter((entry) => authority.role === "owner" || entry.visibility === "admin");
    const entries = visible.map((entry) => ({
      key: entry.key,
      value: redactValue(entry.value, 0, redactions),
    }));
    const byteLength = Buffer.byteLength(stableJson(entries), "utf8");
    if (byteLength > OPERATIONS_LIMITS.maximumBundleBytes) {
      throw new OperationsError("LIMIT_EXCEEDED", "The redacted support bundle exceeds its byte bound.", 413);
    }
    const issuedAt = now.toISOString();
    const receipt = makeReceipt("support_bundle.create", envelope, requestDigest, issuedAt);
    return {
      tenantId: envelope.tenantId,
      snapshotVersion,
      format: "application/json" as const,
      archive: "not_created" as const,
      bounded: true as const,
      byteLength,
      entries,
      omittedEntryCount: parsed.length - visible.length,
      redactionCount: redactions.value,
      guidance: "Share only this redacted JSON manifest through an approved support channel; no archive was created or transmitted.",
      receipt,
      observation: makeObservation(authority, receipt, "computed"),
    };
  });
}
