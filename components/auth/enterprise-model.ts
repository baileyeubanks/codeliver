export const ENTERPRISE_IDENTITY_SCHEMA_VERSION = 2 as const;
export const ENTERPRISE_IDENTITY_STORAGE_KEY = "co-deliver.identity-governance.v2";

export const CURRENT_DEMO_USER_ID = "user-bailey";
export const CURRENT_DEMO_ORGANIZATION_ID = "org-content-coop";

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";
export type GovernanceCapability =
  | "organization.manage"
  | "workspace.manage"
  | "policy.manage"
  | "brand.manage"
  | "session.manage"
  | "audit.export"
  | "feature_flags.manage";

export type FeatureFlagKey =
  | "identity.policy_preview"
  | "identity.audit_export"
  | "branding.version_history";

export type MfaRequirement = "optional" | "administrators" | "everyone";
export type IdentityProviderStatus = "not_configured" | "preview" | "verified";

export interface EnterpriseProfile {
  firstName: string;
  lastName: string;
  title: string;
  locale: "en-US" | "en-GB" | "es-US";
  timeZone: "America/Chicago" | "America/New_York" | "America/Los_Angeles" | "UTC";
  weekStartsOn: "sunday" | "monday";
  highContrast: boolean;
}

export interface EnterpriseOrganization {
  id: string;
  displayName: string;
  slug: string;
  dataRegion: "us-central";
  verifiedDomains: string[];
}

export interface EnterpriseWorkspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: "active" | "archived";
}

export interface EnterpriseMembership {
  id: string;
  userId: string;
  organizationId: string;
  displayName: string;
  email: string;
  role: OrganizationRole;
  delegatedCapabilities: GovernanceCapability[];
}

export interface EnterpriseAccessPolicy {
  organizationId: string;
  mfaRequirement: MfaRequirement;
  sessionIdleMinutes: 15 | 30 | 60 | 120 | 240;
  sessionMaxDays: 1 | 7 | 14 | 30 | 90;
  passwordAuthenticationEnabled: boolean;
  adminApprovalRequired: boolean;
  ssoStatus: IdentityProviderStatus;
  scimStatus: IdentityProviderStatus;
}

export interface EnterpriseSession {
  id: string;
  userId: string;
  organizationId: string;
  workspaceId: string;
  device: string;
  location: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
  revokedAt: string | null;
}

export interface EnterpriseFeatureFlag {
  key: FeatureFlagKey;
  organizationId: string;
  workspaceId: string | null;
  enabled: boolean;
}

export interface EnterpriseAuditEvent {
  id: string;
  organizationId: string;
  actorId: string;
  action: string;
  target: string;
  createdAt: string;
  mode: "demo";
}

export interface EnterpriseIdentityState {
  schemaVersion: typeof ENTERPRISE_IDENTITY_SCHEMA_VERSION;
  currentUserId: string;
  activeOrganizationId: string;
  activeWorkspaceId: string;
  profile: EnterpriseProfile;
  organizations: EnterpriseOrganization[];
  workspaces: EnterpriseWorkspace[];
  memberships: EnterpriseMembership[];
  policies: EnterpriseAccessPolicy[];
  sessions: EnterpriseSession[];
  featureFlags: EnterpriseFeatureFlag[];
  audit: EnterpriseAuditEvent[];
}

export interface EnterpriseRestoreResult {
  state: EnterpriseIdentityState;
  migrated: boolean;
  recovered: boolean;
}

export interface EnterpriseMutationResult {
  state: EnterpriseIdentityState;
  changed: boolean;
  reason: "ok" | "forbidden" | "invalid" | "not_found" | "current_session" | "sso_required";
}

const ALL_CAPABILITIES: GovernanceCapability[] = [
  "organization.manage",
  "workspace.manage",
  "policy.manage",
  "brand.manage",
  "session.manage",
  "audit.export",
  "feature_flags.manage",
];

const ADMIN_CAPABILITIES: GovernanceCapability[] = [
  "workspace.manage",
  "brand.manage",
  "session.manage",
  "audit.export",
];

const DELEGATABLE_CAPABILITIES: GovernanceCapability[] = [
  "policy.manage",
  "brand.manage",
  "session.manage",
  "audit.export",
  "feature_flags.manage",
];

