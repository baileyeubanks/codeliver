import { headers } from "next/headers";
import { notFound } from "next/navigation";
import PublicReviewPage from "@/components/review/PublicReviewPage";
import { BackendUnavailableError } from "@/lib/api/backend";
import { isOpaqueRouteToken } from "@/lib/dynamic-route-authority";
import { isLocalDemoServerRequest } from "@/lib/demo/server-mode";
import { getReviewInviteByToken } from "@/lib/review-invites";

export default async function PublicReviewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const [{ token }, query, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const isDemo = isLocalDemoServerRequest({
    host: requestHeaders.get("host") ?? "",
    demo: query.demo,
  });
  if (isDemo && token === "demo") return <PublicReviewPage />;
  if (!isOpaqueRouteToken(token)) notFound();

  const inviteLookup = await getReviewInviteByToken(token);
  if (!inviteLookup.ok && inviteLookup.status === 404) notFound();
  if (!inviteLookup.ok && inviteLookup.status >= 500) {
    throw new BackendUnavailableError("Review database");
  }
  return <PublicReviewPage />;
}
