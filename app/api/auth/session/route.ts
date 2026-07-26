import { requireAuth } from "@/lib/auth";
import { resolveProvisionedRole } from "@/lib/auth/provisioning";
import { surfaceForRole } from "@/lib/auth/host-surface";
import { apiJson, backendUnavailable } from "@/lib/api/responses";

// Provisioned auth roles map onto workspace navigation roles fail-closed:
// staff runs the workspace, clients get the read/review surface, and an
// unprovisioned account is never granted more than viewer.
const WORKSPACE_ROLE_BY_PROVISIONED = {
  staff: "owner",
  client: "viewer",
} as const;

export async function GET() {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth();
  } catch {
    return backendUnavailable();
  }
  if (!user) {
    return apiJson({ authenticated: false }, { status: 401 });
  }

  const provisioned = resolveProvisionedRole(user);
  const displayName = typeof user.user_metadata?.display_name === "string"
    ? user.user_metadata.display_name
    : null;

  return apiJson({
    authenticated: true,
    email: user.email,
    id: user.id,
    display_name: displayName,
    workspace_role: provisioned ? WORKSPACE_ROLE_BY_PROVISIONED[provisioned] : "viewer",
    access: {
      state: provisioned ? "provisioned" : "pending",
      email_confirmed: Boolean(user.email_confirmed_at),
      required_surface: provisioned ? surfaceForRole(provisioned) : null,
    },
  });
}