const FEATURE_FLAG_KEYS: FeatureFlagKey[] = [
  "identity.policy_preview",
  "identity.audit_export",
  "branding.version_history",
];

const MFA_REQUIREMENTS: MfaRequirement[] = ["optional", "administrators", "everyone"];
const SESSION_IDLE_OPTIONS = [15, 30, 60, 120, 240] as const;
const SESSION_MAX_OPTIONS = [1, 7, 14, 30, 90] as const;
const LOCALES: EnterpriseProfile["locale"][] = ["en-US", "en-GB", "es-US"];
const TIME_ZONES: EnterpriseProfile["timeZone"][] = [
  "America/Chicago",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function isOneOf<T extends string | number>(value: unknown, options: readonly T[]): value is T {
  return options.includes(value as T);
}

function appendAudit(
  state: EnterpriseIdentityState,
  action: string,
  target: string,
  now: string,
): EnterpriseIdentityState {
  const event: EnterpriseAuditEvent = {
    id: `audit-${Date.parse(now) || 0}-${state.audit.length + 1}`,
    organizationId: state.activeOrganizationId,
    actorId: state.currentUserId,
    action,
    target,
    createdAt: now,
    mode: "demo",
  };

  return { ...state, audit: [event, ...state.audit].slice(0, 100) };
}

function result(
  state: EnterpriseIdentityState,
  changed: boolean,
  reason: EnterpriseMutationResult["reason"],
): EnterpriseMutationResult {
  return { state, changed, reason };
}

export function createEnterpriseIdentityState(): EnterpriseIdentityState {
  return {
    schemaVersion: ENTERPRISE_IDENTITY_SCHEMA_VERSION,
    currentUserId: CURRENT_DEMO_USER_ID,
    activeOrganizationId: CURRENT_DEMO_ORGANIZATION_ID,
    activeWorkspaceId: "workspace-co-deliver",
    profile: {
      firstName: "Bailey",
      lastName: "Eubanks",
      title: "Executive producer",
      locale: "en-US",
      timeZone: "America/Chicago",
      weekStartsOn: "sunday",
      highContrast: false,
    },
    organizations: [
      {
        id: CURRENT_DEMO_ORGANIZATION_ID,
        displayName: "Content Co-op",
        slug: "content-co-op",
        dataRegion: "us-central",
        verifiedDomains: ["contentco-op.com"],
      },
    ],
    workspaces: [
      {
        id: "workspace-co-deliver",
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        name: "Co‑VideoPro",
        slug: "co-deliver",
        status: "active",
      },
      {
        id: "workspace-executive-review",
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        name: "Executive reviews",
        slug: "executive-reviews",
        status: "active",
      },
    ],
    memberships: [
      {
        id: "membership-bailey",
        userId: CURRENT_DEMO_USER_ID,
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        displayName: "Bailey Eubanks",
    email: "owner@example.com",
        role: "owner",
        delegatedCapabilities: [],
      },
      {
        id: "membership-jordan",
        userId: "user-jordan",
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        displayName: "Jordan Lee",
        email: "jordan@contentco-op.com",
        role: "admin",
        delegatedCapabilities: ["brand.manage", "audit.export"],
      },
      {
        id: "membership-alex",
        userId: "user-alex",
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        displayName: "Alex Morgan",
        email: "alex@contentco-op.com",
        role: "member",
        delegatedCapabilities: [],
      },
    ],
    policies: [
      {
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        mfaRequirement: "administrators",
        sessionIdleMinutes: 60,
        sessionMaxDays: 14,
        passwordAuthenticationEnabled: true,
        adminApprovalRequired: true,
        ssoStatus: "not_configured",
        scimStatus: "not_configured",
      },
    ],
    sessions: [
      {
        id: "session-current",
        userId: CURRENT_DEMO_USER_ID,
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        workspaceId: "workspace-co-deliver",
        device: "Chrome on MacBook Pro",
        location: "Chicago, IL",
        createdAt: "2026-07-14T19:00:00.000Z",
        lastActiveAt: "2026-07-15T02:45:00.000Z",
        current: true,
        revokedAt: null,
      },
      {
        id: "session-studio",
        userId: CURRENT_DEMO_USER_ID,
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        workspaceId: "workspace-co-deliver",
        device: "Safari on Studio Mac",
        location: "Chicago, IL",
        createdAt: "2026-07-11T14:20:00.000Z",
        lastActiveAt: "2026-07-14T22:10:00.000Z",
        current: false,
        revokedAt: null,
      },
      {
        id: "session-mobile",
        userId: CURRENT_DEMO_USER_ID,
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        workspaceId: "workspace-executive-review",
        device: "Mobile Safari on iPhone",
        location: "Austin, TX",
        createdAt: "2026-07-07T11:00:00.000Z",
        lastActiveAt: "2026-07-13T17:05:00.000Z",
        current: false,
        revokedAt: null,
      },
    ],
    featureFlags: [
      {
        key: "identity.policy_preview",
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        workspaceId: null,
        enabled: true,
      },
      {
        key: "identity.audit_export",
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        workspaceId: null,
        enabled: true,
      },
      {
        key: "branding.version_history",
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        workspaceId: "workspace-co-deliver",
        enabled: true,
      },
    ],
    audit: [
      {
        id: "audit-seed-1",
        organizationId: CURRENT_DEMO_ORGANIZATION_ID,
        actorId: CURRENT_DEMO_USER_ID,
        action: "identity.demo_initialized",
        target: "workspace-co-deliver",
        createdAt: "2026-07-14T19:00:00.000Z",
        mode: "demo",
      },
    ],
  };
}

function restoreMutableState(
  candidate: Record<string, unknown>,
  base: EnterpriseIdentityState,
): EnterpriseIdentityState {
  const profile = isRecord(candidate.profile) ? candidate.profile : {};
  const organizations = Array.isArray(candidate.organizations) ? candidate.organizations : [];
  const workspaces = Array.isArray(candidate.workspaces) ? candidate.workspaces : [];
  const policies = Array.isArray(candidate.policies) ? candidate.policies : [];
  const sessions = Array.isArray(candidate.sessions) ? candidate.sessions : [];
  const memberships = Array.isArray(candidate.memberships) ? candidate.memberships : [];
  const featureFlags = Array.isArray(candidate.featureFlags) ? candidate.featureFlags : [];
  const audit = Array.isArray(candidate.audit) ? candidate.audit : [];

  const savedOrganization = organizations.find(
    (item) => isRecord(item) && item.id === CURRENT_DEMO_ORGANIZATION_ID,
  );

  const restoredWorkspaces = base.workspaces.map((workspace) => {
    const saved = workspaces.find(
      (item) => isRecord(item) && item.id === workspace.id && item.organizationId === workspace.organizationId,
    );
    if (!isRecord(saved)) return workspace;
    const restoredName = safeString(saved.name, workspace.name, 72);
    return {
      ...workspace,
      name:
        workspace.id === "workspace-co-deliver" && (restoredName === "Co-Deliver" || restoredName === "Co‑VideoPro")
          ? workspace.name
          : restoredName,
    };
  });

  const savedPolicy = policies.find(
    (item) => isRecord(item) && item.organizationId === CURRENT_DEMO_ORGANIZATION_ID,
  );
  const basePolicy = base.policies[0];
  const restoredPolicy: EnterpriseAccessPolicy = isRecord(savedPolicy)
    ? {
        ...basePolicy,
        mfaRequirement: isOneOf(savedPolicy.mfaRequirement, MFA_REQUIREMENTS)
          ? savedPolicy.mfaRequirement
          : basePolicy.mfaRequirement,
        sessionIdleMinutes: isOneOf(savedPolicy.sessionIdleMinutes, SESSION_IDLE_OPTIONS)
          ? savedPolicy.sessionIdleMinutes
          : basePolicy.sessionIdleMinutes,
        sessionMaxDays: isOneOf(savedPolicy.sessionMaxDays, SESSION_MAX_OPTIONS)
          ? savedPolicy.sessionMaxDays
          : basePolicy.sessionMaxDays,
        passwordAuthenticationEnabled:
          savedPolicy.passwordAuthenticationEnabled === false && basePolicy.ssoStatus === "verified"
            ? false
            : true,
        adminApprovalRequired:
          typeof savedPolicy.adminApprovalRequired === "boolean"
            ? savedPolicy.adminApprovalRequired
            : basePolicy.adminApprovalRequired,
      }
    : basePolicy;

  const restoredSessions = base.sessions.map((session) => {
    const saved = sessions.find(
      (item) =>
        isRecord(item) &&
        item.id === session.id &&
        item.userId === session.userId &&
        item.organizationId === session.organizationId,
    );
    return isRecord(saved) && typeof saved.revokedAt === "string"
      ? { ...session, revokedAt: saved.revokedAt }
      : session;
  });

  const restoredMemberships = base.memberships.map((membership) => {
    const saved = memberships.find(
      (item) =>
        isRecord(item) &&
        item.id === membership.id &&
        item.userId === membership.userId &&
        item.organizationId === membership.organizationId,
    );
    const delegated = isRecord(saved) && Array.isArray(saved.delegatedCapabilities)
      ? saved.delegatedCapabilities.filter(
          (capability): capability is GovernanceCapability =>
            typeof capability === "string" &&
            DELEGATABLE_CAPABILITIES.includes(capability as GovernanceCapability),
        )
      : membership.delegatedCapabilities;
    return { ...membership, delegatedCapabilities: [...new Set(delegated)] };
  });

  const restoredFlags = base.featureFlags.map((flag) => {
    const saved = featureFlags.find(
      (item) =>
        isRecord(item) &&
        item.key === flag.key &&
        item.organizationId === flag.organizationId &&
        item.workspaceId === flag.workspaceId,
    );
    return isRecord(saved) && typeof saved.enabled === "boolean"
      ? { ...flag, enabled: saved.enabled }
      : flag;
  });

  const restoredAudit = audit
    .filter(
      (item): item is Record<string, unknown> =>
        isRecord(item) && item.organizationId === CURRENT_DEMO_ORGANIZATION_ID,
    )
    .slice(0, 100)
    .map((item, index): EnterpriseAuditEvent => ({
      id: safeString(item.id, `audit-restored-${index}`, 96),
      organizationId: CURRENT_DEMO_ORGANIZATION_ID,
      actorId: safeString(item.actorId, CURRENT_DEMO_USER_ID, 96),
      action: safeString(item.action, "identity.unknown", 96),
      target: safeString(item.target, CURRENT_DEMO_ORGANIZATION_ID, 120),
      createdAt: safeString(item.createdAt, new Date(0).toISOString(), 40),
      mode: "demo",
    }));

  const activeWorkspaceId = restoredWorkspaces.some(
    (workspace) => workspace.id === candidate.activeWorkspaceId && workspace.status === "active",
  )
    ? String(candidate.activeWorkspaceId)
    : base.activeWorkspaceId;

  return {
    ...base,
    activeWorkspaceId,
    profile: {
      firstName: safeString(profile.firstName, base.profile.firstName, 60),
      lastName: safeString(profile.lastName, base.profile.lastName, 60),
      title: safeString(profile.title, base.profile.title, 80),
      locale: isOneOf(profile.locale, LOCALES) ? profile.locale : base.profile.locale,
      timeZone: isOneOf(profile.timeZone, TIME_ZONES) ? profile.timeZone : base.profile.timeZone,
      weekStartsOn:
        profile.weekStartsOn === "monday" ? "monday" : base.profile.weekStartsOn,
      highContrast:
        typeof profile.highContrast === "boolean"
          ? profile.highContrast
          : base.profile.highContrast,
    },
    organizations: base.organizations.map((organization) =>
      organization.id === CURRENT_DEMO_ORGANIZATION_ID && isRecord(savedOrganization)
        ? {
            ...organization,
            displayName: safeString(savedOrganization.displayName, organization.displayName, 80),
          }
        : organization,
    ),
    workspaces: restoredWorkspaces,
    memberships: restoredMemberships,
    policies: [restoredPolicy],
    sessions: restoredSessions,
    featureFlags: restoredFlags,
    audit: restoredAudit.length ? restoredAudit : base.audit,
  };
}

export function restoreEnterpriseIdentityState(raw: string | null): EnterpriseRestoreResult {
  const base = createEnterpriseIdentityState();
  if (!raw) return { state: base, migrated: false, recovered: false };

  try {
    const candidate: unknown = JSON.parse(raw);
    if (!isRecord(candidate)) return { state: base, migrated: false, recovered: true };

    if (candidate.schemaVersion === ENTERPRISE_IDENTITY_SCHEMA_VERSION) {
      return { state: restoreMutableState(candidate, base), migrated: false, recovered: false };
    }

    if (candidate.schemaVersion === 1) {
      return { state: restoreMutableState(candidate, base), migrated: true, recovered: false };
    }

    return { state: base, migrated: false, recovered: true };
  } catch {
    return { state: base, migrated: false, recovered: true };
  }
}

export function currentMembership(
  state: EnterpriseIdentityState,
  organizationId = state.activeOrganizationId,
): EnterpriseMembership | null {
  return (
    state.memberships.find(
      (membership) =>
        membership.userId === state.currentUserId && membership.organizationId === organizationId,
    ) ?? null
  );
}

export function canPerformGovernance(
  state: EnterpriseIdentityState,
  capability: GovernanceCapability,
  organizationId = state.activeOrganizationId,
): boolean {
  if (!state.organizations.some((organization) => organization.id === organizationId)) return false;
  const membership = currentMembership(state, organizationId);
  if (!membership) return false;
  if (membership.role === "owner") return ALL_CAPABILITIES.includes(capability);
  if (membership.delegatedCapabilities.includes(capability)) return true;
  if (membership.role === "admin") return ADMIN_CAPABILITIES.includes(capability);
  return false;
}

export function activateWorkspace(
  state: EnterpriseIdentityState,
  workspaceId: string,
  now = new Date().toISOString(),
): EnterpriseMutationResult {
  const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace || workspace.status !== "active") return result(state, false, "not_found");
  if (
    workspace.organizationId !== state.activeOrganizationId ||
    !currentMembership(state, workspace.organizationId)
  ) {
    return result(state, false, "forbidden");
  }
  if (workspace.id === state.activeWorkspaceId) return result(state, false, "ok");
  return result(
    appendAudit({ ...state, activeWorkspaceId: workspace.id }, "workspace.activated", workspace.id, now),
    true,
    "ok",
  );
}

