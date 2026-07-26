"use client";

import { Search, SlidersHorizontal, Star, X } from "lucide-react";
import type { LibraryFacetFilters } from "@/lib/assets/types";

export interface LibraryFacetOptions {
  campaigns: string[];
  platforms: string[];
  formats: string[];
  orientations: string[];
  rights: string[];
  products: string[];
  talents: string[];
}

export interface LibraryFilterRailProps {
  searchText: string;
  onSearchTextChange: (value: string) => void;
  facets: LibraryFacetFilters;
  onFacetsChange: (facets: LibraryFacetFilters) => void;
  options: LibraryFacetOptions;
  resultCount: number;
}

const RIGHTS_OPTIONS = [
  { value: "paid_until", label: "Paid usage (time-boxed)" },
  { value: "internal_only", label: "Internal only" },
  { value: "unlimited", label: "Unlimited / buyout" },
];

function FacetSelect({
  label,
  value,
  values,
  labels,
  testId,
  onChange,
}: {
  label: string;
  value: string | undefined;
  values: string[];
  labels?: Record<string, string>;
  testId: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[10px] font-bold text-[var(--muted)]">
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        aria-label={`${label} filter`}
        data-testid={testId}
        className="max-w-36 bg-transparent text-[10px] font-bold text-[var(--ink)] outline-none"
      >
        <option value="">All</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function LibraryFilterRail({
  searchText,
  onSearchTextChange,
  facets,
  onFacetsChange,
  options,
  resultCount,
}: LibraryFilterRailProps) {
  const rightsLabels = Object.fromEntries(RIGHTS_OPTIONS.map((option) => [option.value, option.label]));
  const hasActiveFacets =
    Object.values(facets).some((value) => value !== undefined && value !== "" && value !== false) ||
    searchText.trim().length > 0;

  function setFacet(patch: Partial<LibraryFacetFilters>) {
    onFacetsChange({ ...facets, ...patch });
  }

  function clearAll() {
    onSearchTextChange("");
    onFacetsChange({});
  }

  return (
    <div className="mb-5 space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
        <input
          type="text"
          placeholder='Search assets — try campaign:"ICA Roadshow" platform:linkedin'
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          aria-label="Search asset library"
          data-testid="library-search"
          className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] pl-10 pr-4 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
        />
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="Library facet filters"
        data-testid="library-facet-rail"
      >
        <SlidersHorizontal size={14} className="text-[var(--dim)]" aria-hidden="true" />
        <FacetSelect
          label="Campaign"
          value={facets.campaign}
          values={options.campaigns}
          testId="facet-campaign"
          onChange={(value) => setFacet({ campaign: value })}
        />
        <FacetSelect
          label="Platform"
          value={facets.platform}
          values={options.platforms}
          testId="facet-platform"
          onChange={(value) => setFacet({ platform: value })}
        />
        <FacetSelect
          label="Format"
          value={facets.format}
          values={options.formats}
          testId="facet-format"
          onChange={(value) => setFacet({ format: value })}
        />
        <FacetSelect
          label="Orientation"
          value={facets.orientation}
          values={options.orientations}
          testId="facet-orientation"
          onChange={(value) => setFacet({ orientation: value })}
        />
        <FacetSelect
          label="Product"
          value={facets.product}
          values={options.products}
          testId="facet-product"
          onChange={(value) => setFacet({ product: value })}
        />
        <FacetSelect
          label="Talent"
          value={facets.talent}
          values={options.talents}
          testId="facet-talent"
          onChange={(value) => setFacet({ talent: value })}
        />
        <FacetSelect
          label="Rights"
          value={facets.rights}
          values={RIGHTS_OPTIONS.map((option) => option.value)}
          labels={rightsLabels}
          testId="facet-rights"
          onChange={(value) => setFacet({ rights: value })}
        />

        <label className="flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[10px] font-bold text-[var(--muted)]">
          From
          <input
            type="date"
            value={facets.dateFrom ?? ""}
            onChange={(event) => setFacet({ dateFrom: event.target.value || undefined })}
            aria-label="Created after"
            data-testid="facet-date-from"
            className="bg-transparent text-[10px] text-[var(--ink)] outline-none"
          />
        </label>
        <label className="flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[10px] font-bold text-[var(--muted)]">
          To
          <input
            type="date"
            value={facets.dateTo ?? ""}
            onChange={(event) => setFacet({ dateTo: event.target.value || undefined })}
            aria-label="Created before"
            data-testid="facet-date-to"
            className="bg-transparent text-[10px] text-[var(--ink)] outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() => setFacet({ favoritesOnly: !facets.favoritesOnly || undefined })}
          aria-pressed={facets.favoritesOnly === true}
          data-testid="facet-favorites"
          className={`inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] border px-2 text-[10px] font-bold ${
            facets.favoritesOnly
              ? "border-[var(--accent)] bg-[var(--cvp-blue-tint)] text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          <Star size={11} aria-hidden="true" fill={facets.favoritesOnly ? "currentColor" : "none"} />
          Favorites
        </button>

        {hasActiveFacets ? (
          <button
            type="button"
            onClick={clearAll}
            data-testid="clear-filters"
            className="inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 text-[10px] font-bold text-[var(--accent)]"
          >
            <X size={11} aria-hidden="true" />
            Clear filters
          </button>
        ) : null}

        <span className="ml-auto text-[10px] text-[var(--dim)]" data-testid="library-result-count">
          {resultCount} {resultCount === 1 ? "asset" : "assets"}
        </span>
      </div>
    </div>
  );
}
