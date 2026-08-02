export const IDENTITY_BODY_LIMIT_BYTES = 32 * 1024;
export const IDENTITY_VERSION_MAX = 2_147_483_647;

export const IDENTITY_LOCALES = ["en-US", "en-GB", "es-US"] as const;
export const IDENTITY_TIME_ZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
] as const;
export const IDENTITY_WEEK_STARTS = ["sunday", "monday"] as const;
export const IDENTITY_THEMES = ["system", "light", "dark"] as const;
export const IDENTITY_DENSITIES = ["comfortable", "compact"] as const;
export const IDENTITY_LANDING_PAGES = ["projects", "reviews", "activity"] as const;
export const IDENTITY_MFA_REQUIREMENTS = ["optional", "administrators", "everyone"] as const;
export const IDENTITY_PROVIDER_STATES = ["not_configured", "preview", "verified"] as const;
export const IDENTITY_SESSION_IDLE_MINUTES = [15, 30, 60, 120, 240] as const;
export const IDENTITY_SESSION_MAX_DAYS = [1, 7, 14, 30, 90] as const;
export const IDENTITY_CAPABILITIES = [
  "organization.manage",
  "workspace.manage",
  "policy.manage",
  "brand.manage",
  "session.manage",
  "audit.export",
  "feature_flags.manage",
] as const;
export const IDENTITY_FEATURE_FLAGS = [
  "identity.policy_preview",
  "identity.audit_export",
  "branding.version_history",
] as const;

type IdentityLocale = (typeof IDENTITY_LOCALES)[number];
type IdentityTimeZone = (typeof IDENTITY_TIME_ZONES)[number];
type IdentityWeekStart = (typeof IDENTITY_WEEK_STARTS)[number];
type IdentityTheme = (typeof IDENTITY_THEMES)[number];
type IdentityDensity = (typeof IDENTITY_DENSITIES)[number];
type IdentityLandingPage = (typeof IDENTITY_LANDING_PAGES)[number];
type IdentityMfaRequirement = (typeof IDENTITY_MFA_REQUIREMENTS)[number];
type IdentityProviderState = (typeof IDENTITY_PROVIDER_STATES)[number];
type IdentitySessionIdleMinutes = (typeof IDENTITY_SESSION_IDLE_MINUTES)[number];
type IdentitySessionMaxDays = (typeof IDENTITY_SESSION_MAX_DAYS)[number];
type IdentityCapability = (typeof IDENTITY_CAPABILITIES)[number];
type IdentityFeatureFlag = (typeof IDENTITY_FEATURE_FLAGS)[number];

export interface IdentityProfilePatch {
  firstName?: string;
  lastName?: string;
  title?: string;
  locale?: IdentityLocale;
  timeZone?: IdentityTimeZone;
  weekStartsOn?: IdentityWeekStart;
  highContrast?: boolean;
  reviewerColor?: string;
}

export interface IdentityPreferencePatch {
  activeTeamId?: string | null;
  theme?: IdentityTheme;
  density?: IdentityDensity;
  reduceMotion?: boolean;
  defaultLandingPage?: IdentityLandingPage;
}

export interface IdentityPolicyPatch {
  mfaRequirement?: IdentityMfaRequirement;
  sessionIdleMinutes?: IdentitySessionIdleMinutes;
  sessionMaxDays?: IdentitySessionMaxDays;
  passwordAuthenticationEnabled?: boolean;
  adminApprovalRequired?: boolean;
  ssoStatus?: IdentityProviderState;
  scimStatus?: IdentityProviderState;
}

export interface IdentityBrandValues {
  displayName: string;
  playerLabel: string;
  primaryColor: string;
  logoAssetId: string | null;
  cornerRadius: number;
  showPoweredBy: boolean;
}