export function updateEnterpriseProfile(
  state: EnterpriseIdentityState,
  patch: Partial<EnterpriseProfile>,
  now = new Date().toISOString(),
): EnterpriseMutationResult {
  const next: EnterpriseProfile = {
    firstName: safeString(patch.firstName, state.profile.firstName, 60),
    lastName: safeString(patch.lastName, state.profile.lastName, 60),
    title: safeString(patch.title, state.profile.title, 80),
    locale: isOneOf(patch.locale, LOCALES) ? patch.locale : state.profile.locale,
    timeZone: isOneOf(patch.timeZone, TIME_ZONES) ? patch.timeZone : state.profile.timeZone,
    weekStartsOn:
      patch.weekStartsOn === "monday" || patch.weekStartsOn === "sunday"
        ? patch.weekStartsOn
        : state.profile.weekStartsOn,
    highContrast:
      typeof patch.highContrast === "boolean" ? patch.highContrast : state.profile.highContrast,
  };
  return result(
    appendAudit({ ...state, profile: next }, "profile.updated", state.currentUserId, now),
    true,
    "ok",
  );
}

export function renameOrganization(
  state: EnterpriseIdentityState,
  displayName: string,
  now = new Date().toISOString(),
): EnterpriseMutationResult {
  if (!canPerformGovernance(state, "organization.manage")) return result(state, false, "forbidden");
  const normalized = displayName.trim();
  if (normalized.length < 2 || normalized.length > 80) return result(state, false, "invalid");
  const organizations = state.organizations.map((organization) =>
    organization.id === state.activeOrganizationId
      ? { ...organization, displayName: normalized }
      : organization,
  );
  return result(
    appendAudit({ ...state, organizations }, "organization.renamed", state.activeOrganizationId, now),
    true,
    "ok",
  );
}

