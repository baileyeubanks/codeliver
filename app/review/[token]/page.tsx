import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import PublicReviewPage from "@/components/review/PublicReviewPage";
import { BackendUnavailableError } from "@/lib/api/backend";
import {
  DEMO_SHORT_SHARE_QUERY_FLAG,
  isKnownDemoShareRoute,
  isOpaqueRouteToken,
} from "@/lib/dynamic-route-authority";
import { isLocalDemoServerRequest } from "@/lib/demo/server-mode";
import { getReviewInviteByToken } from "@/lib/review-invites";

export default async function PublicReviewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    demo?: string;
    share?: string;
    "demo-short"?: string;
  }>;
}) {
  const [{ token }, query, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const isDemo = isLocalDemoServerRequest({
    host: requestHeaders.get("host") ?? "",
    demo: query.demo,
  });

  if (isDemo) {
    if (token === "demo") {
      // The canonical demo share URL is /review/<token>; the proxy rewrites
      // short URLs back to this long form with DEMO_SHORT_SHARE_QUERY_FLAG
      // set. Redirect any direct long-form visit to the canonical short URL.
      if (
        query.share
        && isKnownDemoShareRoute(query.share)
        && query[DEMO_SHORT_SHARE_QUERY_FLAG] !== "1"
      ) {
        permanentRedirect(`/review/${query.share}?demo=1`);
      }
      return <PublicReviewPage />;
    }
    // Demo review tokens resolve against the demo workspace only — an unknown
    // token is a missing record here, never a production database lookup.
    if (!isKnownDemoShareRoute(token)) notFound();
    return <PublicReviewPage />;
  }

  if (!isOpaqueRouteToken(token)) notFound();

  const inviteLookup = await getReviewInviteByToken(token);
  // Expired or exhausted links (410) are missing records at the page layer;
  // the API keeps the precise 410 for clients.
  if (!inviteLookup.ok && (inviteLookup.status === 404 || inviteLookup.status === 410)) notFound();
  if (!inviteLookup.ok && inviteLookup.status >= 500) {
    throw new BackendUnavailableError("Review database");
  }
  return <PublicReviewPage />;
}
