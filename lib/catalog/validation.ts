import { CatalogError } from "./errors";
import type {
  CatalogDiscoveryInput,
  CatalogIngestInput,
  CatalogLifecycleState,
  CatalogMediaType,
  CatalogRestrictedMetadata,
  CatalogRevertInput,
  CatalogTransitionInput,
  CatalogVersionBinding,
} from "./contracts";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const CHECKSUM = /^sha256:[a-f0-9]{64}$/;
const MEDIA_TYPES = new Set<CatalogMediaType>(["video", "image", "audio", "document", "other"]);
const LIFECYCLE_STATES = new Set<CatalogLifecycleState>([
  "active",
  "hidden",
  "archived",
  "withdrawn",
]);

function fail(message: string): never {
  throw new CatalogError("invalid_request", message, 400);
}

function record(value: unknown, label = "request"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== "string") fail(`${label} must be a string.`);
  const normalized = value.trim();
  if (!allowEmpty && normalized.length === 0) fail(`${label} is required.`);
  if (normalized.length > maxLength) fail(`${label} exceeds ${maxLength} characters.`);
  return normalized;
}

function nullableString(value: unknown, label: string, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return stringValue(value, label, maxLength);
}

function identifier(value: unknown, label: string): string {
  const parsed = stringValue(value, label, 128);
  if (!IDENTIFIER.test(parsed)) fail(`${label} contains unsupported characters.`);
  return parsed;
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function requestId(value: unknown): string {
  return value === undefined || value === null || value === ""
    ? crypto.randomUUID()
    : identifier(value, "requestId");
}

function idempotencyKey(value: unknown): string {
  const key = stringValue(value, "idempotencyKey", 128);
  if (key.length < 8) fail("idempotencyKey must contain at least 8 characters.");
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) fail("idempotencyKey contains unsupported characters.");
  return key;
}

function versionBinding(value: unknown): CatalogVersionBinding {
  const input = record(value, "version");
  const checksum = stringValue(input.checksum, "version.checksum", 71).toLowerCase();
  if (!CHECKSUM.test(checksum)) {
    fail("version.checksum must be a sha256 digest in the form sha256:<64 lowercase hex characters>.");
  }

  return {
    assetId: identifier(input.assetId, "version.assetId"),
    versionId: identifier(input.versionId, "version.versionId"),
    sequence: integer(input.sequence, "version.sequence", 1, 1_000_000_000),
    checksum,
  };
}

function tags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail("metadata.tags must be an array.");
  if (value.length > 25) fail("metadata.tags cannot contain more than 25 values.");
  const normalized = value.map((tag, index) =>
    stringValue(tag, `metadata.tags[${index}]`, 64).toLocaleLowerCase("en-US"),
  );
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

function restrictedMetadata(value: unknown): CatalogRestrictedMetadata {
  const input = value === undefined ? {} : record(value, "restrictedMetadata");
  return {
    sourceLocator: nullableString(input.sourceLocator, "restrictedMetadata.sourceLocator", 2_048),
    rightsStatement: nullableString(input.rightsStatement, "restrictedMetadata.rightsStatement", 500),
  };
}

export function parseIngestInput(value: unknown): CatalogIngestInput {
  const input = record(value);
  const metadata = record(input.metadata, "metadata");
  const mediaType = stringValue(metadata.mediaType, "metadata.mediaType", 32) as CatalogMediaType;
  if (!MEDIA_TYPES.has(mediaType)) fail("metadata.mediaType is not supported.");

  const duration = metadata.durationMs;
  const durationMs =
    duration === null || duration === undefined
      ? null
      : integer(duration, "metadata.durationMs", 0, 604_800_000);

  return {
    tenantId: identifier(input.tenantId, "tenantId"),
    idempotencyKey: idempotencyKey(input.idempotencyKey),
    requestId: requestId(input.requestId),
    expectedRevision: integer(input.expectedRevision, "expectedRevision", 0, 1_000_000_000),
    version: versionBinding(input.version),
    metadata: {
      title: stringValue(metadata.title, "metadata.title", 240),
      description: nullableString(metadata.description, "metadata.description", 2_000),
      mediaType,
      tags: tags(metadata.tags),
      durationMs,
      language: nullableString(metadata.language, "metadata.language", 35)?.toLocaleLowerCase("en-US") ?? null,
    },
    restrictedMetadata: restrictedMetadata(input.restrictedMetadata),
  };
}

function lifecycleState(value: unknown, label: string): CatalogLifecycleState {
  const parsed = stringValue(value, label, 32) as CatalogLifecycleState;
  if (!LIFECYCLE_STATES.has(parsed)) fail(`${label} is not supported.`);
  return parsed;
}

export function parseTransitionInput(value: unknown): CatalogTransitionInput {
  const input = record(value);
  return {
    tenantId: identifier(input.tenantId, "tenantId"),
    assetId: identifier(input.assetId, "assetId"),
    targetState: lifecycleState(input.targetState, "targetState"),
    expectedRevision: integer(input.expectedRevision, "expectedRevision", 1, 1_000_000_000),
    idempotencyKey: idempotencyKey(input.idempotencyKey),
    requestId: requestId(input.requestId),
  };
}

export function parseRevertInput(value: unknown): CatalogRevertInput {
  const input = record(value);
  return {
    tenantId: identifier(input.tenantId, "tenantId"),
    operationId: identifier(input.operationId, "operationId"),
    expectedRevision: integer(input.expectedRevision, "expectedRevision", 1, 1_000_000_000),
    idempotencyKey: idempotencyKey(input.idempotencyKey),
    requestId: requestId(input.requestId),
  };
}

export function parseDiscoveryInput(value: unknown): CatalogDiscoveryInput {
  const input = record(value);
  const rawTags = input.tags;
  let parsedTags: string[] = [];
  if (rawTags !== undefined && rawTags !== null) {
    if (!Array.isArray(rawTags) || rawTags.length > 10) {
      fail("tags must be an array containing no more than 10 values.");
    }
    parsedTags = rawTags.map((tag, index) =>
      stringValue(tag, `tags[${index}]`, 64).toLocaleLowerCase("en-US"),
    );
    parsedTags = [...new Set(parsedTags)].sort((a, b) => a.localeCompare(b));
  }

  const rawState = input.lifecycleState;
  const parsedState = rawState === undefined || rawState === null || rawState === ""
    ? null
    : lifecycleState(rawState, "lifecycleState");

  const query = input.query === undefined || input.query === null
    ? ""
    : stringValue(input.query, "query", 120, true).replace(/\s+/g, " ").toLocaleLowerCase("en-US");

  return {
    tenantId: identifier(input.tenantId, "tenantId"),
    query,
    tags: parsedTags,
    lifecycleState: parsedState,
    limit: input.limit === undefined || input.limit === null
      ? 25
      : integer(input.limit, "limit", 1, 100),
    cursor: input.cursor === undefined || input.cursor === null || input.cursor === ""
      ? null
      : stringValue(input.cursor, "cursor", 1_024),
    requestId: requestId(input.requestId),
  };
}