export function renameWorkspace(
  state: EnterpriseIdentityState,
  workspaceId: string,
  name: string,
  now = new Date().toISOString(),
): EnterpriseMutationResult {
  if (!canPerformGovernance(state, "workspace.manage")) return result(state, false, "forbidden");
  const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace || workspace.organizationId !== state.activeOrganizationId) {
    return result(state, false, "not_found");
  }
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 72) return result(state, false, "invalid");
  const workspaces = state.workspaces.map((candidate) =>
    candidate.id === workspaceId ? { ...candidate, name: normalized } : candidate,
  );
  return result(
    appendAudit({ ...state, workspaces }, "workspace.renamed", workspaceId, now),
    true,
    "ok",
  );
}

export function updateAccessPolicy(
  state: EnterpriseIdentityState,
  patch: Partial<
    Pick<
      EnterpriseAccessPolicy,
      | "mfaRequirement"
      | "sessionIdleMinutes"
      | "sessionMaxDays"
      | "passwordAuthenticationEnabled"
      | "adminApprovalRequired"
    >
  >,
  now = new Date().toISOString(),
): EnterpriseMutationResult {
  if (!canPerformGovernance(state, "policy.manage")) return result(state, false, "forbidden");
  const policy = state.policies.find(
    (candidate) => candidate.organizationId === state.activeOrganizationId,
  );
  if (!policy) return result(state, false, "not_found");

  if (patch.passwordAuthenticationEnabled === false && policy.ssoStatus !== "verified") {
    return result(state, false, "sso_required");
  }

  const next: EnterpriseAccessPolicy = {
    ...policy,
    mfaRequirement: isOneOf(patch.mfaRequirement, MFA_REQUIREMENTS)
      ? patch.mfaRequirement
      : policy.mfaRequirement,
    sessionIdleMinutes: isOneOf(patch.sessionIdleMinutes, SESSION_IDLE_OPTIONS)
      ? patch.sessionIdleMinutes
      : policy.sessionIdleMinutes,
    sessionMaxDays: isOneOf(patch.sessionMaxDays, SESSION_MAX_OPTIONS)
      ? patch.sessionMaxDays
      : policy.sessionMaxDays,
    passwordAuthenticationEnabled:
      typeof patch.passwordAuthenticationEnabled === "boolean"
        ? patch.passwordAuthenticationEnabled
        : policy.passwordAuthenticationEnabled,
    adminApprovalRequired:
      typeof patch.adminApprovalRequired === "boolean"
        ? patch.adminApprovalRequired
        : policy.adminApprovalRequired,
  };
  const policies = state.policies.map((candidate) =>
    candidate.organizationId === next.organizationId ? next : candidate,
  );
  return result(
    appendAudit({ ...state, policies }, "policy.updated", next.organizationId, now),
    true,
    "ok",
  );
}

