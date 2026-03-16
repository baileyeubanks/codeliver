"use client";

import { useState } from "react";
import {
  Search,
  ArrowDownAZ,
  CheckSquare,
  FolderPlus,
  Upload,
  ChevronDown,
  Grid3X3,
  Table2,
  LayoutGrid,
  SlidersHorizontal,
  CloudDownload,
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
  onNewFolder: () => void;
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
  onNewFolder,
  thumbnailSize,
  onThumbnailSize,
}: ProjectToolbarProps) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);

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

      {/* Batch action */}
      <button className="btn-icon" title="Batch actions">
        <CheckSquare size={16} />
      </button>

      <div className="flex-1" />

      {/* New folder */}
      <button onClick={onNewFolder} className="btn btn-secondary" title="New folder">
        <FolderPlus size={14} />
        New Folder
      </button>

      {/* Upload split button */}
      <div className="relative flex">
        <button className="btn-upload" style={{ borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)" }}>
          <Upload size={14} />
          Upload
        </button>
        <button
          onClick={() => setUploadMenuOpen(!uploadMenuOpen)}
          className="btn-upload"
          style={{
            borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
            borderLeft: "1px solid rgba(255,255,255,0.2)",
            padding: "7px 8px",
          }}
        >
          <ChevronDown size={13} />
        </button>
        {uploadMenuOpen && (
          <div className="dropdown" style={{ right: 0, top: "calc(100% + 4px)" }}>
            <button className="dropdown-item" onClick={() => setUploadMenuOpen(false)}>
              <CloudDownload size={14} /> Import from cloud
            </button>
          </div>
        )}
      </div>

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
