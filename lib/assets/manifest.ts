/**
 * P26 Asset Library — curated package manifest shaping.
 * Pure: checksums and sizes arrive from seed data recorded once with
 * `node:crypto` over the real files — nothing is computed at runtime.
 */

import { formatMatrixFor, LIBRARY_FORMAT_LABELS } from "./formats";
import type { LibraryAssetMeta, LibraryFormatKey, LibraryPackage } from "./types";

export interface PackageManifestFile {
  asset_id: string;
  asset_title: string;
  format: LibraryFormatKey;
  format_label: string;
  file_name: string;
  href: string;
  size_bytes: number;
  sha256: string;
}

export interface PackageManifest {
  package_id: string;
  title: string;
  campaign: string;
  file_count: number;
  total_bytes: number;
  files: PackageManifestFile[];
}

function fileNameOf(href: string): string {
  const parts = href.split("/");
  return parts[parts.length - 1] ?? href;
}

/**
 * Build the manifest for a package. Only formats backed by a real file are
 * listed — an asset whose master was never produced contributes its real
 * files (e.g. thumbnail) and nothing else.
 */
export function buildPackageManifest(
  pkg: LibraryPackage,
  assets: Array<{ id: string; title: string }>,
  metasById: Record<string, LibraryAssetMeta | undefined>,
): PackageManifest {
  const titleById = new Map(assets.map((asset) => [asset.id, asset.title]));
  const files: PackageManifestFile[] = [];

  for (const assetId of pkg.asset_ids) {
    const meta = metasById[assetId];
    if (!meta) continue;
    for (const entry of formatMatrixFor(meta.formats)) {
      if (!entry.available) continue;
      files.push({
        asset_id: assetId,
        asset_title: titleById.get(assetId) ?? assetId,
        format: entry.format,
        format_label: LIBRARY_FORMAT_LABELS[entry.format],
        file_name: fileNameOf(entry.href),
        href: entry.href,
        size_bytes: entry.size_bytes,
        sha256: entry.sha256,
      });
    }
  }

  return {
    package_id: pkg.id,
    title: pkg.title,
    campaign: pkg.campaign,
    file_count: files.length,
    total_bytes: files.reduce((sum, file) => sum + file.size_bytes, 0),
    files,
  };
}