export function setDelegatedCapability(
  state: EnterpriseIdentityState,
  membershipId: string,
  capability: GovernanceCapability,
  enabled: boolean,
  now = new Date().toISOString(),
): EnterpriseMutationResult {
  const actor = currentMembership(state);
  if (actor?.role !== "owner") return result(state, false, "forbidden");
  if (!DELEGATABLE_CAPABILITIES.includes(capability)) return result(state, false, "invalid");
  const target = state.memberships.find((membership) => membership.id === membershipId);
  if (
    !target ||
    target.organizationId !== state.activeOrganizationId ||
    target.role === "owner" ||
    target.role === "viewer"
  ) {
    return result(state, false, "not_found");
  }
  const delegatedCapabilities = enabled
    ? [...new Set([...target.delegatedCapabilities, capability])]
    : target.delegatedCapabilities.filter((candidate) => candidate !== capability);
  const memberships = state.memberships.map((membership) =>
    membership.id === target.id ? { ...membership, delegatedCapabilities } : membership,
  );
  return result(
    appendAudit(
      { ...state, memberships },
      enabled ? "delegation.granted" : "delegation.revoked",
      `${target.id}:${capability}`,
      now,
    ),
    true,
    "ok",
  );
}

export function revokeDemoSession(
  state: EnterpriseIdentityState,
  sessionId: string,
  now = new Date().toISOString(),
): EnterpriseMutationResult {
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (!session || session.organizationId !== state.activeOrganizationId) {
    return result(state, false, "not_found");
  }
  if (session.current) return result(state, false, "current_session");
  const ownsSession = session.userId === state.currentUserId;
  if (!ownsSession && !canPerformGovernance(state, "session.manage")) {
    return result(state, false, "forbidden");
  }
  if (session.revokedAt) return result(state, false, "ok");
  const sessions = state.sessions.map((candidate) =>
    candidate.id === session.id ? { ...candidate, revokedAt: now } : candidate,
  );
  return result(
    appendAudit({ ...state, sessions }, "session.revoked", session.id, now),
    true,
    "ok",
  );
}

