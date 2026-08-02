import type { VaultActor, VaultPermission, VaultRecord } from "./types";

export function vaultActorCan(
  actor: VaultActor,
  record: VaultRecord,
  permission: VaultPermission,
) {
  const requiredCapability = {
    read: "vault:read",
    retrieve: "vault:retrieve",
    create: "vault:write",
    supersede: "vault:write",
    export: "vault:export",
    approve_agent: "agent:approve",
  } as const;
  if (!actor.capabilities.includes(requiredCapability[permission])) return false;
  if (
    record.acl.allowTenantAdmins &&
    (actor.role === "owner" || actor.role === "admin")
  ) {
    return true;
  }

  return record.acl.entries.some((entry) => {
    const principalMatches =
      (entry.principalType === "actor" && entry.principalId === actor.id) ||
      (entry.principalType === "role" && entry.principalId === actor.role);
    return principalMatches && entry.permissions.includes(permission);
  });
}

export function actorHasCapability(
  actor: VaultActor,
  capability: VaultActor["capabilities"][number],
) {
  return actor.capabilities.includes(capability);
}
