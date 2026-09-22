import type { SourceCatalog } from "../demo/source-catalog";
import type { LibraryAssetMeta, LibraryPackage } from "./types";

export interface SourceLibraryFacts {
  assetId: string;
  projectId: string;
  projectName: string;
  durationSeconds: number;
  resolution: string;
  sizeBytes: number;
}

export interface LibrarySurfaceData {
  isSourceCatalog: boolean;
  metaByAssetId: Record<string, LibraryAssetMeta>;
  packages: LibraryPackage[];
  sourceFactsByAssetId: Record<string, SourceLibraryFacts>;
}

/**
 * A configured source catalog is its own authority. Never merge illustrative
 * library metadata by id: a coincidental id must not inherit fixture rights,
 * formats, package membership, or search labels.
 */
export function librarySurfaceData(
  catalog: SourceCatalog | null,
  fixtureMetaByAssetId: Record<string, LibraryAssetMeta>,
  fixturePackages: LibraryPackage[],
): LibrarySurfaceData {
  if (!catalog) {
    return {
      isSourceCatalog: false,
      metaByAssetId: fixtureMetaByAssetId,
      packages: fixturePackages,
      sourceFactsByAssetId: {},
    };
  }

  const projectNameById = new Map(catalog.projects.map((project) => [project.id, project.name]));
  const sourceFactsByAssetId = Object.fromEntries(
    catalog.assets.map((asset) => [asset.id, {
      assetId: asset.id,
      projectId: asset.project_id,
      projectName: projectNameById.get(asset.project_id) ?? asset.project_id,
      durationSeconds: asset.duration_seconds,
      resolution: `${asset.width} × ${asset.height}`,
      sizeBytes: asset.bytes,
    }]),
  );

  return {
    isSourceCatalog: true,
    metaByAssetId: {},
    packages: [],
    sourceFactsByAssetId,
  };
}
