"use client";

import { ChevronRight, Home } from "lucide-react";
import type { Folder } from "@/lib/types/codeliver";

function buildPath(
  folders: Folder[],
  targetId: string | null
): { id: string | null; name: string }[] {
  if (!targetId) return [];

  const flatMap = new Map<string, Folder>();
  const flatten = (list: Folder[]) => {
    for (const f of list) {
      flatMap.set(f.id, f);
      if (f.children) flatten(f.children);
    }
  };
  flatten(folders);

  const path: { id: string | null; name: string }[] = [];
  let current: Folder | undefined = flatMap.get(targetId);
  while (current) {
    path.unshift({ id: current.id, name: current.name });
    current = current.parent_id ? flatMap.get(current.parent_id) : undefined;
  }
  return path;
}

export default function FolderBreadcrumb({
  folders,
  currentFolderId,
  onNavigate,
}: {
  folders: Folder[];
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
}) {
  const path = buildPath(folders, currentFolderId);

  return (
    <nav className="flex items-center gap-1 text-sm">
      <button
        onClick={() => onNavigate(null)}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[var(--surface-2)] transition-colors ${
          currentFolderId === null
            ? "text-[var(--ink)] font-medium"
            : "text-[var(--muted)] hover:text-[var(--ink)]"
        }`}
      >
        <Home size={14} />
        <span>Assets</span>
      </button>
      {path.map((segment, i) => (
        <span key={segment.id} className="flex items-center gap-1">
          <ChevronRight size={14} className="text-[var(--dim)]" />
          <button
            onClick={() => onNavigate(segment.id)}
            className={`px-1.5 py-0.5 rounded hover:bg-[var(--surface-2)] transition-colors ${
              i === path.length - 1
                ? "text-[var(--ink)] font-medium"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {segment.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
