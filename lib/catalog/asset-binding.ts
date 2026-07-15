import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogVersionBinding } from "./contracts";
import { CatalogError } from "./errors";

/**
 * Confirms that the authenticated, RLS-bound client can read the exact M2
 * asset/version pair. The existing schema has no content digest column, so the
 * checksum remains an immutable caller attestation until a durable catalog
 * adapter can compare it to ingest-pipeline evidence.
 */
export async function assertAccessibleVersionBinding(
  client: SupabaseClient,
  binding: CatalogVersionBinding,
): Promise<void> {
  const { data, error } = await client
    .from("versions")
    .select("id, asset_id, version_number")
    .eq("id", binding.versionId)
    .eq("asset_id", binding.assetId)
    .maybeSingle();

  if (error) {
    throw new CatalogError("not_found", "The asset version is unavailable in this access scope.", 404);
  }
  if (!data) {
    throw new CatalogError("not_found", "The asset version is unavailable in this access scope.", 404);
  }
  if (data.version_number !== binding.sequence) {
    throw new CatalogError(
      "version_conflict",
      "The supplied version sequence does not match the immutable asset version.",
      409,
    );
  }
}
