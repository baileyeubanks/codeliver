import { isAbsolute, join, resolve } from "node:path";

import type { StorageProviderKind } from "./contracts";

const DEFAULT_MAX_UPLOAD_BYTES = 12n * 1024n * 1024n * 1024n;
const DEFAULT_MAX_CHUNK_BYTES = 64n * 1024n * 1024n;
const DEFAULT_RESERVED_BYTES = 1024n * 1024n * 1024n;
const DEFAULT_TENANT_QUOTA_BYTES = 24n * 1024n * 1024n * 1024n;
const DEFAULT_MALWARE_SCAN_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_DERIVATIVE_HOOK_TIMEOUT_MS = 30 * 1000;

export type MalwarePolicy = "required" | "allow-local-demo";

export interface StorageRuntimeConfig {
  provider: StorageProviderKind;
  providerWasExplicit: boolean;
  writeEnabled: boolean;
  filesystemRoot: string | null;
  stateRoot: string | null;
  driveFolderId: string | null;
  driveCredentialMode: "access-token" | "service-account" | null;
  driveCredentialsValid: boolean;
  maxUploadBytes: bigint;
  maxChunkBytes: bigint;
  reservedBytes: bigint;
  tenantQuotaBytes: bigint;
  maxConcurrentUploads: number;
  sessionTtlMs: number;
  lockTtlMs: number;
  malwareScanTimeoutMs: number;
  derivativeHookTimeoutMs: number;
  malwarePolicy: MalwarePolicy;
  issues: string[];
}

function enabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function parsePositiveBigInt(
  value: string | undefined,
  fallback: bigint,
  name: string,
  issues: string[],
  allowZero = false
): bigint {
  if (!value?.trim()) return fallback;
  try {
    const parsed = BigInt(value.trim());
    if (parsed < 0n || (!allowZero && parsed === 0n)) throw new Error();
    return parsed;
  } catch {
    issues.push(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
    return fallback;
  }
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  issues: string[]
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    issues.push(`${name} must be a positive safe integer`);
    return fallback;
  }
  return parsed;
}

function resolveExplicitRoot(
  value: string | undefined,
  name: string,
  issues: string[]
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!isAbsolute(trimmed)) {
    issues.push(`${name} must be an absolute path`);
    return null;
  }
  return resolve(trimmed);
}

function inspectDriveCredentials(env: NodeJS.ProcessEnv): {
  mode: StorageRuntimeConfig["driveCredentialMode"];
  valid: boolean;
} {
  if (env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim()) {
    return { mode: "access-token", valid: true };
  }

  const raw = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return { mode: null, valid: false };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: "service-account",
      valid:
        typeof parsed.client_email === "string" &&
        parsed.client_email.length > 0 &&
        typeof parsed.private_key === "string" &&
        parsed.private_key.length > 0,
    };
  } catch {
    return { mode: "service-account", valid: false };
  }
}

export function readStorageConfig(
  env: NodeJS.ProcessEnv = process.env
): StorageRuntimeConfig {
  const issues: string[] = [];
  const rawProvider = env.CODELIVER_STORAGE_PROVIDER?.trim().toLowerCase();
  const supportedProviders = new Set(["local", "ccnas", "google-drive", "object-store"]);
  const provider = supportedProviders.has(rawProvider ?? "")
    ? (rawProvider as StorageProviderKind)
    : "unconfigured";

  if (rawProvider && provider === "unconfigured") {
    issues.push("CODELIVER_STORAGE_PROVIDER is not supported");
  }

  const rootValue =
    provider === "local"
      ? env.CODELIVER_LOCAL_STORAGE_ROOT
      : provider === "ccnas"
        ? env.NAS_MEDIA_ROOT
        : undefined;
  const rootName =
    provider === "local" ? "CODELIVER_LOCAL_STORAGE_ROOT" : "NAS_MEDIA_ROOT";
  const filesystemRoot = resolveExplicitRoot(rootValue, rootName, issues);
  const credentials = inspectDriveCredentials(env);
  const malwarePolicy =
    env.CODELIVER_MALWARE_POLICY === "allow-local-demo"
      ? "allow-local-demo"
      : "required";

  if (malwarePolicy === "allow-local-demo" && provider !== "local") {
    issues.push("allow-local-demo malware policy is restricted to the local provider");
  }

  return {
    provider,
    providerWasExplicit: provider !== "unconfigured",
    writeEnabled: enabled(env.CODELIVER_STORAGE_WRITE_ENABLED),
    filesystemRoot,
    stateRoot: filesystemRoot ? join(filesystemRoot, ".codeliver-ingest", "control") : null,
    driveFolderId: env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null,
    driveCredentialMode: credentials.mode,
    driveCredentialsValid: credentials.valid,
    maxUploadBytes: parsePositiveBigInt(
      env.CODELIVER_STORAGE_MAX_UPLOAD_BYTES,
      DEFAULT_MAX_UPLOAD_BYTES,
      "CODELIVER_STORAGE_MAX_UPLOAD_BYTES",
      issues
    ),
    maxChunkBytes: parsePositiveBigInt(
      env.CODELIVER_STORAGE_MAX_CHUNK_BYTES,
      DEFAULT_MAX_CHUNK_BYTES,
      "CODELIVER_STORAGE_MAX_CHUNK_BYTES",
      issues
    ),
    reservedBytes: parsePositiveBigInt(
      env.CODELIVER_STORAGE_RESERVED_BYTES,
      DEFAULT_RESERVED_BYTES,
      "CODELIVER_STORAGE_RESERVED_BYTES",
      issues,
      true
    ),
    tenantQuotaBytes: parsePositiveBigInt(
      env.CODELIVER_STORAGE_TENANT_QUOTA_BYTES,
      DEFAULT_TENANT_QUOTA_BYTES,
      "CODELIVER_STORAGE_TENANT_QUOTA_BYTES",
      issues
    ),
    maxConcurrentUploads: parsePositiveInteger(
      env.CODELIVER_STORAGE_MAX_CONCURRENT_UPLOADS,
      4,
      "CODELIVER_STORAGE_MAX_CONCURRENT_UPLOADS",
      issues
    ),
    sessionTtlMs: parsePositiveInteger(
      env.CODELIVER_UPLOAD_SESSION_TTL_MS,
      7 * 24 * 60 * 60 * 1000,
      "CODELIVER_UPLOAD_SESSION_TTL_MS",
      issues
    ),
    lockTtlMs: parsePositiveInteger(
      env.CODELIVER_UPLOAD_LOCK_TTL_MS,
      2 * 60 * 1000,
      "CODELIVER_UPLOAD_LOCK_TTL_MS",
      issues
    ),
    malwareScanTimeoutMs: parsePositiveInteger(
      env.CODELIVER_MALWARE_SCAN_TIMEOUT_MS,
      DEFAULT_MALWARE_SCAN_TIMEOUT_MS,
      "CODELIVER_MALWARE_SCAN_TIMEOUT_MS",
      issues
    ),
    derivativeHookTimeoutMs: parsePositiveInteger(
      env.CODELIVER_DERIVATIVE_HOOK_TIMEOUT_MS,
      DEFAULT_DERIVATIVE_HOOK_TIMEOUT_MS,
      "CODELIVER_DERIVATIVE_HOOK_TIMEOUT_MS",
      issues
    ),
    malwarePolicy,
    issues,
  };
}

export function bigintToSafeNumber(value: bigint, name: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${name} exceeds the safe integer range`);
  }
  return Number(value);
}
