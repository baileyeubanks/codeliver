"use client";

import { useState, useRef, useEffect } from "react";
import { Folder as FolderIcon, FolderOpen, ChevronRight, Plus, MoreHorizontal, Pencil, Trash2, FolderPlus } from "lucide-react";
import type { Folder } from "@/lib/types/codeliver";

type NodeProps = {
  folder: Folder; depth: number; currentFolderId: string | null;
  onSelectFolder: (id: string | null) => void; onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void; onDeleteFolder: (id: string) => void;
};

function FolderNode({ folder, depth, currentFolderId, onSelectFolder, onCreateFolder, onRenameFolder, onDeleteFolder }: NodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(folder.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isActive = currentFolderId === folder.id;
  const hasChildren = folder.children && folder.children.length > 0;

  useEffect(() => { if (renaming && inputRef.current) inputRef.current.focus(); }, [renaming]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const doRename = () => {
    if (renameVal.trim() && renameVal.trim() !== folder.name) onRenameFolder(folder.id, renameVal.trim());
    setRenaming(false);
  };

  const menuItems = [
    { icon: Pencil, label: "Rename", color: "text-[var(--ink)]", action: () => { setMenuOpen(false); setRenaming(true); setRenameVal(folder.name); } },
    { icon: FolderPlus, label: "New Subfolder", color: "text-[var(--ink)]", action: () => { setMenuOpen(false); const n = prompt("Subfolder name:"); if (n?.trim()) onCreateFolder(n.trim(), folder.id); } },
    { icon: Trash2, label: "Delete", color: "text-[var(--red)]", action: () => { setMenuOpen(false); if (confirm(`Delete "${folder.name}"?`)) onDeleteFolder(folder.id); } },
  ];

  return (
    <div>
      <div className={`group flex items-center gap-1 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer transition-colors ${isActive ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }} onClick={() => onSelectFolder(folder.id)}>
        <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className={`flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""} ${hasChildren ? "opacity-100" : "opacity-0"}`}>
          <ChevronRight size={14} />
        </button>
        {expanded ? <FolderOpen size={16} className="flex-shrink-0" /> : <FolderIcon size={16} className="flex-shrink-0" />}
        {renaming ? (
          <input ref={inputRef} value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onBlur={doRename}
            onKeyDown={(e) => { if (e.key === "Enter") doRename(); if (e.key === "Escape") setRenaming(false); }}
            className="flex-1 text-sm bg-transparent border-b border-[var(--accent)] outline-none text-[var(--ink)] min-w-0" onClick={(e) => e.stopPropagation()} />
        ) : (
          <span className="flex-1 text-sm truncate">{folder.name}</span>
        )}
        <div ref={menuRef} className="relative flex-shrink-0">
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--surface)] rounded">
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] shadow-lg min-w-[140px] py-1">
              {menuItems.map((m) => (
                <button key={m.label} onClick={(e) => { e.stopPropagation(); m.action(); }}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs ${m.color} hover:bg-[var(--surface-2)]`}>
                  <m.icon size={12} />{m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {expanded && hasChildren && folder.children!.map((child) => (
        <FolderNode key={child.id} folder={child} depth={depth + 1} currentFolderId={currentFolderId}
          onSelectFolder={onSelectFolder} onCreateFolder={onCreateFolder} onRenameFolder={onRenameFolder} onDeleteFolder={onDeleteFolder} />
      ))}
    </div>
  );
}

export default function FolderTree({ folders, currentFolderId, onSelectFolder, onCreateFolder, onRenameFolder, onDeleteFolder }: {
  folders: Folder[]; currentFolderId: string | null;
  onSelectFolder: (id: string | null) => void; onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void; onDeleteFolder: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <button onClick={() => onSelectFolder(null)}
        className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors ${currentFolderId === null ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"}`}>
        <FolderIcon size={16} />All Assets
      </button>
      {folders.map((f) => (
        <FolderNode key={f.id} folder={f} depth={0} currentFolderId={currentFolderId}
          onSelectFolder={onSelectFolder} onCreateFolder={onCreateFolder} onRenameFolder={onRenameFolder} onDeleteFolder={onDeleteFolder} />
      ))}
      <button onClick={() => { const n = prompt("Folder name:"); if (n?.trim()) onCreateFolder(n.trim(), null); }}
        className="flex items-center gap-2 w-full px-2 py-1.5 mt-2 rounded-[var(--radius-sm)] text-xs text-[var(--dim)] hover:text-[var(--muted)] hover:bg-[var(--surface-2)] transition-colors">
        <Plus size={14} />New Folder
      </button>
    </div>
  );
}
