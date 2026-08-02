export const PROVISIONED_ROLE_KEY = "content_coop_role";
export const CONTENT_COOP_STAFF_DOMAIN = "contentco-op.com";

export type ProvisionedRole = "staff" | "client";

export interface ProvisioningUser {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
}

export interface ProvisioningApproval {
  apply: boolean;
  staffUserIds: string[];
  clientUserIds: string[];
}

export interface StaffCandidate {
  userId: string;
  email: string;
  emailConfirmedAt: string;
  currentRole: ProvisionedRole | null;
}

export interface ProvisioningDecision {
  userId: string;
  email: string | null;
  requestedRole: ProvisionedRole;
  currentRole: ProvisionedRole | null;
  outcome: "eligible" | "unchanged" | "rejected";
  reason: string | null;
  nextAppMetadata: Record<string, unknown> | null;
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function uniqueUserIds(userIds: string[]): string[] {
  return [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))];
}

export function normalizeProvisioningEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");

  if (
    at <= 0 ||
    at !== normalized.indexOf("@") ||
    at === normalized.length - 1 ||
    /\s/.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

export function resolveProvisionedRole(
  identity: Pick<ProvisioningUser, "app_metadata"> | null | undefined,
): ProvisionedRole | null {
  const role = asMetadata(identity?.app_metadata)[PROVISIONED_ROLE_KEY];
  return role === "staff" || role === "client" ? role : null;
}

export function isConfirmedContentCoopStaffCandidate(user: ProvisioningUser): boolean {
  const email = normalizeProvisioningEmail(user.email);
  if (!email || !user.email_confirmed_at) return false;
  return email.slice(email.lastIndexOf("@") + 1) === CONTENT_COOP_STAFF_DOMAIN;
}

export function listConfirmedStaffCandidates(users: ProvisioningUser[]): StaffCandidate[] {
  return users
    .filter(isConfirmedContentCoopStaffCandidate)
    .map((user) => ({
      userId: user.id,
      email: normalizeProvisioningEmail(user.email) as string,
      emailConfirmedAt: user.email_confirmed_at as string,
      currentRole: resolveProvisionedRole(user),
    }))
    .sort((left, right) => left.email.localeCompare(right.email));
}

export function mergeProvisionedRole(
  appMetadata: Record<string, unknown> | null | undefined,
  role: ProvisionedRole,
): Record<string, unknown> {
  return {
    ...asMetadata(appMetadata),
    [PROVISIONED_ROLE_KEY]: role,
  };
}

export function planProvisioning(
  users: ProvisioningUser[],
  approval: ProvisioningApproval,
): ProvisioningDecision[] {
  const staffUserIds = uniqueUserIds(approval.staffUserIds);
  const clientUserIds = uniqueUserIds(approval.clientUserIds);
  const requestedCount = staffUserIds.length + clientUserIds.length;

  if (approval.apply && requestedCount === 0) {
    throw new Error("Apply mode requires at least one explicitly approved user ID.");
  }

  const overlappingIds = new Set(
    staffUserIds.filter((userId) => clientUserIds.includes(userId)),
  );
  const usersById = new Map(users.map((user) => [user.id, user]));
  const decisions: ProvisioningDecision[] = [];

  for (const [requestedRole, userIds] of [
    ["staff", staffUserIds],
    ["client", clientUserIds],
  ] as const) {
    for (const userId of userIds) {
      const user = usersById.get(userId);
      const email = normalizeProvisioningEmail(user?.email);
      const currentRole = resolveProvisionedRole(user);
      let reason: string | null = null;

      if (overlappingIds.has(userId)) {
        reason = "User ID cannot be approved for both staff and client authority.";
      } else if (!user) {
        reason = "Approved user ID was not found in Auth.";
      } else if (!user.email_confirmed_at) {
        reason = "Authority cannot be assigned before the email is confirmed.";
      } else if (requestedRole === "staff" && !isConfirmedContentCoopStaffCandidate(user)) {
        reason = `Staff authority requires an exact @${CONTENT_COOP_STAFF_DOMAIN} email.`;
      }

      if (reason) {
        decisions.push({
          userId,
          email,
          requestedRole,
          currentRole,
          outcome: "rejected",
          reason,
          nextAppMetadata: null,
        });
        continue;
      }

      if (currentRole === requestedRole) {
        decisions.push({
          userId,
          email,
          requestedRole,
          currentRole,
          outcome: "unchanged",
          reason: null,
          nextAppMetadata: asMetadata(user?.app_metadata),
        });
        continue;
      }

      decisions.push({
        userId,
        email,
        requestedRole,
        currentRole,
        outcome: "eligible",
        reason: null,
        nextAppMetadata: mergeProvisionedRole(user?.app_metadata, requestedRole),
      });
    }
  }

  return decisions;
}
