import { notFound } from "next/navigation";
import TeamInviteAcceptance from "@/components/auth/TeamInviteAcceptance";
import { BackendUnavailableError } from "@/lib/api/backend";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { opaqueTokenLookup } from "@/lib/security/opaque-token";
import { isOpaqueRouteToken } from "@/lib/dynamic-route-authority";

export default async function TeamInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isOpaqueRouteToken(token)) notFound();
  const user = await requireAuth();
  if (!user?.email) notFound();
  const lookup = opaqueTokenLookup(token);
  const { data: invite, error } = await getSupabase()
    .from("team_invites")
    .select("email, status, expires_at")
    .eq(lookup.column, lookup.value)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw new BackendUnavailableError("Invitation database");
  if (
    !invite
    || invite.email.toLowerCase() !== user.email.toLowerCase()
    || (invite.expires_at && new Date(invite.expires_at) <= new Date())
  ) notFound();
  return <TeamInviteAcceptance token={token} />;
}
