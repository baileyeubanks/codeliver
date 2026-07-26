/**
 * Retired per-upload alias.
 *
 * No method reads inherited metadata or touches staged bytes. Operators can
 * reconcile any historical residue out of band after inspecting it; this
 * dead route is not allowed to mutate or finalize it.
 */

import {
  legacyUploadRetiredHeadResponse,
  legacyUploadRetiredResponse,
  LEGACY_UPLOAD_RETIRED,
} from "@/lib/tus/legacy-retirement";

export async function OPTIONS() {
  return legacyUploadRetiredResponse();
}

export async function HEAD() {
  return legacyUploadRetiredHeadResponse();
}

export async function PATCH() {
  return legacyUploadRetiredResponse();
}

export async function DELETE() {
  return legacyUploadRetiredResponse();
}

void LEGACY_UPLOAD_RETIRED;
