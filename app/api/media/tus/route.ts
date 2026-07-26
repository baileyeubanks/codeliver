/**
 * Retired upload alias.
 *
 * `/api/upload/tus` is the only supported resumable ingest boundary. This
 * tombstone deliberately performs no authentication, storage, catalog, or
 * request-body work so the former asset-only writer cannot race the canonical
 * asset-plus-V1 transaction.
 */

import {
  legacyUploadRetiredResponse,
  LEGACY_UPLOAD_RETIRED,
} from "@/lib/tus/legacy-retirement";

export async function OPTIONS() {
  return legacyUploadRetiredResponse();
}

export async function POST() {
  return legacyUploadRetiredResponse();
}

void LEGACY_UPLOAD_RETIRED;
