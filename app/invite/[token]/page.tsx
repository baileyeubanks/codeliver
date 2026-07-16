import TeamInviteAcceptance from "@/components/auth/TeamInviteAcceptance";

export default async function TeamInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TeamInviteAcceptance token={token} />;
}
