"use client";

import { useState } from "react";
import {
  FolderOpen,
  FolderClosed,
  ChevronRight,
  ChevronDown,
  Archive,
  Trash2,
  Bookmark,
  PanelLeftClose,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDemoSuffix } from "@/lib/demo/mode";

export interface FolderNode {
  id: string;
  name: string;
  children: FolderNode[];
}

interface FolderTreeProps {
  folders: FolderNode[];
  collapsed: boolean;
  onToggle: () => void;
  activeFolderId?: string | null;
  onFolderSelect?: (id: string) => void;
}

function FolderRow({
  folder,
  depth = 0,
  activeFolderId,
  onFolderSelect,
}: {
  folder: FolderNode;
  depth?: number;
  activeFolderId?: string;
  onFolderSelect?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isActive = folder.id === activeFolderId;
  const hasChildren = folder.children.length > 0;

  return (
    <>
      <div
        className={`folder-item ${isActive ? "active" : ""}`}
        style={{ paddingLeft: 16 + depth * 20 }}
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
          style={{ visibility: hasChildren ? "visible" : "hidden" }}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${folder.name}`}
        >
          {expanded ? (
            <ChevronDown size={13} className="text-[var(--dim)]" />
          ) : (
            <ChevronRight size={13} className="text-[var(--dim)]" />
          )}
        </button>
        {onFolderSelect ? (
          <button
            type="button"
            onClick={() => onFolderSelect(folder.id)}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
          >
            {expanded ? (
              <FolderOpen size={15} className={isActive ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
            ) : (
              <FolderClosed size={15} className={isActive ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
            )}
            <span className="truncate text-sm">{folder.name}</span>
          </button>
        ) : (
          <Link
            href={`/projects/${folder.id}`}
            className="flex items-center gap-2 flex-1 min-w-0"
          >
          {expanded ? (
            <FolderOpen size={15} className={isActive ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
          ) : (
            <FolderClosed size={15} className={isActive ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
          )}
          <span className="truncate text-sm">{folder.name}</span>
          </Link>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderRow
              key={child.id}
              folder={child}
              depth={depth + 1}
              activeFolderId={activeFolderId}
              onFolderSelect={onFolderSelect}
            />
          ))}
        </div>
      )}

      {expanded && !hasChildren && depth > 0 && (
        <div
          className="text-xs text-[var(--dim)] italic"
          style={{ paddingLeft: 16 + (depth + 1) * 20, padding: "4px 16px 4px " + (16 + (depth + 1) * 20) + "px" }}
        >
          No folders
        </div>
      )}
    </>
  );
}

export default function FolderTree({
  folders,
  collapsed,
  onToggle,
  activeFolderId: activeFolderIdOverride,
  onFolderSelect,
}: FolderTreeProps) {
  const pathname = usePathname();
  const demoSuffix = useDemoSuffix();
  const [viewMode, setViewMode] = useState<"library" | "bookmarks">("library");

  // Extract active folder ID from pathname
  const segments = pathname.split("/");
  const activeFolderId = activeFolderIdOverride ?? (segments.length > 2 ? segments[2] : undefined);

  if (collapsed) return null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value as "library" | "bookmarks")}
          className="select text-xs"
        >
          <option value="library">Project Library</option>
          <option value="bookmarks">Bookmarks</option>
        </select>
        <button
          type="button"
          className="btn-icon"
          onClick={onToggle}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div className="flex-1 py-2 overflow-y-auto">
        {viewMode === "library" ? (
          <>
            {folders.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <FolderOpen size={24} className="mx-auto mb-2 text-[var(--dim)]" />
                <p className="text-xs text-[var(--muted)]">No project folders</p>
              </div>
            ) : (
              folders.map((folder) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  activeFolderId={activeFolderId}
                  onFolderSelect={onFolderSelect}
                />
              ))
            )}
          </>
        ) : (
          <div className="px-4 py-8 text-center">
            <Bookmark size={24} className="mx-auto mb-2 text-[var(--dim)]" />
            <p className="text-xs text-[var(--muted)]">No bookmarked items</p>
          </div>
        )}
      </div>

      {/* Bottom links */}
      <div className="border-t border-[var(--border)] py-1">
        <Link href={`/projects/archive${demoSuffix}`} className="folder-item">
          <Archive size={15} className="text-[var(--muted)]" />
          <span className="text-sm">Archive</span>
        </Link>
        <Link href={`/projects/trash${demoSuffix}`} className="folder-item">
          <Trash2 size={15} className="text-[var(--muted)]" />
          <span className="text-sm">Trash</span>
        </Link>
      </div>
    </aside>
  );
}
