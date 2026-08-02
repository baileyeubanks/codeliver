export type TenantAuthorityKind = "personal" | "team";

export interface TenantAuthority {
  kind: TenantAuthorityKind;
  id: string;
  key: string;
}

export function tenantAuthorityKey(kind: TenantAuthorityKind, id: string) {
  return `${kind}:${id}`;
}

export function projectTenantAuthority(project: {
  owner_id: string;
  team_id?: string | null;
}): TenantAuthority {
  const kind: TenantAuthorityKind = project.team_id ? "team" : "personal";
  const id = project.team_id ?? project.owner_id;
  return { kind, id, key: tenantAuthorityKey(kind, id) };
}
