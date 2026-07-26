/**
 * Quarantined residue cleanup for the retired `/api/media/tus` store.
 *
 * This module intentionally exposes no create, append, finalize, catalog, or
 * transcode operation. The canonical implementation lives in
 * `lib/tus/orchestrator.ts`. Only stale, incomplete residue cleanup remains so
 * an operator can remove abandoned pre-retirement staging through an explicit
 * maintenance caller.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

import {
  isSafeUploadId,
  requireConfiguredMediaRoot,
  uploadStagingDirectory,
} from "@/lib/storage/media-root";

interface LegacyTusUploadMeta {
  id: string;
  createdAt: string;
  completed: boolean;
}

function legacyMetaPath(uploadId: string): string {
  if (!isSafeUploadId(uploadId)) throw new Error("Invalid upload id");
  return join(
    uploadStagingDirectory(requireConfiguredMediaRoot()),
    `${uploadId}.json`,
  );
}

function legacyChunkPath(uploadId: string): string {
  if (!isSafeUploadId(uploadId)) throw new Error("Invalid upload id");
  return join(
    uploadStagingDirectory(requireConfiguredMediaRoot()),
    `${uploadId}.bin`,
  );
}

function readLegacyUpload(uploadId: string): LegacyTusUploadMeta | null {
  if (!isSafeUploadId(uploadId)) return null;
  const path = legacyMetaPath(uploadId);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<LegacyTusUploadMeta>;
    if (
      value.id !== uploadId ||
      typeof value.createdAt !== "string" ||
      typeof value.completed !== "boolean"
    ) {
      return null;
    }
    return value as LegacyTusUploadMeta;
  } catch {
    return null;
  }
}

function deleteLegacyResidue(uploadId: string): boolean {
  if (!isSafeUploadId(uploadId)) return false;
  try {
    const chunk = legacyChunkPath(uploadId);
    const metadata = legacyMetaPath(uploadId);
    if (existsSync(chunk)) unlinkSync(chunk);
    if (existsSync(metadata)) unlinkSync(metadata);
    return true;
  } catch {
    return false;
  }
}

export function cleanStaleUploads(
  maxAgeMs = 24 * 60 * 60 * 1000,
): number {
  const uploadDirectory = uploadStagingDirectory(requireConfiguredMediaRoot());
  if (!existsSync(uploadDirectory)) return 0;
  const now = Date.now();
  let cleaned = 0;

  for (const file of readdirSync(uploadDirectory)) {
    if (!file.endsWith(".json")) continue;
    const uploadId = file.slice(0, -".json".length);
    const metadata = readLegacyUpload(uploadId);
    if (!metadata || metadata.completed) continue;
    const createdAt = Date.parse(metadata.createdAt);
    if (
      Number.isFinite(createdAt) &&
      now - createdAt > maxAgeMs &&
      deleteLegacyResidue(uploadId)
    ) {
      cleaned += 1;
    }
  }

  return cleaned;
}
