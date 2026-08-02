"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  FolderOpen,
  FolderClosed,
  ChevronRight,
  ChevronDown,
  Archive,
  Trash2,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import { useDemoMode, useDemoSuffix } from "@/lib/demo/mode";

export interface FolderNode {
  id: string;
  name: string;
  project_id?: string;
  kind?: "project" | "folder";
  children: FolderNode[];
}

export interface FolderSelection {
  projectId: string;
  folderId: string | null;
}

interface FolderTreeProps {
  folders: FolderNode[];
  collapsed: boolean;
  onToggle: () => void;
  activeProjectId?: string | null;
  activeFolderId?: string | null;
  onSelectionChange?: (selection: FolderSelection) => void;
  overviewActive?: boolean;
  onOverviewSelect?: () => void;
}

function branchContainsFolder(folder: FolderNode, folderId?: string | null): boolean {
  if (!folderId) return false;
  return folder.id === folderId
    || folder.children.some((child) => branchContainsFolder(child, folderId));
}

function FolderRow({
  folder,
  depth = 0,
  activeProjectId,
  activeFolderId,
  onSelectionChange,
}: {
  folder: FolderNode;
  depth?: number;
  activeProjectId?: string | null;
  activeFolderId?: string;
  onSelectionChange?: (selection: FolderSelection) => void;
}) {
  const [manuallyExpanded, setManuallyExpanded] = useState(depth === 0);
  const expanded = manuallyExpanded || branchContainsFolder(folder, activeFolderId);
  const projectId = folder.project_id ?? folder.id;
  const isProject = folder.kind === "project";
  const isActive = isProject
    ? projectId === activeProjectId && !activeFolderId
    : folder.id === activeFolderId;
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
            setManuallyExpanded(!expanded);
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
        {onSelectionChange ? (
          <button
            type="button"
            onClick={() => onSelectionChange({
              projectId,
              folderId: isProject ? null : folder.id,
            })}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
          >
            {expanded ? (
              <FolderOpen size={15} className={isActive ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
            ) : (
              <FolderClosed size={15} className={isActive ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
            )}
            <span className="truncate text-sm" title={folder.name}>{folder.name}</span>
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
          <span className="truncate text-sm" title={folder.name}>{folder.name}</span>
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
              activeProjectId={activeProjectId}
              activeFolderId={activeFolderId}
              onSelectionChange={onSelectionChange}
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
  activeProjectId,
  activeFolderId,
  onSelectionChange,
  overviewActive = false,
  onOverviewSelect,
}: FolderTreeProps) {
  const demoMode = useDemoMode();
  const demoSuffix = useDemoSuffix();
  const [railWidth, setRailWidth] = useState(272);
  const resizingRef = useRef(false);

  useEffect(() => {
    function stopResizing() {
      resizingRef.current = false;
      document.documentElement.classList.remove("project-rail-resizing");
    }

    function resize(event: PointerEvent) {
      if (!resizingRef.current) return;
      setRailWidth(Math.max(240, Math.min(360, Math.round(event.clientX))));
    }

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, []);

  function startResizing(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    resizingRef.current = true;
    document.documentElement.classList.add("project-rail-resizing");
  }

  return (
    <>
      <button
        type="button"
        className="projects-folder-backdrop"
        onClick={onToggle}
        aria-label="Close project folders"
        aria-hidden={collapsed || undefined}
        tabIndex={collapsed ? -1 : 0}
      />
      {collapsed ? (
        <div className="projects-rail-reopen">
          <button type="button" onClick={onToggle} title="Open projects" aria-label="Open projects">
            <PanelLeftOpen size={17} />
            <span>Projects</span>
          </button>
        </div>
      ) : (
      <aside
        className="sidebar projects-folder-rail"
        aria-label="Project folders"
        style={{ "--project-rail-width": `${railWidth}px` } as CSSProperties}
      >
        <div className="sidebar-header">
          <span className="projects-folder-title">Projects</span>
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

        <div className="projects-folder-scroll py-2">
            <>
              {onOverviewSelect ? (
                <button
                  type="button"
                  className={`folder-item ${overviewActive ? "active" : ""}`}
                  style={{ width: "calc(100% - 18px)", border: 0, font: "inherit", textAlign: "left" }}
                  onClick={onOverviewSelect}
                >
                  <LayoutDashboard size={15} className={overviewActive ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
                  <span className="truncate text-sm">Overview</span>
                </button>
              ) : null}
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
                    activeProjectId={activeProjectId}
                    activeFolderId={activeFolderId ?? undefined}
                    onSelectionChange={onSelectionChange}
                  />
                ))
              )}
            </>
        </div>

        {demoMode ? (
          <div className="projects-folder-footer border-t border-[var(--border)] py-1">
            <Link href={`/projects/archive${demoSuffix}`} className="folder-item">
              <Archive size={15} className="text-[var(--muted)]" />
              <span className="text-sm">Archive</span>
            </Link>
            <Link href={`/projects/trash${demoSuffix}`} className="folder-item">
              <Trash2 size={15} className="text-[var(--muted)]" />
              <span className="text-sm">Trash</span>
            </Link>
          </div>
        ) : null}
        <button
          type="button"
          className="projects-rail-resize"
          onPointerDown={startResizing}
          aria-label="Resize project navigation"
          title="Drag to resize project navigation"
        />
      </aside>
      )}
    </>
  );
}
