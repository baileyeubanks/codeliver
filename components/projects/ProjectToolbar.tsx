"use client";

import { useState } from "react";
import {
  Search,
  BriefcaseBusiness,
  ChevronDown,
  Grid3X3,
  Table2,
  LayoutGrid,
  SlidersHorizontal,
} from "lucide-react";

export type ViewMode = "masonry" | "grid" | "table";
export type SortMode = "az" | "created";

interface ProjectToolbarProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectAll: boolean;
  onSelectAll: (v: boolean) => void;
  onNewProject: () => void;
  thumbnailSize: number;
  onThumbnailSize: (v: number) => void;
}

export default function ProjectToolbar({
  viewMode,
  onViewChange,
  sortMode,
  onSortChange,
  searchQuery,
  onSearchChange,
  selectAll,
  onSelectAll,
  onNewProject,
  thumbnailSize,
  onThumbnailSize,
}: ProjectToolbarProps) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 flex-wrap px-1 py-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-[280px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
        <input
          type="text"
          placeholder="Search folder..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="input pl-8"
          style={{ padding: "6px 10px 6px 32px", fontSize: "0.78rem" }}
        />
      </div>

      {/* Sort */}
      <select
        value={sortMode}
        onChange={(e) => onSortChange(e.target.value as SortMode)}
        className="select"
      >
        <option value="az">A–Z</option>
        <option value="created">Created date</option>
      </select>

      {/* Select all */}
      <label className="flex items-center gap-2 text-xs text-[var(--muted)] cursor-pointer">
        <input
          type="checkbox"
          checked={selectAll}
          onChange={(e) => onSelectAll(e.target.checked)}
          className="w-3.5 h-3.5 accent-[var(--accent)]"
        />
        Select all
      </label>

      <div className="flex-1" />

      {/* New project */}
      <button onClick={onNewProject} className="btn btn-secondary" title="New project">
        <BriefcaseBusiness size={14} />
        New Project
      </button>

      {/* View toggle */}
      <div className="relative">
        <button
          onClick={() => setViewMenuOpen(!viewMenuOpen)}
          className="btn btn-secondary"
        >
          {viewMode === "table" ? <Table2 size={14} /> : viewMode === "grid" ? <Grid3X3 size={14} /> : <LayoutGrid size={14} />}
          <ChevronDown size={12} />
        </button>
        {viewMenuOpen && (
          <div className="dropdown" style={{ right: 0, top: "calc(100% + 4px)" }}>
            <button className={`dropdown-item ${viewMode === "masonry" ? "text-[var(--accent)]" : ""}`} onClick={() => { onViewChange("masonry"); setViewMenuOpen(false); }}>
              <LayoutGrid size={14} /> Masonry
            </button>
            <button className={`dropdown-item ${viewMode === "grid" ? "text-[var(--accent)]" : ""}`} onClick={() => { onViewChange("grid"); setViewMenuOpen(false); }}>
              <Grid3X3 size={14} /> Grid
            </button>
            <button className={`dropdown-item ${viewMode === "table" ? "text-[var(--accent)]" : ""}`} onClick={() => { onViewChange("table"); setViewMenuOpen(false); }}>
              <Table2 size={14} /> Table
            </button>
          </div>
        )}
      </div>

      {/* Thumbnail slider (only for grid/masonry) */}
      {viewMode !== "table" && (
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={13} className="text-[var(--dim)]" />
          <input
            type="range"
            min={160}
            max={320}
            value={thumbnailSize}
            onChange={(e) => onThumbnailSize(Number(e.target.value))}
            className="w-20 accent-[var(--accent)]"
          />
        </div>
      )}
    </div>
  );
}