export type IdentityMutation =
  | {
      action: "profile.update";
      expectedVersion: number;
      patch: IdentityProfilePatch;
    }
  | {
      action: "preferences.update";
      expectedVersion: number;
      patch: IdentityPreferencePatch;
    }
  | {
      action: "policy.update";
      teamId: string;
      expectedVersion: number;
      patch: IdentityPolicyPatch;
    }
  | {
      action: "membership.capabilities.update";
      teamId: string;
      targetUserId: string;
      expectedVersion: number;
      capabilities: IdentityCapability[];
    }
  | {
      action: "feature-flag.update";
      teamId: string;
      projectId: string | null;
      expectedVersion: number;
      key: IdentityFeatureFlag;
      enabled: boolean;
    }
  | {
      action: "brand.revision.create";
      teamId: string;
      projectId: string | null;
      scope: "organization" | "project";
      expectedPublishedVersion: number;
      idempotencyKey: string;
      values: IdentityBrandValues;
    }
  | {
      action: "brand.revision.publish";
      teamId: string;
      revisionId: string;
      expectedPublishedVersion: number;
    };

export type IdentityMutationParseResult =
  | { ok: true; value: IdentityMutation }
  | { ok: false; error: string; field?: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isOneOf<T extends string | number>(value: unknown, allowed: readonly T[]): value is T {
  return allowed.includes(value as T);
}

function isVersion(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= IDENTITY_VERSION_MAX;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function boundedString(value: unknown, maximum: number, allowEmpty = false) {
  if (typeof value !== "string" || value.length > maximum) return false;
  return allowEmpty || value.trim().length > 0;
}

function parseEnvelope(
  input: unknown,
  action: IdentityMutation["action"],
  keys: readonly string[],
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string; field?: string } {
  if (!isRecord(input)) return { ok: false, error: "Request body must be an object" };
  if (input.action !== action) return { ok: false, error: "Unknown identity action", field: "action" };
  if (!hasOnlyKeys(input, ["action", ...keys])) {
    return { ok: false, error: "Request contains an unknown field" };
  }
  return { ok: true, body: input };
}

function parsePatch<T extends object>(
  value: unknown,
  allowed: readonly string[],
): { ok: true; patch: T } | { ok: false; error: string; field?: string } {
  if (!isRecord(value)) return { ok: false, error: "patch must be an object", field: "patch" };
  if (!hasOnlyKeys(value, allowed)) {
    return { ok: false, error: "patch contains an unknown field", field: "patch" };
  }
  if (Object.keys(value).length === 0) {
    return { ok: false, error: "patch must change at least one field", field: "patch" };
  }
  return { ok: true, patch: value as unknown as T };
}

function parseProfile(input: unknown): IdentityMutationParseResult {
  const envelope = parseEnvelope(input, "profile.update", ["expectedVersion", "patch"]);
  if (!envelope.ok) return envelope;
  if (!isVersion(envelope.body.expectedVersion)) {
    return { ok: false, error: "expectedVersion is invalid", field: "expectedVersion" };
  }
  const parsed = parsePatch<IdentityProfilePatch>(envelope.body.patch, [
    "firstName",
    "lastName",
    "title",
    "locale",
    "timeZone",
    "weekStartsOn",
    "highContrast",
    "reviewerColor",
  ]);
  if (!parsed.ok) return parsed;
  const patch = parsed.patch;
  if (patch.firstName !== undefined && !boundedString(patch.firstName, 80)) {
    return { ok: false, error: "firstName is invalid", field: "patch.firstName" };
  }
  if (patch.lastName !== undefined && !boundedString(patch.lastName, 80)) {
    return { ok: false, error: "lastName is invalid", field: "patch.lastName" };
  }
  if (patch.title !== undefined && !boundedString(patch.title, 120, true)) {
    return { ok: false, error: "title is invalid", field: "patch.title" };
  }
  if (patch.locale !== undefined && !isOneOf(patch.locale, IDENTITY_LOCALES)) {
    return { ok: false, error: "locale is invalid", field: "patch.locale" };
  }
  if (patch.timeZone !== undefined && !isOneOf(patch.timeZone, IDENTITY_TIME_ZONES)) {
    return { ok: false, error: "timeZone is invalid", field: "patch.timeZone" };
  }
  if (patch.weekStartsOn !== undefined && !isOneOf(patch.weekStartsOn, IDENTITY_WEEK_STARTS)) {
    return { ok: false, error: "weekStartsOn is invalid", field: "patch.weekStartsOn" };
  }
  if (patch.highContrast !== undefined && typeof patch.highContrast !== "boolean") {
    return { ok: false, error: "highContrast is invalid", field: "patch.highContrast" };
  }
  if (patch.reviewerColor !== undefined && !HEX_COLOR_PATTERN.test(patch.reviewerColor)) {
    return { ok: false, error: "reviewerColor is invalid", field: "patch.reviewerColor" };
  }
  return {
    ok: true,
    value: {
      action: "profile.update",
      expectedVersion: envelope.body.expectedVersion,
      patch,
    },
  };
}

function parsePreferences(input: unknown): IdentityMutationParseResult {
  const envelope = parseEnvelope(input, "preferences.update", ["expectedVersion", "patch"]);
  if (!envelope.ok) return envelope;
  if (!isVersion(envelope.body.expectedVersion)) {
    return { ok: false, error: "expectedVersion is invalid", field: "expectedVersion" };
  }
  const parsed = parsePatch<IdentityPreferencePatch>(envelope.body.patch, [
    "activeTeamId",
    "theme",
    "density",
    "reduceMotion",
    "defaultLandingPage",
  ]);
  if (!parsed.ok) return parsed;
  const patch = parsed.patch;
  if (patch.activeTeamId !== undefined && patch.activeTeamId !== null && !isUuid(patch.activeTeamId)) {
    return { ok: false, error: "activeTeamId is invalid", field: "patch.activeTeamId" };
  }
  if (patch.theme !== undefined && !isOneOf(patch.theme, IDENTITY_THEMES)) {
    return { ok: false, error: "theme is invalid", field: "patch.theme" };
  }
  if (patch.density !== undefined && !isOneOf(patch.density, IDENTITY_DENSITIES)) {
    return { ok: false, error: "density is invalid", field: "patch.density" };
  }
  if (patch.reduceMotion !== undefined && typeof patch.reduceMotion !== "boolean") {
    return { ok: false, error: "reduceMotion is invalid", field: "patch.reduceMotion" };
  }
  if (
    patch.defaultLandingPage !== undefined &&
    !isOneOf(patch.defaultLandingPage, IDENTITY_LANDING_PAGES)
  ) {
    return { ok: false, error: "defaultLandingPage is invalid", field: "patch.defaultLandingPage" };
  }
  return {
    ok: true,
    value: {
      action: "preferences.update",
      expectedVersion: envelope.body.expectedVersion,
      patch,
    },
  };
}

function parsePolicy(input: unknown): IdentityMutationParseResult {
  const envelope = parseEnvelope(input, "policy.update", ["teamId", "expectedVersion", "patch"]);
  if (!envelope.ok) return envelope;
  if (!isUuid(envelope.body.teamId)) {
    return { ok: false, error: "teamId is invalid", field: "teamId" };
  }
  if (!isVersion(envelope.body.expectedVersion)) {
    return { ok: false, error: "expectedVersion is invalid", field: "expectedVersion" };
  }
  const parsed = parsePatch<IdentityPolicyPatch>(envelope.body.patch, [
    "mfaRequirement",
    "sessionIdleMinutes",
    "sessionMaxDays",
    "passwordAuthenticationEnabled",
    "adminApprovalRequired",
    "ssoStatus",
    "scimStatus",
  ]);
  if (!parsed.ok) return parsed;
  const patch = parsed.patch;
  if (patch.mfaRequirement !== undefined && !isOneOf(patch.mfaRequirement, IDENTITY_MFA_REQUIREMENTS)) {
    return { ok: false, error: "mfaRequirement is invalid", field: "patch.mfaRequirement" };
  }
  if (
    patch.sessionIdleMinutes !== undefined &&
    !isOneOf(patch.sessionIdleMinutes, IDENTITY_SESSION_IDLE_MINUTES)
  ) {
    return { ok: false, error: "sessionIdleMinutes is invalid", field: "patch.sessionIdleMinutes" };
  }
  if (patch.sessionMaxDays !== undefined && !isOneOf(patch.sessionMaxDays, IDENTITY_SESSION_MAX_DAYS)) {
    return { ok: false, error: "sessionMaxDays is invalid", field: "patch.sessionMaxDays" };
  }
  for (const field of ["passwordAuthenticationEnabled", "adminApprovalRequired"] as const) {
    if (patch[field] !== undefined && typeof patch[field] !== "boolean") {
      return { ok: false, error: `${field} is invalid`, field: `patch.${field}` };
    }
  }
  for (const field of ["ssoStatus", "scimStatus"] as const) {
    if (patch[field] !== undefined && !isOneOf(patch[field], IDENTITY_PROVIDER_STATES)) {
      return { ok: false, error: `${field} is invalid`, field: `patch.${field}` };
    }
  }
  return {
    ok: true,
    value: {
      action: "policy.update",
      teamId: envelope.body.teamId,
      expectedVersion: envelope.body.expectedVersion,
      patch,
    },
  };
}

function parseCapabilities(input: unknown): IdentityMutationParseResult {
  const envelope = parseEnvelope(input, "membership.capabilities.update", [
    "teamId",
    "targetUserId",
    "expectedVersion",
    "capabilities",
  ]);
  if (!envelope.ok) return envelope;
  if (!isUuid(envelope.body.teamId)) return { ok: false, error: "teamId is invalid", field: "teamId" };
  if (!isUuid(envelope.body.targetUserId)) {
    return { ok: false, error: "targetUserId is invalid", field: "targetUserId" };
  }
  if (!isVersion(envelope.body.expectedVersion)) {
    return { ok: false, error: "expectedVersion is invalid", field: "expectedVersion" };
  }
  if (
    !Array.isArray(envelope.body.capabilities) ||
    envelope.body.capabilities.length > IDENTITY_CAPABILITIES.length ||
    !envelope.body.capabilities.every((value) => isOneOf(value, IDENTITY_CAPABILITIES))
  ) {
    return { ok: false, error: "capabilities are invalid", field: "capabilities" };
  }
  const capabilities = [...new Set(envelope.body.capabilities as IdentityCapability[])].sort();
  return {
    ok: true,
    value: {
      action: "membership.capabilities.update",
      teamId: envelope.body.teamId,
      targetUserId: envelope.body.targetUserId,
      expectedVersion: envelope.body.expectedVersion,
      capabilities,
    },
  };
}

function parseFeatureFlag(input: unknown): IdentityMutationParseResult {
  const envelope = parseEnvelope(input, "feature-flag.update", [
    "teamId",
    "projectId",
    "expectedVersion",
    "key",
    "enabled",
  ]);
  if (!envelope.ok) return envelope;
  if (!isUuid(envelope.body.teamId)) return { ok: false, error: "teamId is invalid", field: "teamId" };
  if (envelope.body.projectId !== null && !isUuid(envelope.body.projectId)) {
    return { ok: false, error: "projectId is invalid", field: "projectId" };
  }
  if (!isVersion(envelope.body.expectedVersion)) {
    return { ok: false, error: "expectedVersion is invalid", field: "expectedVersion" };
  }
  if (!isOneOf(envelope.body.key, IDENTITY_FEATURE_FLAGS)) {
    return { ok: false, error: "key is invalid", field: "key" };
  }
  if (typeof envelope.body.enabled !== "boolean") {
    return { ok: false, error: "enabled is invalid", field: "enabled" };
  }
  return {
    ok: true,
    value: {
      action: "feature-flag.update",
      teamId: envelope.body.teamId,
      projectId: envelope.body.projectId,
      expectedVersion: envelope.body.expectedVersion,
      key: envelope.body.key,
      enabled: envelope.body.enabled,
    },
  };
}

function parseBrandValues(value: unknown) {
  if (!isRecord(value)) return { ok: false as const, error: "values must be an object", field: "values" };
  if (
    !hasOnlyKeys(value, [
      "displayName",
      "playerLabel",
      "primaryColor",
      "logoAssetId",
      "cornerRadius",
      "showPoweredBy",
    ])
  ) {
    return { ok: false as const, error: "values contain an unknown field", field: "values" };
  }
  if (!boundedString(value.displayName, 80)) {
    return { ok: false as const, error: "displayName is invalid", field: "values.displayName" };
  }
  if (!boundedString(value.playerLabel, 120)) {
    return { ok: false as const, error: "playerLabel is invalid", field: "values.playerLabel" };
  }
  if (typeof value.primaryColor !== "string" || !HEX_COLOR_PATTERN.test(value.primaryColor)) {
    return { ok: false as const, error: "primaryColor is invalid", field: "values.primaryColor" };
  }
  if (value.logoAssetId !== null && !isUuid(value.logoAssetId)) {
    return { ok: false as const, error: "logoAssetId is invalid", field: "values.logoAssetId" };
  }
  if (!Number.isInteger(value.cornerRadius) || Number(value.cornerRadius) < 0 || Number(value.cornerRadius) > 16) {
    return { ok: false as const, error: "cornerRadius is invalid", field: "values.cornerRadius" };
  }
  if (typeof value.showPoweredBy !== "boolean") {
    return { ok: false as const, error: "showPoweredBy is invalid", field: "values.showPoweredBy" };
  }
  return { ok: true as const, value: value as unknown as IdentityBrandValues };
}

function parseBrandCreate(input: unknown): IdentityMutationParseResult {
  const envelope = parseEnvelope(input, "brand.revision.create", [
    "teamId",
    "projectId",
    "scope",
    "expectedPublishedVersion",
    "idempotencyKey",
    "values",
  ]);
  if (!envelope.ok) return envelope;
  if (!isUuid(envelope.body.teamId)) return { ok: false, error: "teamId is invalid", field: "teamId" };
  if (envelope.body.scope !== "organization" && envelope.body.scope !== "project") {
    return { ok: false, error: "scope is invalid", field: "scope" };
  }
  if (envelope.body.scope === "project" && !isUuid(envelope.body.projectId)) {
    return { ok: false, error: "projectId is required for project scope", field: "projectId" };
  }
  if (envelope.body.scope === "organization" && envelope.body.projectId !== null) {
    return { ok: false, error: "projectId must be null for organization scope", field: "projectId" };
  }
  if (!isVersion(envelope.body.expectedPublishedVersion)) {
    return { ok: false, error: "expectedPublishedVersion is invalid", field: "expectedPublishedVersion" };
  }
  if (typeof envelope.body.idempotencyKey !== "string" || !IDEMPOTENCY_PATTERN.test(envelope.body.idempotencyKey)) {
    return { ok: false, error: "idempotencyKey is invalid", field: "idempotencyKey" };
  }
  const values = parseBrandValues(envelope.body.values);
  if (!values.ok) return values;
  return {
    ok: true,
    value: {
      action: "brand.revision.create",
      teamId: envelope.body.teamId,
      projectId: envelope.body.projectId as string | null,
      scope: envelope.body.scope,
      expectedPublishedVersion: envelope.body.expectedPublishedVersion,
      idempotencyKey: envelope.body.idempotencyKey,
      values: values.value,
    },
  };
}

function parseBrandPublish(input: unknown): IdentityMutationParseResult {
  const envelope = parseEnvelope(input, "brand.revision.publish", [
    "teamId",
    "revisionId",
    "expectedPublishedVersion",
  ]);
  if (!envelope.ok) return envelope;
  if (!isUuid(envelope.body.teamId)) return { ok: false, error: "teamId is invalid", field: "teamId" };
  if (!isUuid(envelope.body.revisionId)) {
    return { ok: false, error: "revisionId is invalid", field: "revisionId" };
  }
  if (!isVersion(envelope.body.expectedPublishedVersion)) {
    return { ok: false, error: "expectedPublishedVersion is invalid", field: "expectedPublishedVersion" };
  }
  return {
    ok: true,
    value: {
      action: "brand.revision.publish",
      teamId: envelope.body.teamId,
      revisionId: envelope.body.revisionId,
      expectedPublishedVersion: envelope.body.expectedPublishedVersion,
    },
  };
}

export function parseIdentityMutation(input: unknown): IdentityMutationParseResult {
  if (!isRecord(input) || typeof input.action !== "string") {
    return { ok: false, error: "Identity action is required", field: "action" };
  }
  switch (input.action) {
    case "profile.update":
      return parseProfile(input);
    case "preferences.update":
      return parsePreferences(input);
    case "policy.update":
      return parsePolicy(input);
    case "membership.capabilities.update":
      return parseCapabilities(input);
    case "feature-flag.update":
      return parseFeatureFlag(input);
    case "brand.revision.create":
      return parseBrandCreate(input);
    case "brand.revision.publish":
      return parseBrandPublish(input);
    default:
      return { ok: false, error: "Unknown identity action", field: "action" };
  }
}

export function identityRpcCall(mutation: IdentityMutation): {
  functionName: string;
  args: Record<string, unknown>;
} {
  switch (mutation.action) {
    case "profile.update":
      return {
        functionName: "update_identity_profile",
        args: { p_expected_version: mutation.expectedVersion, p_patch: mutation.patch },
      };
    case "preferences.update":
      return {
        functionName: "update_identity_preferences",
        args: { p_expected_version: mutation.expectedVersion, p_patch: mutation.patch },
      };
    case "policy.update":
      return {
        functionName: "update_team_identity_policy",
        args: {
          p_team_id: mutation.teamId,
          p_expected_version: mutation.expectedVersion,
          p_patch: mutation.patch,
        },
      };
    case "membership.capabilities.update":
      return {
        functionName: "update_team_member_capabilities",
        args: {
          p_team_id: mutation.teamId,
          p_target_user_id: mutation.targetUserId,
          p_expected_version: mutation.expectedVersion,
          p_capabilities: mutation.capabilities,
        },
      };
    case "feature-flag.update":
      return {
        functionName: "update_team_feature_flag",
        args: {
          p_team_id: mutation.teamId,
          p_project_id: mutation.projectId,
          p_expected_version: mutation.expectedVersion,
          p_key: mutation.key,
          p_enabled: mutation.enabled,
        },
      };
    case "brand.revision.create":
      return {
        functionName: "create_team_brand_revision",
        args: {
          p_team_id: mutation.teamId,
          p_project_id: mutation.projectId,
          p_scope: mutation.scope,
          p_expected_published_version: mutation.expectedPublishedVersion,
          p_idempotency_key: mutation.idempotencyKey,
          p_values: mutation.values,
        },
      };
    case "brand.revision.publish":
      return {
        functionName: "publish_team_brand_revision",
        args: {
          p_team_id: mutation.teamId,
          p_revision_id: mutation.revisionId,
          p_expected_published_version: mutation.expectedPublishedVersion,
        },
      };
  }
}

export function normalizeIdentityTeamId(value: string | null): string | null | undefined {
  if (value === null || value.trim() === "") return null;
  return isUuid(value) ? value.toLowerCase() : undefined;
}
