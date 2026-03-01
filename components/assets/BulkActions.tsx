"use client";

import { useState, useRef, useEffect } from "react";
import { FolderInput, TagIcon, Trash2, Download, X, ChevronDown, Loader2 } from "lucide-react";
import type { Folder, Tag } from "@/lib/types/codeliver";

function useClickOutside(ref: React.RefObject<HTMLDivElement | null>, handler: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) handler(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, handler]);
}

function flattenFolders(list: Folder[], depth = 0): { id: string; name: string; depth: number }[] {
  return list.flatMap((f) => [{ id: f.id, name: f.name, depth }, ...(f.children ? flattenFolders(f.children, depth + 1) : [])]);
}

export default function BulkActions({ selectedIds, projectId, folders, tags, onComplete }: {
  selectedIds: string[]; projectId: string; folders: Folder[]; tags: Tag[]; onComplete: () => void;
}) {
  const [folderOpen, setFolderOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const folderRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  useClickOutside(folderRef, () => setFolderOpen(false));
  useClickOutside(tagRef, () => setTagOpen(false));

  if (selectedIds.length === 0) return null;

  const bulkAction = async (action: string, extra: Record<string, string> = {}) => {
    setLoading(action);
    try {
      await fetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, asset_ids: selectedIds, ...extra }) });
      onComplete();
    } finally { setLoading(null); setFolderOpen(false); setTagOpen(false); }
  };

  const handleDelete = async () => { if (confirm(`Delete ${selectedIds.length} asset(s)?`)) await bulkAction("delete"); };

  const handleDownload = async () => {
    setLoading("download");
    try {
      const JSZip = (await import("jszip")).default;
      const { saveAs } = await import("file-saver");
      const zip = new JSZip();
      for (const id of selectedIds) {
        const res = await fetch(`/api/assets/${id}/download`);
        if (!res.ok) continue;
        zip.file(res.headers.get("x-filename") || `asset-${id}`, await res.blob());
      }
      saveAs(await zip.generateAsync({ type: "blob" }), `assets-${Date.now()}.zip`);
    } finally { setLoading(null); }
  };

  const BtnIcon = ({ action, icon: I, label, onClick }: { action: string; icon: typeof Trash2; label: string; onClick: () => void }) => (
    <button onClick={onClick} disabled={loading !== null}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-[var(--radius-sm)] transition-colors ${action === "delete" ? "text-[var(--red)] hover:bg-[var(--red)]/10" : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"}`}>
      {loading === action ? <Loader2 size={14} className="animate-spin" /> : <I size={14} />}{label}
    </button>
  );

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] shadow-2xl">
      <span className="text-sm font-medium text-[var(--ink)]">{selectedIds.length} selected</span>
      <div className="w-px h-5 bg-[var(--border)]" />

      <div ref={folderRef} className="relative">
        <button onClick={() => setFolderOpen(!folderOpen)} disabled={loading !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] rounded-[var(--radius-sm)]">
          {loading === "move" ? <Loader2 size={14} className="animate-spin" /> : <FolderInput size={14} />}Move<ChevronDown size={12} />
        </button>
        {folderOpen && (
          <div className="absolute bottom-full mb-2 left-0 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-lg min-w-[180px] max-h-48 overflow-y-auto py-1">
            <button onClick={() => bulkAction("move", { folder_id: "" })} className="block w-full text-left px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-2)]">Root (no folder)</button>
            {flattenFolders(folders).map((f) => (
              <button key={f.id} onClick={() => bulkAction("move", { folder_id: f.id })} className="block w-full text-left px-3 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--surface-2)]" style={{ paddingLeft: `${12 + f.depth * 12}px` }}>{f.name}</button>
            ))}
          </div>
        )}
      </div>

      <div ref={tagRef} className="relative">
        <button onClick={() => setTagOpen(!tagOpen)} disabled={loading !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] rounded-[var(--radius-sm)]">
          {loading === "tag" ? <Loader2 size={14} className="animate-spin" /> : <TagIcon size={14} />}Tag<ChevronDown size={12} />
        </button>
        {tagOpen && tags.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-lg min-w-[160px] py-1">
            {tags.map((t) => (
              <button key={t.id} onClick={() => bulkAction("tag", { tag_id: t.id })} className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--surface-2)]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />{t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <BtnIcon action="download" icon={Download} label="Download" onClick={handleDownload} />
      <BtnIcon action="delete" icon={Trash2} label="Delete" onClick={handleDelete} />
      <div className="w-px h-5 bg-[var(--border)]" />
      <button onClick={onComplete} className="text-[var(--dim)] hover:text-[var(--ink)]"><X size={16} /></button>
    </div>
  );
}
