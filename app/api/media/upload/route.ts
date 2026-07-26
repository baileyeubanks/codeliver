/**
 * Retired multipart upload alias.
 *
 * All project media must enter through `/api/upload/tus`, where checksum,
 * malware, storage-receipt, tenant, asset, and V1 authority are one durable
 * saga. The former small-file route could create asset-only rows and is now a
 * bodyless tombstone.
 */

import {
  legacyUploadRetiredResponse,
  LEGACY_UPLOAD_RETIRED,
} from "@/lib/tus/legacy-retirement";

export async function POST() {
  return legacyUploadRetiredResponse();
}

void LEGACY_UPLOAD_RETIRED;
