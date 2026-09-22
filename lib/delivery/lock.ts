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

export async function findLockedAssetIds(
  assetIds: string[],
  client: DataClient,
): Promise<string[]> {
  if (assetIds.length === 0) return [];

  const items = await client
    .from("deliverable_items")
    .select("asset_id, deliverable_id")
    .in("asset_id", assetIds);
  if (items.error) throw new BackendUnavailableError("Locked delivery lookup");

  const rows = items.data ?? [];
  if (rows.length === 0) return [];

  const deliverableIds = [
    ...new Set(rows.map((row) => row.deliverable_id as string)),
  ];
  const { data, error } = await client
    .from("deliverables")
    .select("id, locked_at")
    .in("id", deliverableIds);
  if (error) throw new BackendUnavailableError("Locked delivery lookup");

  const lockedDeliverableIds = new Set(
    (data ?? [])
      .filter((row) => row.locked_at != null)
      .map((row) => row.id as string),
  );
  return [
    ...new Set(
      rows
        .filter((row) => lockedDeliverableIds.has(row.deliverable_id as string))
        .map((row) => row.asset_id as string),
    ),
  ];
}

export async function assertAssetNotLocked(
  assetId: string,
  client: DataClient,
): Promise<void> {
  const locked = await findLockedAssetIds([assetId], client);
  if (locked.length > 0) throw new AssetDeliveryLockedError(assetId);
}