export function setFeatureFlag(
  state: EnterpriseIdentityState,
  key: FeatureFlagKey,
  enabled: boolean,
  workspaceId: string | null,
  now = new Date().toISOString(),
): EnterpriseMutationResult {
  if (!canPerformGovernance(state, "feature_flags.manage")) {
    return result(state, false, "forbidden");
  }
  if (!FEATURE_FLAG_KEYS.includes(key)) return result(state, false, "invalid");
  if (
    workspaceId &&
    !state.workspaces.some(
      (workspace) =>
        workspace.id === workspaceId && workspace.organizationId === state.activeOrganizationId,
    )
  ) {
    return result(state, false, "not_found");
  }

  const matchingIndex = state.featureFlags.findIndex(
    (flag) =>
      flag.key === key &&
      flag.organizationId === state.activeOrganizationId &&
      flag.workspaceId === workspaceId,
  );
  const featureFlags = [...state.featureFlags];
  const nextFlag: EnterpriseFeatureFlag = {
    key,
    organizationId: state.activeOrganizationId,
    workspaceId,
    enabled,
  };
  if (matchingIndex >= 0) featureFlags[matchingIndex] = nextFlag;
  else featureFlags.push(nextFlag);
  return result(
    appendAudit({ ...state, featureFlags }, "feature_flag.updated", `${key}:${workspaceId ?? "org"}`, now),
    true,
    "ok",
  );
}

