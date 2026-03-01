"use client";

import { useState } from "react";
import { Search, ChevronDown } from "lucide-react";

export type CommentFilterState = {
  status: "all" | "open" | "resolved";
  search: string;
  sort: "newest" | "oldest" | "timecode";
};

interface CommentFiltersProps {
  onFilterChange: (filters: CommentFilterState) => void;
  commentCount: number;
  resolvedCount: number;
}

const STATUS_TABS: { key: CommentFilterState["status"]; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
];

const SORT_OPTIONS: { key: CommentFilterState["sort"]; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "timecode", label: "By Timecode" },
];

export default function CommentFilters({
  onFilterChange,
  commentCount,
  resolvedCount,
}: CommentFiltersProps) {
  const [filters, setFilters] = useState<CommentFilterState>({
    status: "all",
    search: "",
    sort: "newest",
  });
  const [sortOpen, setSortOpen] = useState(false);

  function update(partial: Partial<CommentFilterState>) {
    const next = { ...filters, ...partial };
    setFilters(next);
    onFilterChange(next);
  }

  function countForTab(key: CommentFilterState["status"]): number {
    if (key === "all") return commentCount;
    if (key === "resolved") return resolvedCount;
    return commentCount - resolvedCount;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Status chips */}
      <div className="flex items-center gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => update({ status: tab.key })}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filters.status === tab.key
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {tab.label} ({countForTab(tab.key)})
          </button>
        ))}
      </div>

      {/* Search + sort row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dim)]"
          />
          <input
            type="text"
            placeholder="Search comments..."
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-xs text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen(!sortOpen)}
            className="flex h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          >
            {SORT_OPTIONS.find((o) => o.key === filters.sort)?.label}
            <ChevronDown size={12} />
          </button>

          {sortOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    update({ sort: opt.key });
                    setSortOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                    filters.sort === opt.key
                      ? "text-[var(--accent)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
