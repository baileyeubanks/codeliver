import { requireAuthWithClient } from "@/lib/auth-client";
import { resolveTrustedSurfaceRole } from "@/lib/auth/host-surface";

/**
 * Staff APIs must verify the server-controlled Auth claim in addition to RLS.
 * Team membership remains the record-level authority inside the database.
 */
export async function requireStaffWithClient() {
  const auth = await requireAuthWithClient();
  const role = auth.user ? resolveTrustedSurfaceRole(auth.user) : null;
  return {
    ...auth,
    staff: role === "staff",
  };
}
