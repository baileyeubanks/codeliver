import { getOwnedAsset } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import {
  CollaborationControlPlane,
  type CollaborationCapability,
  type CollaborationPrincipal,
  type CollaborationResourceBinding,
  type CollaborationScope,
} from "@/lib/collaboration/control-plane";

const OWNER_CAPABILITIES: readonly CollaborationCapability[] = [
  "events.read",
  "thread.create",
  "thread.reply",
  "thread.moderate",
  "presence.write",
];

export type ServerAuthorizationResult =
  | {
      ok: true;
      principal: CollaborationPrincipal;
      resource: CollaborationResourceBinding;
    }
  | { ok: false; status: number; code: string; message: string; recovery: string };

/**
 * M2 compatibility adapter. The existing data model is owner-scoped, so the
 * authenticated owner ID is the only accepted tenant ID. This fails closed
 * until enterprise membership grants can replace the adapter.
 */
export async function authorizeCollaborationScope(
  scope: CollaborationScope,
): Promise<ServerAuthorizationResult> {
  const user = await requireAuth();
  if (!user) {
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      message: "Authentication is required.",
      recovery: "Sign in, then select the collaboration asset again.",
    };
  }
  if (scope.tenantId !== user.id) {
    return {
      ok: false,
      status: 404,
      code: "unauthorized_scope",
      message: "The collaboration resource was not found in the authorized scope.",
      recovery: "Return to an authorized workspace and select the project, asset, and version again.",
    };
  }

  const assetAccess = await getOwnedAsset(scope.assetId, user.id);
  if (!assetAccess.ok || assetAccess.data.project_id !== scope.projectId) {
    return {
      ok: false,
      status: assetAccess.ok ? 404 : assetAccess.status,
      code: "unauthorized_scope",
      message: "The collaboration resource was not found in the authorized scope.",
      recovery: "Return to an authorized workspace and select the project, asset, and version again.",
    };
  }

  const { data: version, error } = await getSupabase()
    .from("versions")
    .select("id")
    .eq("id", scope.assetVersionId)
    .eq("asset_id", scope.assetId)
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 503,
      code: "authorization_unavailable",
      message: "Collaboration authorization is temporarily unavailable.",
      recovery: "Wait briefly and retry without changing the command or idempotency key.",
    };
  }
  if (!version) {
    return {
      ok: false,
      status: 409,
      code: "asset_version_stale",
      message: "Writes and live reads must target the current asset version.",
      recovery: "Refresh the asset and retry against its current version.",
    };
  }

  // This binding is server-derived; clients cannot grant or upgrade themselves.
  const authorizationVersion = `owner-v1:${user.id}`;
  return {
    ok: true,
    principal: {
      actorId: user.id,
      tenantId: user.id,
      authorizationVersion,
      capabilities: OWNER_CAPABILITIES,
    },
    resource: {
      ...scope,
      currentAssetVersionId: version.id,
      authorizationVersion,
      allowedCapabilities: OWNER_CAPABILITIES,
    },
  };
}

const globalControlPlane = globalThis as typeof globalThis & {
  __codeliverCollaborationControlPlane?: CollaborationControlPlane;
};

export function getCollaborationControlPlane() {
  globalControlPlane.__codeliverCollaborationControlPlane ??= new CollaborationControlPlane();
  return globalControlPlane.__codeliverCollaborationControlPlane;
}
