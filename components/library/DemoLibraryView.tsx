"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LibraryBig, Package, Scissors, Upload } from "lucide-react";
import {
  recordDemoLibraryCutdownRequest,
  toggleDemoLibraryFavorite,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import { demoLibraryMetaById, demoLibraryPackages } from "@/lib/assets/demo-library";
import { librarySurfaceData } from "@/lib/assets/library-surface-data";
import { buildPackageManifest } from "@/lib/assets/manifest";
import {
  facetValues,
  filterLibraryAssets,
  mergeFacets,
  parseLibraryQuery,
  toLibrarySearchRecord,
} from "@/lib/assets/query";
import { formatDurationSeconds } from "@/lib/assets/formats";
import { sourceCatalog } from "@/lib/demo/source-catalog";
import type { LibraryFacetFilters } from "@/lib/assets/types";
import CutdownRequestDialog, { type CutdownRequestInput } from "./CutdownRequestDialog";
import FormatMatrixDialog from "./FormatMatrixDialog";
import LibraryAssetCard from "./LibraryAssetCard";
import LibraryFilterRail from "./LibraryFilterRail";
import PackageManifestPanel from "./PackageManifestPanel";

/**
 * P26 Asset Library — demo-mode home for approved/final assets: faceted
 * search, hover-scrub cards, honest format matrix, curated packages with
 * manifests, rights badges, favorites, and request-a-cutdown.
 */
export default function DemoLibraryView() {
  const workspace = useDemoWorkspace();
  const [searchText, setSearchText] = useState("");
  const [railFacets, setRailFacets] = useState<LibraryFacetFilters>({});
  const [formatsAssetId, setFormatsAssetId] = useState<string | null>(null);
  const [cutdownAssetId, setCutdownAssetId] = useState<string | null>(null);
  const [openPackageId, setOpenPackageId] = useState<string | null>(null);
  const surfaceData = useMemo(
    () => librarySurfaceData(sourceCatalog, demoLibraryMetaById, demoLibraryPackages),
    [],
  );

  const records = useMemo(
    () =>
      workspace.assets.map((asset) =>
        toLibrarySearchRecord(
          asset,
          surfaceData.metaByAssetId[asset.id],
          workspace.libraryFavorites.includes(asset.id),
          surfaceData.sourceFactsByAssetId[asset.id]
            ? {
                campaign: surfaceData.sourceFactsByAssetId[asset.id].projectName,
                searchTerms: [
                  surfaceData.sourceFactsByAssetId[asset.id].projectName,
                  surfaceData.sourceFactsByAssetId[asset.id].projectId,
                ],
              }
            : undefined,
        ),
      ),
    [workspace.assets, workspace.libraryFavorites, surfaceData],
  );

  const query = useMemo(() => {
    const parsed = parseLibraryQuery(searchText);
    return { textTokens: parsed.textTokens, facets: mergeFacets(parsed.facets, railFacets) };
  }, [searchText, railFacets]);

  const filteredRecords = useMemo(
    () => filterLibraryAssets(records, query),
    [records, query],
  );
  const filteredIds = useMemo(
    () => new Set(filteredRecords.map((record) => record.id)),
    [filteredRecords],
  );
  const visibleAssets = workspace.assets.filter((asset) => filteredIds.has(asset.id));

  const facetOptions = useMemo(
    () => ({
      campaigns: facetValues(records, "campaign"),
      platforms: facetValues(records, "platform"),
      formats: facetValues(records, "format"),
      orientations: facetValues(records, "orientation"),
      rights: surfaceData.isSourceCatalog ? [] : ["paid_until", "internal_only", "unlimited"],
      products: facetValues(records, "product"),
      talents: facetValues(records, "talent"),
    }),
    [records, surfaceData.isSourceCatalog],
  );

  const projectNameById = useMemo(
    () => new Map(workspace.projects.map((project) => [project.id, project.name])),
    [workspace.projects],
  );

  const filtersActive =
    searchText.trim().length > 0 ||
    Object.values(railFacets).some((value) => value !== undefined && value !== "" && value !== false);

  const formatsAsset = formatsAssetId
    ? workspace.assets.find((asset) => asset.id === formatsAssetId)
    : undefined;
  const cutdownAsset = cutdownAssetId
    ? workspace.assets.find((asset) => asset.id === cutdownAssetId)
    : undefined;
  const openPackage = openPackageId
    ? surfaceData.packages.find((pkg) => pkg.id === openPackageId)
    : undefined;
  const openManifest = openPackage
    ? buildPackageManifest(openPackage, workspace.assets, surfaceData.metaByAssetId)
    : undefined;

  function handleCutdownSubmit(input: CutdownRequestInput) {
    if (!cutdownAssetId) return { ok: false, reason: "No source asset selected." };
    const result = recordDemoLibraryCutdownRequest({
      assetId: cutdownAssetId,
      platform: input.platform,
      durationSeconds: input.durationSeconds,
      note: input.note,
    });
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-bold uppercase text-[var(--dim)]">Asset management</p>
          <h1 className="text-[22px] font-bold leading-tight text-[var(--ink)]">Media library</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Search the account library, then open the exact project cut you need.
          </p>
        </div>
        <Link
          href="/projects?demo=1"
          className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
        >
          <Upload size={14} aria-hidden="true" />
          Upload in project
        </Link>
      </div>

      <LibraryFilterRail
        searchText={searchText}
        onSearchTextChange={setSearchText}
        facets={railFacets}
        onFacetsChange={setRailFacets}
        options={facetOptions}
        resultCount={visibleAssets.length}
        campaignLabel={surfaceData.isSourceCatalog ? "Project" : "Campaign"}
      />

      {surfaceData.packages.length > 0 ? (
      <details className="mb-4 border-t border-[var(--border)] pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--ink)]">
          Packages ({surfaceData.packages.length})
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Curated packages">
          {surfaceData.packages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => setOpenPackageId(openPackageId === pkg.id ? null : pkg.id)}
              aria-pressed={openPackageId === pkg.id}
              data-testid={`package-card-${pkg.id}`}
              className={`flex items-start gap-3 border-l-2 px-3 py-2 text-left transition-colors ${
                openPackageId === pkg.id
                  ? "border-[var(--accent)] bg-[var(--cvp-blue-tint)]"
                  : "border-[var(--border)] hover:border-[var(--accent)]"
              }`}
            >
              <span className="mt-0.5 text-[var(--accent)]">
                <Package size={16} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase text-[var(--dim)]">
                  {pkg.campaign}
                </span>
                <span className="mt-0.5 block truncate text-sm font-bold text-[var(--ink)]">
                  {pkg.title}
                </span>
                <span className="mt-1 block text-[10px] font-bold text-[var(--accent)]">
                  {pkg.asset_ids.length} assets — view manifest
                </span>
              </span>
            </button>
          ))}
        </div>
      </details>
      ) : null}

      {openPackage && openManifest ? (
        <div className="mb-5">
          <PackageManifestPanel
            manifest={openManifest}
            description={openPackage.description}
            onClose={() => setOpenPackageId(null)}
          />
        </div>
      ) : null}

      {visibleAssets.length === 0 ? (
        <div className="grid min-h-[260px] place-items-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
          <div className="max-w-sm">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--accent)]">
              <LibraryBig size={20} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-sm font-bold text-[var(--ink)]">
              {filtersActive ? "No matching assets" : "No media assets yet"}
            </h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {filtersActive
                ? "Adjust the search or facet filters to return to the full library."
                : "Upload media from a project cockpit so review, approvals, versions, and sharing stay linked."}
            </p>
            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setSearchText("");
                  setRailFacets({});
                }}
                data-testid="empty-clear-filters"
                className="mt-4 inline-flex min-h-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-xs font-bold text-[var(--accent)]"
              >
                Clear filters
              </button>
            ) : (
              <Link
                href="/projects?demo=1"
                className="mt-4 inline-flex min-h-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-xs font-bold text-[var(--accent)]"
              >
                Open projects
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="library-grid">
          {visibleAssets.map((asset) => {
            const meta = surfaceData.metaByAssetId[asset.id];
            const sourceFacts = surfaceData.sourceFactsByAssetId[asset.id];
            const projectName = projectNameById.get(asset.project_id) ?? asset.project_id;
            return (
              <LibraryAssetCard
                key={asset.id}
                id={asset.id}
                title={asset.title}
                href={asset.href ?? `/projects/${asset.project_id}?demo=1`}
                projectName={projectName}
                projectHref={`/projects/${asset.project_id}?demo=1`}
                posterUrl={asset.thumbnail_url ?? null}
                videoUrl={asset.file_type === "video" ? (asset.file_url ?? null) : null}
                durationSeconds={sourceFacts?.durationSeconds ?? meta?.duration_seconds ?? asset.duration_seconds ?? null}
                resolution={sourceFacts?.resolution ?? meta?.resolution ?? null}
                sizeBytes={sourceFacts?.sizeBytes ?? meta?.file_size_bytes ?? null}
                meta={meta}
                hasFormats={Boolean(meta?.formats.length)}
                isFavorite={workspace.libraryFavorites.includes(asset.id)}
                onToggleFavorite={toggleDemoLibraryFavorite}
                onOpenFormats={setFormatsAssetId}
                onRequestCutdown={setCutdownAssetId}
              />
            );
          })}
        </div>
      )}

      {workspace.libraryCutdownRequests.length > 0 ? (
        <section
          aria-label="Recorded cutdown requests"
          data-testid="cutdown-requests-tray"
          className="mt-6 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
        >
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-[var(--dim)]">
            <Scissors size={12} aria-hidden="true" />
            Cutdown requests (local preview)
          </p>
          <ul className="mt-2 space-y-1">
            {workspace.libraryCutdownRequests.map((request) => (
              <li
                key={request.id}
                className="text-xs text-[var(--muted)]"
                data-testid={`cutdown-request-${request.id}`}
              >
                <strong className="text-[var(--ink)]">{request.asset_title}</strong> —{" "}
                {request.platform}, {formatDurationSeconds(request.duration_seconds)}
                {request.note ? ` — “${request.note}”` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {formatsAsset ? (
        <FormatMatrixDialog
          assetTitle={formatsAsset.title}
          formats={surfaceData.metaByAssetId[formatsAsset.id]?.formats ?? []}
          onClose={() => setFormatsAssetId(null)}
        />
      ) : null}

      {cutdownAsset ? (
        <CutdownRequestDialog
          assetTitle={cutdownAsset.title}
          platforms={surfaceData.metaByAssetId[cutdownAsset.id]?.platforms ?? []}
          onSubmit={handleCutdownSubmit}
          onClose={() => setCutdownAssetId(null)}
        />
      ) : null}
    </div>
  );
}
