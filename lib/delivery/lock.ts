import { BackendUnavailableError } from "@/lib/api/backend";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataClient = SupabaseClient<any, any, any>;

/**
 * Locked-delivery guard (promise 6.4). Once a deliverable is locked, the
 * assets bound into its version set are frozen: no new versions (upload
 * chokepoint), no metadata edits, no deletes. Callers translate
 * AssetDeliveryLockedError into a 409 at their own boundary.
 */
export class AssetDeliveryLockedError extends Error {
  readonly code = "ASSET_LOCKED" as const;
  readonly assetId: string;

  constructor(assetId: string) {
    super("Asset is part of a locked delivery");
    this.name = "AssetDeliveryLockedError";
    this.assetId = assetId;
  }
}

export function isAssetDeliveryLockedError(
  error: unknown,
): error is AssetDeliveryLockedError {
  return error instanceof AssetDeliveryLockedError;
}

export async function assertAssetNotLocked(
  assetId: string,
  client: DataClient,
): Promise<void> {
  const items = await client
    .from("deliverable_items")
    .select("deliverable_id")
    .eq("asset_id", assetId);
  if (items.error) throw new BackendUnavailableError("Locked delivery lookup");

  const deliverableIds = [
    ...new Set((items.data ?? []).map((row) => row.deliverable_id as string)),
  ];
  if (deliverableIds.length === 0) return;

  const { data, error } = await client
    .from("deliverables")
    .select("id, locked_at")
    .in("id", deliverableIds);
  if (error) throw new BackendUnavailableError("Locked delivery lookup");

  if ((data ?? []).some((row) => row.locked_at != null)) {
    throw new AssetDeliveryLockedError(assetId);
  }
}
