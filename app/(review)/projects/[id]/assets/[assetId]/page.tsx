import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import InternalAssetReviewPage from "@/components/review/InternalAssetReviewPage";
import { getAssetAccess } from "@/lib/access-control";
import { BackendUnavailableError } from "@/lib/api/backend";
import { requireAuth } from "@/lib/auth";
import { isKnownDemoAssetRoute, isProductionRecordId } from "@/lib/dynamic-route-authority";
import { isLocalDemoServerRequest } from "@/lib/demo/server-mode";

export const metadata: Metadata = {
  title: "Asset review | Co-VideoPro",
};

export default async function AssetReviewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; assetId: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const [{ id, assetId }, query, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const isDemo = isLocalDemoServerRequest({
    host: requestHeaders.get("host") ?? "",
    demo: query.demo,
  });
  if (isDemo) {
    if (!isKnownDemoAssetRoute(id, assetId)) notFound();
    return <InternalAssetReviewPage />;
  }

  if (!isProductionRecordId(id) || !isProductionRecordId(assetId)) notFound();
  const user = await requireAuth();
  if (!user) notFound();
  const assetAccess = await getAssetAccess(assetId, user.id, "viewer");
  if (!assetAccess.ok) {
    if (assetAccess.status === 404) notFound();
    throw new BackendUnavailableError("Asset database");
  }
  if (assetAccess.data.project_id !== id) notFound();

  return <InternalAssetReviewPage />;
}
