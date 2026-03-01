"use client";

import { Search, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { Tag, FileType, AssetStatus } from "@/lib/types/codeliver";

export type AssetFilterState = {
  type: FileType | "all"; status: AssetStatus | "all"; tags: string[]; search: string;
  sort: "newest" | "oldest" | "name" | "size";
};

const TYPE_CHIPS: { value: FileType | "all"; label: string }[] = [
  { value: "all", label: "All" }, { value: "video", label: "Video" }, { value: "image", label: "Image" },
  { value: "audio", label: "Audio" }, { value: "document", label: "Document" },
];
const STATUS_OPTS: { value: AssetStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" }, { value: "draft", label: "Draft" }, { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" }, { value: "needs_changes", label: "Needs Changes" }, { value: "final", label: "Final" },
];
const SORT_OPTS: { value: AssetFilterState["sort"]; label: string }[] = [
  { value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A-Z" }, { value: "size", label: "Size" },
];

function Dropdown({ open, setOpen, label, children, align = "left" }: {
  open: boolean; setOpen: (v: boolean) => void; label: string; children: React.ReactNode; align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [setOpen]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--muted)] hover:text-[var(--ink)]">
        {label}<ChevronDown size={14} />
      </button>
      {open && <div className={`absolute top-full mt-1 ${align === "right" ? "right-0" : "left-0"} z-20 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-lg min-w-[160px]`}>{children}</div>}
    </div>
  );
}

export default function AssetFilters({ onFilterChange, tags, currentFilters }: {
  onFilterChange: (filters: AssetFilterState) => void; tags: Tag[]; currentFilters: AssetFilterState;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const update = (partial: Partial<AssetFilterState>) => onFilterChange({ ...currentFilters, ...partial });
  const toggleTag = (id: string) => {
    const next = currentFilters.tags.includes(id) ? currentFilters.tags.filter((t) => t !== id) : [...currentFilters.tags, id];
    update({ tags: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
        <input type="text" value={currentFilters.search} onChange={(e) => update({ search: e.target.value })} placeholder="Search assets..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--ink)] placeholder:text-[var(--dim)] focus:outline-none focus:border-[var(--accent)]" />
      </div>
      <div className="flex gap-1">
        {TYPE_CHIPS.map((c) => (
          <button key={c.value} onClick={() => update({ type: c.value })}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${currentFilters.type === c.value ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)] hover:text-[var(--ink)]"}`}>
            {c.label}
          </button>
        ))}
      </div>
      <Dropdown open={statusOpen} setOpen={setStatusOpen} label={STATUS_OPTS.find((s) => s.value === currentFilters.status)?.label || "Status"}>
        {STATUS_OPTS.map((o) => (
          <button key={o.value} onClick={() => { update({ status: o.value }); setStatusOpen(false); }}
            className={`block w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-2)] ${currentFilters.status === o.value ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}>
            {o.label}
          </button>
        ))}
      </Dropdown>
      {tags.length > 0 && (
        <Dropdown open={tagOpen} setOpen={setTagOpen} label={`Tags${currentFilters.tags.length > 0 ? ` (${currentFilters.tags.length})` : ""}`}>
          <div className="p-2 space-y-1">
            {tags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--surface-2)] rounded cursor-pointer">
                <input type="checkbox" checked={currentFilters.tags.includes(tag.id)} onChange={() => toggleTag(tag.id)} className="accent-[var(--accent)]" />
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />{tag.name}
              </label>
            ))}
          </div>
        </Dropdown>
      )}
      <Dropdown open={sortOpen} setOpen={setSortOpen} label={SORT_OPTS.find((s) => s.value === currentFilters.sort)?.label || "Sort"} align="right">
        {SORT_OPTS.map((o) => (
          <button key={o.value} onClick={() => { update({ sort: o.value }); setSortOpen(false); }}
            className={`block w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-2)] ${currentFilters.sort === o.value ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}>
            {o.label}
          </button>
        ))}
      </Dropdown>
    </div>
  );
}
