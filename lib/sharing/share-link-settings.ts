/**
 * Share links 2.0 (P22) — review-link settings model, Frame.io V2 style.
 *
 * This module is pure: no I/O, no React, no Next. Demo persistence lives in
 * share-link-store.ts; the production columns for these settings do not exist
 * yet, so nothing here pretends to be a server-side authority.
 */

export interface ShareLinkSettings {
  name: string;
  allow_approvals: boolean;
  /**
   * Honest stub: versions arrive with P19 in a later wave. The setting is
   * stored now and labeled "applies when versions exist" wherever it renders.
   */
  current_version_only: boolean;
  enable_downloading: boolean;
  /** ISO 8601 instant, or null for a link that does not expire. */
  expires_at: string | null;
  has_password: boolean;
}

export interface StoredShareLinkSettings extends ShareLinkSettings {
  /**
   * Demo-grade password fingerprint (see hashShareLinkPassword). This is NOT
   * password security — it only keeps the demo plaintext out of localStorage.
   * Production must hash server-side with a real KDF.
   */
  password_hash: string | null;
}

export interface ShareLinkSettingsInput extends ShareLinkSettings {
  /** Plaintext password from the form. Never stored; hashed or dropped. */
  password?: string | null;
  /**
   * Editing flow: when protection stays on but the password field is left
   * blank, the caller passes the current hash back so it is kept unchanged.
   */
  existing_password_hash?: string | null;
}

export type ShareLinkValidationResult =
  | { ok: true; settings: StoredShareLinkSettings }
  | { ok: false; errors: string[] };

export const SHARE_LINK_NAME_MAX = 80;
export const SHARE_LINK_PASSWORD_MIN = 4;

export const DEFAULT_SHARE_LINK_SETTINGS: StoredShareLinkSettings = {
  name: "",
  allow_approvals: true,
  current_version_only: false,
  enable_downloading: false,
  expires_at: null,
  has_password: false,
  password_hash: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseInstant(value: string): number | null {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/**
 * FNV-1a 32-bit — a trivial, deterministic fingerprint for demo links only.
 * It is deliberately prefixed so no one mistakes it for a real credential
 * hash. Do NOT reuse this for production auth.
 */
export function hashShareLinkPassword(password: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < password.length; index += 1) {
    hash ^= password.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a:${hash.toString(16).padStart(8, "0")}`;
}

/**
 * Verify a gate attempt against a stored record. Fails closed when a record
 * claims a password but carries no hash; always passes when the link has no
 * password (the gate should not render in that case).
 */
export function verifyShareLinkPassword(
  stored: Pick<StoredShareLinkSettings, "has_password" | "password_hash">,
  attempt: string,
): boolean {
  if (!stored.has_password) return true;
  if (!stored.password_hash) return false;
  return hashShareLinkPassword(attempt) === stored.password_hash;
}

export function validateShareLinkSettings(
  input: unknown,
  now: Date = new Date(),
): ShareLinkValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["Share link settings must be an object"] };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    errors.push("Share link name is required");
  } else if (name.length > SHARE_LINK_NAME_MAX) {
    errors.push(`Share link name must be ${SHARE_LINK_NAME_MAX} characters or fewer`);
  }

  for (const flag of ["allow_approvals", "current_version_only", "enable_downloading", "has_password"] as const) {
    if (typeof input[flag] !== "boolean") {
      errors.push(`${flag} must be a boolean`);
    }
  }

  let expiresAt: string | null = null;
  if (input.expires_at !== null && input.expires_at !== undefined) {
    if (typeof input.expires_at !== "string" || parseInstant(input.expires_at) === null) {
      errors.push("Expiry must be a valid date");
    } else if ((parseInstant(input.expires_at) as number) <= now.getTime()) {
      errors.push("Expiry must be in the future");
    } else {
      expiresAt = new Date(input.expires_at).toISOString();
    }
  }

  const hasPassword = input.has_password === true;
  const password =
    typeof input.password === "string" && input.password.trim().length > 0
      ? input.password
      : null;
  const existingHash =
    typeof input.existing_password_hash === "string" ? input.existing_password_hash : null;
  if (hasPassword) {
    if (!password && !existingHash) {
      errors.push("A password is required when password protection is on");
    } else if (password && password.length < SHARE_LINK_PASSWORD_MIN) {
      errors.push(`Password must be at least ${SHARE_LINK_PASSWORD_MIN} characters`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    settings: {
      name,
      allow_approvals: input.allow_approvals as boolean,
      current_version_only: input.current_version_only as boolean,
      enable_downloading: input.enable_downloading as boolean,
      expires_at: expiresAt,
      has_password: hasPassword,
      // Without password protection any stray plaintext is dropped, not kept.
      password_hash: hasPassword
        ? password
          ? hashShareLinkPassword(password)
          : existingHash
        : null,
    },
  };
}

/** An expired link is dead at the exact expiry instant — no grace period. */
export function isShareLinkExpired(
  settings: Pick<ShareLinkSettings, "expires_at">,
  now: Date = new Date(),
): boolean {
  if (settings.expires_at === null || settings.expires_at === undefined) return false;
  const expiry = parseInstant(settings.expires_at);
  if (expiry === null) return true;
  return expiry <= now.getTime();
}

/** Human countdown for the share dialog; null when the link never expires. */
export function shareExpiryCountdownLabel(
  expiresAt: string | null,
  now: Date = new Date(),
): string | null {
  if (expiresAt === null || expiresAt === undefined) return null;
  const expiry = parseInstant(expiresAt);
  if (expiry === null || expiry <= now.getTime()) return "Expired";

  const remainingMs = expiry - now.getTime();
  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes < 1) return "Expires in under a minute";
  if (minutes < 60) return `Expires in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(remainingMs / 3_600_000);
  if (hours < 24) return `Expires in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(remainingMs / 86_400_000);
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

/** Safe parse of a persisted record; returns null on any shape violation. */
export function normalizeShareLinkSettings(raw: unknown): StoredShareLinkSettings | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.name !== "string") return null;
  for (const flag of ["allow_approvals", "current_version_only", "enable_downloading", "has_password"] as const) {
    if (typeof raw[flag] !== "boolean") return null;
  }
  if (raw.expires_at !== null && typeof raw.expires_at !== "string") return null;
  if (typeof raw.expires_at === "string" && parseInstant(raw.expires_at) === null) return null;
  if (raw.password_hash !== null && typeof raw.password_hash !== "string") return null;

  return {
    name: raw.name,
    allow_approvals: raw.allow_approvals as boolean,
    current_version_only: raw.current_version_only as boolean,
    enable_downloading: raw.enable_downloading as boolean,
    expires_at: (raw.expires_at as string | null) ?? null,
    has_password: raw.has_password as boolean,
    password_hash: (raw.password_hash as string | null) ?? null,
  };
}
