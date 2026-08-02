"use client";

import {
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  ListChecks,
  Menu,
  MessageSquare,
  Plus,
  Share2,
  Shield,
  Upload,
} from "lucide-react";
import FolderTree from "@/components/projects/FolderTree";
import ProjectToolbar, { type ViewMode, type SortMode } from "@/components/projects/ProjectToolbar";
import MediaCard, { type MediaAsset } from "@/components/projects/MediaCard";
import MediaTable from "@/components/projects/MediaTable";
import AssetUpload from "@/components/assets/AssetUpload";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DemoShareModal from "@/components/demo/DemoShareModal";
import {
  addDemoAssets,
  archiveDemoAsset,
  createDemoProject,
  createDemoShareLinks,
  moveDemoAssetToTrash,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import { useDemoMode, useDemoSuffix } from "@/lib/demo/mode";
import { buildInternalDemoAssetHref } from "@/lib/demo/workspace";

interface Project {
  id: string;
  name: string;
}

const MOBILE_PROJECTS_QUERY = "(max-width: 768px)";
const AUTHORITATIVE_UPLOAD_INPUT_ID = "projects-authoritative-upload-input";

const lifecyclePath = [
  {
    label: "Pre-Production",
    detail: "Project shell and brief",
    icon: FileText,
  },
  {
    label: "Production",
    detail: "Media upload and versions",
    icon: Upload,
  },
  {
    label: "Post-Production",
    detail: "Comments and approvals",
    icon: MessageSquare,
  },
  {
    label: "Delivery & Assets",
    detail: "Share links and exports",
    icon: CheckCircle2,
  },
];

function subscribeToMobileViewport(onChange: () => void) {
  const media = window.matchMedia(MOBILE_PROJECTS_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getMobileViewportSnapshot() {
  return window.matchMedia(MOBILE_PROJECTS_QUERY).matches;
}

export default function ProjectsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMobile = useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    () => false,
  );
  const demoMode = useDemoMode();
  const demoSuffix = useDemoSuffix();
  const [sidebarOverride, setSidebarOverride] = useState<boolean | null>(null);
  const sidebarOpen = sidebarOverride ?? !isMobile;
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [thumbnailSize, setThumbnailSize] = useState(220);
  const [remoteAssets, setRemoteAssets] = useState<MediaAsset[]>([]);
  const [remoteProjects, setRemoteProjects] = useState<Project[]>([]);
  const demoWorkspace = useDemoWorkspace();
  const [activeProject, setActiveProject] = useState<string | null>(() =>
    demoMode ? "ica" : null,
  );
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const folders = demoMode
    ? demoWorkspace.folders
    : remoteProjects.map((project) => ({
        id: project.id,
        name: project.name,
        children: [],
      }));
  const assets = demoMode ? demoWorkspace.assets : remoteAssets;
  const projects = demoMode ? demoWorkspace.projects : remoteProjects;
  const loading = demoMode ? false : remoteLoading;
  const canonicalProjectId =
    !demoMode &&
    activeProject &&
    activeProject !== "all" &&
    remoteProjects.some((project) => project.id === activeProject)
      ? activeProject
      : null;

  const refreshRemoteAssets = useCallback(() => {
    if (demoMode) return;
    void fetch("/api/assets", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { items?: MediaAsset[] };
        setRemoteAssets(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch(() => undefined);
  }, [demoMode]);

  useEffect(() => {
    if (demoMode) return;

    // The project rail and asset list share one project identity source.
    Promise.all([
      fetch("/api/projects").then((r) => r.ok ? r.json() : { items: [] }),
      fetch("/api/assets").then((r) => r.ok ? r.json() : { items: [] }),
    ])
      .then(([p, a]) => {
        const projectList = p.items ?? p ?? [];
        setRemoteProjects(Array.isArray(projectList) ? projectList : []);
        setRemoteAssets(a.items ?? []);
        // Select first project if available
        if (Array.isArray(projectList) && projectList.length > 0) {
          setActiveProject(projectList[0].id);
        } else {
          setActiveProject(null);
        }
      })
      .catch(() => {})
      .finally(() => setRemoteLoading(false));
  }, [demoMode]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  // Filter & sort
  const filtered = useMemo(() => {
    let items = assets;
    if (activeProject && activeProject !== "all") {
      items = items.filter((a) => a.project_id === activeProject);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((a) => a.title.toLowerCase().includes(q));
    }
    if (sortMode === "az") {
      items = [...items].sort((a, b) => a.title.localeCompare(b.title));
    } else {
      items = [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return items;
  }, [assets, searchQuery, sortMode, activeProject]);
  const activeProjectName = projects.find((p) => p.id === activeProject)?.name ?? "All production media";
  const visibleAssetIds = useMemo(() => new Set(filtered.map((asset) => asset.id)), [filtered]);
  const activeShareLinks = demoMode
    ? demoWorkspace.shareLinks.filter(
        (link) =>
          link.is_active &&
          link.asset_ids.some((assetId) => visibleAssetIds.has(assetId)),
      ).length
    : 0;
  const reviewReadyCount = filtered.filter((asset) =>
    ["in_review", "needs_changes", "approved", "final"].includes(asset.status),
  ).length;
  const projectReadiness = [
    {
      label: "Workspaces",
      value: projects.length,
      detail: "Production folders",
      icon: FolderOpen,
    },
    {
      label: "Visible assets",
      value: filtered.length,
      detail: searchQuery ? "Filtered results" : "In this view",
      icon: Upload,
    },
    {
      label: "Review-ready",
      value: reviewReadyCount,
      detail: "Shared or decisioned",
      icon: ListChecks,
    },
    {
      label: "Active links",
      value: activeShareLinks,
      detail: demoMode ? "Local review portals" : "Open from sharing",
      icon: Shield,
    },
  ];
  const primaryReviewHref = filtered[0]?.href
    ?? (activeProject && activeProject !== "all"
      ? `/projects/${activeProject}${demoSuffix}`
      : `/projects${demoSuffix}`);

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    setSelectAll(filtered.length > 0 && next.size === filtered.length);
  }

  function handleSelectAll(val: boolean) {
    setSelectAll(val);
    if (val) {
      setSelectedIds(new Set(filtered.map((a) => a.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function shareSingleAsset(assetId: string) {
    setSelectedIds(new Set([assetId]));
    setSelectAll(false);
    setShareOpen(true);
  }

  function archiveSingleAsset(assetId: string) {
    archiveDemoAsset(assetId);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(assetId);
      return next;
    });
  }

  function trashSingleAsset(assetId: string) {
    moveDemoAssetToTrash(assetId);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(assetId);
      return next;
    });
  }

  async function createProject() {
    if (!newProjectName.trim()) return;

    if (demoMode) {
      const project = createDemoProject(newProjectName);
      setActiveProject(project.id);
      setNewProjectName("");
      setShowNewProject(false);
      setNotice("Project created in this local demo");
      return;
    }

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (res.ok) {
        const project = await res.json();
        setRemoteProjects((prev) => [...prev, project]);
        setActiveProject(project.id);
        setNewProjectName("");
        setShowNewProject(false);
      }
    } catch {}
  }

  async function handleDemoUpload(files: FileList | null) {
    if (!demoMode || !files || files.length === 0) return;
    const projectId =
      activeProject && activeProject !== "all" ? activeProject : "ica";
    setUploading(true);
    const uploadStartedAt = Date.now();
    const added: MediaAsset[] = Array.from(files).map((file, index) => {
      const assetId = `local-upload-${uploadStartedAt}-${index}`;
      return {
        id: assetId,
        project_id: projectId,
        title: file.name.replace(/\.[^.]+$/, ""),
        thumbnail_url: "/demo/refinery-sunset.jpg",
        file_type: file.type.startsWith("image/") ? "image" : "video",
        duration_seconds: file.type.startsWith("video/") ? 64 : undefined,
        status: "draft",
        version_count: 1,
        reviewer_count: 0,
        reviewer_done: 0,
        comment_count: 0,
        created_at: new Date().toISOString(),
        href: buildInternalDemoAssetHref(projectId, assetId),
      };
    });
    addDemoAssets(added);
    setUploading(false);
    setNotice(
      `${added.length} ${added.length === 1 ? "file" : "files"} added locally`,
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function triggerUpload() {
    if (demoMode) {
      fileInputRef.current?.click();
      return;
    }
    if (!canonicalProjectId) {
      setNotice("Choose or create a workspace before uploading media");
      return;
    }
    document.getElementById(AUTHORITATIVE_UPLOAD_INPUT_ID)?.click();
  }

  return (
    <div className="projects-workspace flex h-[calc(100vh-var(--topnav-h))]">
      {/* Folder sidebar */}
      <FolderTree
        folders={folders}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOverride(!sidebarOpen)}
        activeFolderId={activeProject}
        onFolderSelect={(id) => {
          setActiveProject(id);
          setSelectedIds(new Set());
          setSelectAll(false);
          if (isMobile) setSidebarOverride(false);
        }}
      />

      <div className="projects-content flex-1 overflow-y-auto px-6 py-4">
        <header className="mb-4 border-b border-[var(--border)] pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSidebarOverride(!sidebarOpen)}
                  className="btn-icon"
                  title="Toggle project rail"
                  aria-label="Toggle project rail"
                >
                  <Menu size={18} />
                </button>
                {demoMode ? <span className="demo-pill">Local reconstruction</span> : null}
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                Production library
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-[var(--ink)]">
                {activeProjectName}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
                Manage project media, review readiness, share links, versions, and delivery state from one workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/projects/new${demoSuffix}`}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)]"
              >
                <Plus size={15} />
                New workspace
              </Link>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--accent)] px-3 text-sm font-semibold text-white shadow-sm"
                onClick={triggerUpload}
                disabled={uploading}
              >
                <Upload size={15} />
                {uploading ? "Uploading..." : "Upload media"}
              </button>
              <Link
                href={primaryReviewHref}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--accent)]"
              >
                <MessageSquare size={15} />
                Open review
              </Link>
            </div>
          </div>
        </header>

        {demoMode ? (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,image/*,audio/*,.pdf,.doc,.docx,.srt,.vtt"
            className="hidden"
            onChange={(event) => handleDemoUpload(event.target.files)}
          />
        ) : canonicalProjectId ? (
          <AssetUpload
            projectId={canonicalProjectId}
            inputId={AUTHORITATIVE_UPLOAD_INPUT_ID}
            variant="cockpit"
            onUploadComplete={refreshRemoteAssets}
          />
        ) : null}

        <section
          aria-label="Project readiness"
          className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          {projectReadiness.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="grid min-h-[74px] grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--dim)]">
                    {item.label}
                  </span>
                  <span className="mt-0.5 flex items-baseline gap-2">
                    <strong className="text-xl font-semibold text-[var(--ink)]">{item.value}</strong>
                    <span className="truncate text-xs text-[var(--muted)]">{item.detail}</span>
                  </span>
                </span>
              </div>
            );
          })}
        </section>

        <section
          aria-label="Production lifecycle"
          className="mb-3 grid gap-2 lg:grid-cols-4"
        >
          {lifecyclePath.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                data-phase={item.label.toLowerCase()}
                className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--phase-tint,var(--accent-dim))] text-[var(--phase-color,var(--accent))]">
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--ink)]">
                    {index + 1}. {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">{item.detail}</span>
                </span>
              </div>
            );
          })}
        </section>

        <div className="library-status-row" aria-label="Project status strip">
          <span>{filtered.length} {filtered.length === 1 ? "deliverable" : "deliverables"}</span>
          <span><i className="status-dot blue" />{filtered.filter((asset) => asset.status === "in_review").length} in review</span>
          <span><i className="status-dot orange" />{filtered.filter((asset) => asset.status === "needs_changes").length} changes requested</span>
          <span><i className="status-dot green" />{filtered.filter((asset) => asset.status === "approved").length} approved</span>
          <span><Clock3 size={13} />Transcript, waveform, and export readiness appear once media finishes processing.</span>
        </div>

        {selectedIds.size > 0 ? (
          <div className="library-selection-bar">
            <span><strong>{selectedIds.size}</strong> selected</span>
            <div>
              <button className="btn btn-primary" type="button" onClick={() => setShareOpen(true)}>
                <Share2 size={14} /> Share for review
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectAll(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {/* Toolbar */}
        <ProjectToolbar
          viewMode={viewMode}
          onViewChange={setViewMode}
          sortMode={sortMode}
          onSortChange={setSortMode}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectAll={selectAll}
          onSelectAll={handleSelectAll}
          onNewFolder={() => router.push(`/projects/new${demoSuffix}`)}
          thumbnailSize={thumbnailSize}
          onThumbnailSize={setThumbnailSize}
          onUpload={triggerUpload}
          uploading={uploading}
        />

        {/* Quick add: name-only workspace, no brief */}
        {showNewProject && (
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-xs text-[var(--muted)]">
              Quick add creates a name-only workspace. Add the client and brief later, or use New workspace for the full intake.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProject()}
                placeholder="Workspace name..."
                className="input flex-1"
                autoFocus
              />
              <button onClick={createProject} className="btn btn-primary">Create workspace</button>
              <button onClick={() => setShowNewProject(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div
            className="grid gap-4 mt-4"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))`,
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton" style={{ height: thumbnailSize * 0.75 + 80 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ minHeight: 400 }}>
            <div className="empty-state-icon">
              <FolderOpen size={24} />
            </div>
            <h3 className="empty-state-title">
              {searchQuery ? `No results for "${searchQuery}"` : projects.length === 0 ? "Create your first workspace" : "No media yet"}
            </h3>
            <p className="empty-state-text">
              {searchQuery
                ? "Try a different search term"
                : projects.length === 0
                ? "Create a production workspace, then upload source media when the project is ready."
                : "Upload media to start versioning, review, comments, approvals, and delivery."}
            </p>
            {!searchQuery && (
              <div className="flex gap-3 mt-4 justify-center">
                {projects.length === 0 && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowNewProject(true)}
                  >
                    <Plus size={14} /> Quick add
                  </button>
                )}
                <button
                  className="page-upload-btn"
                  onClick={triggerUpload}
                >
                  <Upload size={14} /> Upload media
                </button>
              </div>
            )}
          </div>
        ) : viewMode === "table" ? (
          <MediaTable
            assets={filtered}
            selectedIds={selectedIds}
            onSelect={toggleSelect}
            selectAll={selectAll}
            onSelectAll={handleSelectAll}
            onShare={demoMode ? shareSingleAsset : undefined}
            onArchive={demoMode ? archiveSingleAsset : undefined}
            onTrash={demoMode ? trashSingleAsset : undefined}
          />
        ) : (
          <div
            className="grid gap-4 mt-2"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))`,
            }}
          >
            {filtered.map((asset) => (
              <MediaCard
                key={asset.id}
                asset={asset}
                selected={selectedIds.has(asset.id)}
                onSelect={toggleSelect}
                onShare={demoMode ? shareSingleAsset : undefined}
                onArchive={demoMode ? archiveSingleAsset : undefined}
                onTrash={demoMode ? trashSingleAsset : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {shareOpen ? (
        <DemoShareModal
          assets={filtered}
          initialSelectedAssetIds={Array.from(selectedIds)}
          onClose={() => {
            setShareOpen(false);
            setSelectedIds(new Set());
            setSelectAll(false);
          }}
          onShared={(input) => {
            const links = createDemoShareLinks(input);
            setNotice(`${links.length} review ${links.length === 1 ? "link" : "links"} created locally`);
            return links;
          }}
        />
      ) : null}

      {notice ? <div className="demo-toast" role="status">{notice}</div> : null}
    </div>
  );
}