export function isFeatureEnabled(
  state: EnterpriseIdentityState,
  key: FeatureFlagKey,
  organizationId: string,
  workspaceId?: string | null,
): boolean {
  if (!state.organizations.some((organization) => organization.id === organizationId)) return false;
  if (
    workspaceId &&
    !state.workspaces.some(
      (workspace) => workspace.id === workspaceId && workspace.organizationId === organizationId,
    )
  ) {
    return false;
  }
  const workspaceFlag = state.featureFlags.find(
    (flag) =>
      flag.key === key &&
      flag.organizationId === organizationId &&
      flag.workspaceId === workspaceId,
  );
  if (workspaceFlag) return workspaceFlag.enabled;
  return (
    state.featureFlags.find(
      (flag) =>
        flag.key === key && flag.organizationId === organizationId && flag.workspaceId === null,
    )?.enabled ?? false
  );
}

export function buildGovernanceExport(
  state: EnterpriseIdentityState,
  generatedAt = new Date().toISOString(),
) {
  if (!canPerformGovernance(state, "audit.export")) return null;
  const organization = state.organizations.find(
    (candidate) => candidate.id === state.activeOrganizationId,
  );
  if (!organization) return null;

  return {
    schemaVersion: ENTERPRISE_IDENTITY_SCHEMA_VERSION,
    generatedAt,
    mode: "demo" as const,
    organization,
    activeWorkspaceId: state.activeWorkspaceId,
    workspaces: state.workspaces.filter(
      (workspace) => workspace.organizationId === organization.id,
    ),
    policy: state.policies.find((policy) => policy.organizationId === organization.id) ?? null,
    memberships: state.memberships
      .filter((membership) => membership.organizationId === organization.id)
      .map(({ id, displayName, role, delegatedCapabilities }) => ({
        id,
        displayName,
        role,
        delegatedCapabilities,
      })),
    sessionPosture: state.sessions
      .filter((session) => session.organizationId === organization.id)
      .map(({ device, location, lastActiveAt, current, revokedAt }) => ({
        device,
        location,
        lastActiveAt,
        current,
        revoked: Boolean(revokedAt),
      })),
    featureFlags: state.featureFlags.filter((flag) => flag.organizationId === organization.id),
    audit: state.audit.filter((event) => event.organizationId === organization.id),
  };
}
