import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { isAbsolute } from "node:path";
// Node's strip-types contract runner requires the source extension.
// @ts-expect-error TS5097: runtime contract tests import this module directly.
import { resolveSupabaseDataSchema } from "../../../../lib/data-authority.ts";
import {
  HEALTH_BRAND_NAME,
  HEALTH_PRODUCT_NAME,
  HEALTH_SERVICE_ID,
} from "./identity";

export type DependencyStatus = "pass" | "warn" | "fail";

export interface DependencyCheck {
  id: string;
  label: string;
  required: boolean;
  status: DependencyStatus;
  latencyMs: number;
  message: string;
}

export interface DependencySnapshot {
  status: "healthy" | "degraded" | "unhealthy";
  ready: boolean;
  service: typeof HEALTH_SERVICE_ID;
  product: typeof HEALTH_PRODUCT_NAME;
  brand: typeof HEALTH_BRAND_NAME;
  observedAt: string;
  durationMs: number;
  checks: DependencyCheck[];
}

type AccessProbe = (path: string, mode?: number) => Promise<void>;
type FetchProbe = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status">>;

export interface DependencyProbeOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  accessProbe?: AccessProbe;
  fetchProbe?: FetchProbe;
  remoteProbeTimeoutMs?: number;
}

function enabled(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function elapsed(now: () => number, started: number): number {
  return Math.max(0, now() - started);
}

class ProbeTimeoutError extends Error {
  constructor() {
    super("Dependency probe timed out");
    this.name = "ProbeTimeoutError";
  }
}

function normalizedTimeout(value: number): number {
  if (!Number.isFinite(value)) return 1500;
  return Math.max(1, Math.min(Math.floor(value), 10_000));
}

async function withProbeTimeout<T>(
  timeoutMs: number,
  probe: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProbeTimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => probe(controller.signal)), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function databaseCheck(
  env: NodeJS.ProcessEnv,
  now: () => number,
  fetchProbe: FetchProbe,
  timeoutMs: number
): Promise<DependencyCheck> {
  const started = now();
  const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const key = env.SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key) {
    return {
      id: "database",
      label: "Supabase data plane",
      required: true,
      status: "fail",
      latencyMs: elapsed(now, started),
      message: "Supabase URL or service credential is not configured",
    };
  }

  let schema: string;
  try {
    schema = resolveSupabaseDataSchema({
      audience: "server",
      environment: env.NODE_ENV,
      serverSchema: env.SUPABASE_DATA_SCHEMA,
      browserSchema: env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA,
    });
  } catch {
    return {
      id: "database",
      label: "Supabase data plane",
      required: true,
      status: "fail",
      latencyMs: elapsed(now, started),
      message: "The isolated Co-Production data authority is not configured",
    };
  }

  if (!enabled(env.CODELIVER_HEALTH_REMOTE_PROBES, true)) {
    return {
      id: "database",
      label: "Supabase data plane",
      required: true,
      status: "fail",
      latencyMs: elapsed(now, started),
      message: "Remote data plane probing is disabled; readiness is not proven",
    };
  }

  try {
    const endpoint = new URL("/rest/v1/projects?select=id&limit=1", url);
    const response = await withProbeTimeout(timeoutMs, (signal) =>
      fetchProbe(endpoint, {
        method: "HEAD",
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          "accept-profile": schema,
          "content-profile": schema,
        },
        cache: "no-store",
        signal,
      })
    );
    const reachable = response.ok || (response.status >= 300 && response.status < 400);
    return {
      id: "database",
      label: "Supabase data plane",
      required: true,
      status: reachable ? "pass" : "fail",
      latencyMs: elapsed(now, started),
      message: reachable
        ? `${schema} data authority responded`
        : `Data authority returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      id: "database",
      label: "Supabase data plane",
      required: true,
      status: "fail",
      latencyMs: elapsed(now, started),
      message:
        error instanceof ProbeTimeoutError ||
        (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))
          ? "Data plane probe timed out"
          : "Data plane probe failed",
    };
  }
}

async function storageCheck(
  env: NodeJS.ProcessEnv,
  now: () => number,
  accessProbe: AccessProbe,
  timeoutMs: number
): Promise<DependencyCheck> {
  const started = now();
  const provider = env.CODELIVER_STORAGE_PROVIDER?.trim().toLowerCase();
  const writeEnabled = enabled(env.CODELIVER_STORAGE_WRITE_ENABLED);

  if (provider === "local" || provider === "ccnas") {
    const variable = provider === "local" ? "CODELIVER_LOCAL_STORAGE_ROOT" : "NAS_MEDIA_ROOT";
    const root = env[variable]?.trim();
    if (!root || !isAbsolute(root)) {
      return {
        id: "storage",
        label: `${provider} media storage`,
        required: true,
        status: "fail",
        latencyMs: elapsed(now, started),
        message: `${variable} must be an absolute configured path`,
      };
    }
    try {
      const mode = writeEnabled ? constants.R_OK | constants.W_OK : constants.R_OK;
      await withProbeTimeout(timeoutMs, () => accessProbe(root, mode));
      return {
        id: "storage",
        label: `${provider} media storage`,
        required: true,
        status: writeEnabled ? "pass" : "warn",
        latencyMs: elapsed(now, started),
        message: writeEnabled ? "Storage root is readable and writable" : "Storage root is readable; writes are disabled",
      };
    } catch (error) {
      return {
        id: "storage",
        label: `${provider} media storage`,
        required: true,
        status: "fail",
        latencyMs: elapsed(now, started),
        message:
          error instanceof ProbeTimeoutError
            ? "Storage access probe timed out"
            : writeEnabled
              ? "Storage root is not readable and writable"
              : "Storage root is not readable",
      };
    }
  }

  if (provider === "google-drive") {
    const folder = env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    const credential = env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim() || env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
    return {
      id: "storage",
      label: "Google Drive media storage",
      required: true,
      status: "fail",
      latencyMs: elapsed(now, started),
      message:
        folder && credential
          ? "Configuration is present but write transport readiness is not proven"
          : "Google Drive folder or credential is not configured",
    };
  }

  if (provider === "object-store") {
    return {
      id: "storage",
      label: "Object media storage",
      required: true,
      status: "fail",
      latencyMs: elapsed(now, started),
      message: "Object storage write transport readiness is not proven",
    };
  }

  return {
    id: "storage",
    label: "Media storage",
    required: true,
    status: "fail",
    latencyMs: elapsed(now, started),
    message: "CODELIVER_STORAGE_PROVIDER is not configured",
  };
}

function notificationCheck(env: NodeJS.ProcessEnv): DependencyCheck {
  const required = enabled(env.CODELIVER_REQUIRE_NOTIFICATIONS);
  const configured = Boolean(env.RESEND_API_KEY?.trim());
  return {
    id: "notifications",
    label: "Email delivery",
    required,
    status: configured ? "pass" : required ? "fail" : "warn",
    latencyMs: 0,
    message: configured ? "Email provider is configured" : required ? "Required email provider is not configured" : "Email provider is optional and not configured",
  };
}

function validEncryptionKey(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return false;
  if (/^[0-9a-f]{64}$/i.test(normalized)) return true;
  try {
    return Buffer.from(normalized, "base64url").length === 32;
  } catch {
    return false;
  }
}

function credentialEncryptionCheck(env: NodeJS.ProcessEnv): DependencyCheck {
  const isolated =
    env.NODE_ENV === "production" ||
    env.SUPABASE_DATA_SCHEMA === "co_production" ||
    env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA === "co_production";
  if (!isolated) {
    return {
      id: "credential-encryption",
      label: "Credential envelope keys",
      required: false,
      status: "pass",
      latencyMs: 0,
      message: "Legacy local authority does not persist isolated credentials",
    };
  }

  const tokenKey = validEncryptionKey(env.CO_PRODUCTION_TOKEN_ENCRYPTION_KEY);
  const webhookKey = validEncryptionKey(
    env.CO_PRODUCTION_WEBHOOK_SECRET_ENCRYPTION_KEY,
  );
  const analyticsKey = validEncryptionKey(
    env.CO_PRODUCTION_ANALYTICS_HASH_KEY,
  );
  return {
    id: "credential-encryption",
    label: "Credential and privacy keys",
    required: true,
    status: tokenKey && webhookKey && analyticsKey ? "pass" : "fail",
    latencyMs: 0,
    message:
      tokenKey && webhookKey && analyticsKey
        ? "Invite, webhook, and analytics privacy keys are configured"
        : "A required invite, webhook, or analytics privacy key is missing or invalid",
  };
}

export async function collectDependencySnapshot(
  options: DependencyProbeOptions = {}
): Promise<DependencySnapshot> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const accessProbe = options.accessProbe ?? access;
  const fetchProbe = options.fetchProbe ?? fetch;
  const timeoutMs = normalizedTimeout(options.remoteProbeTimeoutMs ?? 1500);
  const started = now();
  const checks = await Promise.all([
    databaseCheck(env, now, fetchProbe, timeoutMs),
    storageCheck(env, now, accessProbe, timeoutMs),
    Promise.resolve(notificationCheck(env)),
    Promise.resolve(credentialEncryptionCheck(env)),
  ]);
  const requiredFailure = checks.some((check) => check.required && check.status === "fail");
  const degraded = checks.some((check) => check.status === "warn" || check.status === "fail");
  return {
    status: requiredFailure ? "unhealthy" : degraded ? "degraded" : "healthy",
    ready: !requiredFailure,
    service: HEALTH_SERVICE_ID,
    product: HEALTH_PRODUCT_NAME,
    brand: HEALTH_BRAND_NAME,
    observedAt: new Date(now()).toISOString(),
    durationMs: elapsed(now, started),
    checks,
  };
}
