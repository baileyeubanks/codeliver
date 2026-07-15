import { getTeamRole } from "@/lib/middleware/rbac";
import type { TeamRole } from "@/lib/types/codeliver";
import type {
  OperationsAuthority,
  OperationsPermission,
  OperationsRole,
} from "./contracts";

const ROLE_PERMISSIONS: Record<OperationsRole, ReadonlySet<OperationsPermission>> = {
  viewer: new Set(),
  member: new Set(),
  admin: new Set([
    "operations.evaluate_slo",
    "operations.read_diagnostics",
    "operations.create_support_bundle",
  ]),
  owner: new Set([
    "operations.evaluate_slo",
    "operations.read_diagnostics",
    "operations.create_support_bundle",
    "operations.plan_recovery",
  ]),
};

export function authorityFromServerRole(
  actorId: string,
  tenantId: string,
  role: OperationsRole,
): OperationsAuthority {
  return {
    actorId,
    tenantId,
    role,
    permissions: ROLE_PERMISSIONS[role],
  };
}
/** Resolve the tenant role from server-side membership; request roles are ignored. */
export async function resolveOperationsAuthority(
  actorId: string,
  tenantId: string,
): Promise<OperationsAuthority | null> {
  const role = await getTeamRole(tenantId, actorId);
  if (!role) return null;
  return authorityFromServerRole(actorId, tenantId, role as TeamRole);
}
