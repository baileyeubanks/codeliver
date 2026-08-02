"use client";

import { Suspense, useEffect, useState, useMemo, useRef, useSyncExternalStore } from "react";
import { FolderOpen, Plus, ChevronRight, Upload, Share2 } from "lucide-react";
import FolderTree, {
  type FolderNode,
  type FolderSelection,
} from "@/components/projects/FolderTree";
import ProjectToolbar, { type ViewMode, type SortMode } from "@/components/projects/ProjectToolbar";
import MediaCard, { type MediaAsset } from "@/components/projects/MediaCard";
import MediaTable from "@/components/projects/MediaTable";
import ProductionOverview from "@/components/projects/ProductionOverview";
import AuthoritativeUploadDialog from "@/components/projects/AuthoritativeUploadDialog";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DemoShareModal from "@/components/demo/DemoShareModal";
import {
  addDemoAssets,
  archiveDemoAsset,
  createDemoProject,
  createDemoShareLinks,
  moveDemoAssetToTrash,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import { useDemoMode } from "@/lib/demo/mode";
import { buildInternalDemoAssetHref } from "@/lib/demo/workspace";

type UploadTarget = {
  projectId: string;
  folderId: string | null;
};

type AssetVersionIdentity = {
  id: string;
  is_current?: boolean;
};

async function loadCollection<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(path, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);

  const payload: unknown = await response.json();
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : null;
  if (!items) throw new Error(`${path} returned an invalid collection`);
  return items as T[];
}

async function responseError(response: Response, fallback: string) {
  const payload: unknown = await response.json().catch(() => null);
  return payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
    ? (payload as { error: string }).error
    : fallback;
}

function newBatchShareRequestId() {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `projects-batch-${randomId}`;
}

interface Project {
  id: string;
  name: string;
}

const MOBILE_PROJECTS_QUERY = "(max-width: 768px)";

function subscribeToMobileViewport(onChange: () => void) {
  const media = window.matchMedia(MOBILE_PROJECTS_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getMobileViewportSnapshot() {
  return window.matchMedia(MOBILE_PROJECTS_QUERY).matches;
}

function normalizeFolderBranch(folder: FolderNode, projectId: string): FolderNode {
  return {
    ...folder,
    project_id: projectId,
    kind: "folder",
    children: folder.children.map((child) => normalizeFolderBranch(child, projectId)),
  };
}

function buildProjectFolderTree(
  projects: Project[],
  folders: FolderNode[],
  foldersContainProjectRoots: boolean,
): FolderNode[] {
  return projects.map((project) => {
    const projectFolders = foldersContainProjectRoots
      ? folders.find((folder) => folder.id === project.id)?.children ?? []
      : folders.filter((folder) => folder.project_id === project.id);

    return {
      id: project.id,
      name: project.name,
      project_id: project.id,
      kind: "project",
      children: projectFolders.map((folder) => normalizeFolderBranch(folder, project.id)),
    };
  });
}

function findFolder(folders: FolderNode[], folderId: string | null): FolderNode | null {
  if (!folderId) return null;
  for (const folder of folders) {
    if (folder.kind === "folder" && folder.id === folderId) return folder;
    const child = findFolder(folder.children, folderId);
    if (child) return child;
  }
  return null;
}

function buildProjectLibraryHref(
  currentSearch: string,
  projectId: string | null,
  folderId: string | null,
) {
  const params = new URLSearchParams(currentSearch);
  if (projectId) params.set("project", projectId);
  else params.delete("project");
  if (folderId) params.set("folder", folderId);
  else params.delete("folder");
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

function buildProjectCockpitHref(projectId: string, demoMode: boolean) {
  return "/projects/" + encodeURIComponent(projectId) + (demoMode ? "?demo=1" : "");
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsPageContent />
    </Suspense>
  );
}

function ProjectsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMobile = useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    () => false,
  );
  const demoMode = useDemoMode();
  const [sidebarOverride, setSidebarOverride] = useState<boolean | null>(null);
  const sidebarOpen = sidebarOverride ?? !isMobile;
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [thumbnailSize, setThumbnailSize] = useState(220);
  const [remoteFolders, setRemoteFolders] = useState<FolderNode[]>([]);
  const [remoteAssets, setRemoteAssets] = useState<MediaAsset[]>([]);
  const [remoteProjects, setRemoteProjects] = useState<Project[]>([]);
  const demoWorkspace = useDemoWorkspace();
  const [uploadProjectId, setUploadProjectId] = useState("ica");
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteSnapshotReady, setRemoteSnapshotReady] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryReload, setLibraryReload] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [notice, setNotice] = useState("");

  const folders = demoMode ? demoWorkspace.folders : remoteFolders;
  const assets = demoMode ? demoWorkspace.assets : remoteAssets;
  const projects = demoMode ? demoWorkspace.projects : remoteProjects;
  const folderTree = useMemo(
    () => buildProjectFolderTree(projects, folders, demoMode),
    [demoMode, folders, projects],
  );
  const requestedProjectId = searchParams.get("project")?.trim() || null;
  const requestedFolderId = searchParams.get("folder")?.trim() || null;
  const requestedFolder = useMemo(
    () => findFolder(folderTree, requestedFolderId),
    [folderTree, requestedFolderId],
  );
  const requestedProject = projects.find((project) => project.id === requestedProjectId) ?? null;
  const folderProject = projects.find((project) => project.id === requestedFolder?.project_id) ?? null;
  const activeProjectId = requestedProject?.id ?? folderProject?.id ?? null;
  const activeFolderId = requestedFolder?.project_id === activeProjectId
    ? requestedFolder.id
    : null;
  const overviewActive = activeProjectId === null;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeFolder = activeFolderId ? requestedFolder : null;
  const loading = demoMode ? false : remoteLoading && !remoteSnapshotReady;
  const resolvedUploadProjectId = projects.some((project) => project.id === uploadProjectId)
    ? uploadProjectId
    : projects[0]?.id ?? "";

  function navigateToSelection({ projectId, folderId }: FolderSelection) {
    router.push(
      buildProjectLibraryHref(searchParams.toString(), projectId, folderId),
      { scroll: false },
    );
  }

  function resetSelection() {
    setSelectedIds(new Set());
    setSelectAll(false);
  }

  useEffect(() => {
    if (demoMode) return;

    const controller = new AbortController();
    setRemoteLoading(true);
    setLibraryError(null);

    Promise.all([
      loadCollection<Project>("/api/projects", controller.signal),
      loadCollection<FolderNode>("/api/folders", controller.signal),
      loadCollection<MediaAsset>("/api/assets", controller.signal),
    ])
      .then(([projectList, folderList, assetList]) => {
        setRemoteProjects(projectList);
        setRemoteFolders(folderList);
        setRemoteAssets(assetList);
        setRemoteSnapshotReady(true);
        setUploadProjectId((current) =>
          projectList.some((project) => project.id === current)
            ? current
            : projectList[0]?.id ?? "",
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Project library load failed:", error);
        setLibraryError("The project library could not be loaded. Your last valid view was kept.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setRemoteLoading(false);
      });

    return () => controller.abort();
  }, [demoMode, libraryReload]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (loading || libraryError) return;
    if (requestedProjectId && !requestedProject) {
      router.replace(
        buildProjectLibraryHref(searchParams.toString(), null, null),
        { scroll: false },
      );
      return;
    }
    if (requestedFolderId && !requestedFolder) {
      router.replace(
        buildProjectLibraryHref(searchParams.toString(), requestedProject?.id ?? null, null),
        { scroll: false },
      );
    }
  }, [libraryError, loading, requestedFolder, requestedFolderId, requestedProject, requestedProjectId, router, searchParams]);

  // Filter & sort
  const filtered = useMemo(() => {
    let items = assets;
    if (activeProjectId) {
      items = items.filter((asset) => asset.project_id === activeProjectId);
    }
    if (activeFolderId) {
      items = items.filter((asset) => asset.folder_id === activeFolderId);
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
  }, [activeFolderId, activeProjectId, assets, searchQuery, sortMode]);

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
    if (demoMode) {
      setShareOpen(true);
      return;
    }
    void shareLiveAssets([assetId]);
  }

  async function shareLiveAssets(assetIds: string[]) {
    if (sharing) return;
    const selectedAssets = assets.filter((asset) => assetIds.includes(asset.id));
    if (selectedAssets.length === 0) {
      setNotice("Select at least one deliverable to share");
      return;
    }
    if (selectedAssets.length > 20) {
      setNotice("Share up to 20 deliverables at a time");
      return;
    }

    setSharing(true);
    try {
      const items = await Promise.all(
        selectedAssets.map(async (asset) => {
          const response = await fetch(`/api/assets/${encodeURIComponent(asset.id)}/versions`, {
            cache: "no-store",
          });
          if (!response.ok) {
            throw new Error(await responseError(response, `Versions for ${asset.title} are unavailable`));
          }
          const payload: unknown = await response.json();
          const versions = payload && typeof payload === "object"
            && Array.isArray((payload as { items?: unknown }).items)
            ? ((payload as { items: AssetVersionIdentity[] }).items)
            : [];
          const currentVersion = versions.find((version) => version.is_current) ?? versions[0];
          if (!currentVersion?.id) throw new Error(`${asset.title} has no shareable version`);
          return { asset_id: asset.id, version_id: currentVersion.id };
        }),
      );

      const response = await fetch("/api/assets/batch-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "create",
          manifest_id: newBatchShareRequestId(),
          share_intent: "client_review",
          policy_template_id: "standard-review",
          notification: { action: "none", channels: [] },
          items,
        }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, "Review links could not be created"));
      }

      const payload: unknown = await response.json();
      const createdItems = payload && typeof payload === "object"
        && Array.isArray((payload as { items?: unknown }).items)
        ? (payload as { items: unknown[] }).items
        : [];
      if (createdItems.length !== items.length) {
        throw new Error("The guarded share receipt did not confirm every selected deliverable");
      }

      setNotice(`${createdItems.length} guarded review ${createdItems.length === 1 ? "link" : "links"} created`);
      resetSelection();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Review links could not be created");
    } finally {
      setSharing(false);
    }
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
    const name = newProjectName.trim();
    if (!name || creatingProject) return;

    if (demoMode) {
      const project = createDemoProject(name);
      navigateToSelection({ projectId: project.id, folderId: null });
      setUploadProjectId(project.id);
      setNewProjectName("");
      setShowNewProject(false);
      setNotice("Project created in this local demo");
      return;
    }

    setCreatingProject(true);
    setNotice("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, request_id: crypto.randomUUID() }),
      });
      if (!res.ok) {
        throw new Error(await responseError(res, "Project could not be created"));
      }
      const payload: unknown = await res.json();
      if (
        !payload ||
        typeof payload !== "object" ||
        typeof (payload as { id?: unknown }).id !== "string" ||
        typeof (payload as { name?: unknown }).name !== "string"
      ) {
        throw new Error("Project creation returned an invalid receipt");
      }
      const project = payload as Project;
      setRemoteProjects((prev) => [...prev, project]);
      navigateToSelection({ projectId: project.id, folderId: null });
      setUploadProjectId(project.id);
      setNewProjectName("");
      setShowNewProject(false);
      setNotice("Project created");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Project could not be created");
    } finally {
      setCreatingProject(false);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;

    if (requestedFolderId && !activeFolderId) {
      setNotice(loading ? "Folder is still loading" : "That folder is no longer available");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const folderId = activeProjectId ? activeFolderId : null;

    if (demoMode) {
      const projectId = (activeProjectId ?? resolvedUploadProjectId) || "ica";
      setUploading(true);
      const uploadStartedAt = Date.now();
      const added: MediaAsset[] = Array.from(files).map((file, index) => {
        const assetId = `local-upload-${uploadStartedAt}-${index}`;
        return {
          id: assetId,
          project_id: projectId,
          folder_id: folderId,
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
      setNotice(`${added.length} ${added.length === 1 ? "file" : "files"} added locally`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setNotice("Use the guarded upload dialog for production media");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function requestOverviewUpload() {
    if (demoMode) {
      fileInputRef.current?.click();
      return;
    }
    if (!resolvedUploadProjectId) {
      setNotice("Create a project before uploading media");
      return;
    }
    setUploadTarget({ projectId: resolvedUploadProjectId, folderId: null });
  }

  function requestLibraryUpload() {
    if (demoMode) {
      fileInputRef.current?.click();
      return;
    }
    if (requestedFolderId && !activeFolderId) {
      setNotice(loading ? "Folder is still loading" : "That folder is no longer available");
      return;
    }
    const projectId = activeProjectId ?? resolvedUploadProjectId;
    if (!projectId) {
      setNotice("Create a project before uploading media");
      return;
    }
    setUploadTarget({ projectId, folderId: activeProjectId ? activeFolderId : null });
  }

  return (
    <div
      className="projects-workspace flex min-h-full"
      data-sidebar-state={sidebarOverride === null ? "auto" : sidebarOpen ? "open" : "closed"}
    >
      {/* Folder sidebar */}
      <FolderTree
        folders={folderTree}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOverride(!sidebarOpen)}
        activeProjectId={activeProjectId}
        activeFolderId={activeFolderId}
        overviewActive={overviewActive}
        onOverviewSelect={() => {
          router.push(
            buildProjectLibraryHref(searchParams.toString(), null, null),
            { scroll: false },
          );
          resetSelection();
          if (isMobile) setSidebarOverride(false);
        }}
        onSelectionChange={(selection) => {
          navigateToSelection(selection);
          setUploadProjectId(selection.projectId);
          resetSelection();
          if (isMobile) setSidebarOverride(false);
        }}
      />

      {/* Main content */}
      <div className={`projects-content flex-1 ${overviewActive ? "" : "px-6 py-4"}`}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,image/*,audio/*,.pdf,.doc,.docx,.srt,.vtt"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />

        {libraryError && remoteSnapshotReady ? (
          <div
            className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--danger)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)]"
            role="alert"
          >
            <span>{libraryError}</span>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setLibraryReload((current) => current + 1)}
              disabled={remoteLoading}
            >
              {remoteLoading ? "Retrying..." : "Retry"}
            </button>
          </div>
        ) : null}

        {libraryError && !remoteSnapshotReady ? (
          <section className="empty-state mx-4 mt-4" style={{ minHeight: 400 }} role="alert">
            <div className="empty-state-icon">
              <FolderOpen size={24} />
            </div>
            <h2 className="empty-state-title">Project library unavailable</h2>
            <p className="empty-state-text">We could not verify the latest projects, folders, and media.</p>
            <button
              className="btn btn-primary mt-4"
              type="button"
              onClick={() => setLibraryReload((current) => current + 1)}
              disabled={remoteLoading}
            >
              {remoteLoading ? "Retrying..." : "Retry"}
            </button>
          </section>
        ) : overviewActive ? (
          <ProductionOverview
            projects={projects}
            assets={assets}
            activity={demoMode ? demoWorkspace.activity : []}
            firstName={demoMode ? demoWorkspace.settings.profile.firstName : "Producer"}
            demoMode={demoMode}
            uploadProjectId={resolvedUploadProjectId}
            uploading={uploading}
            onUploadProjectChange={setUploadProjectId}
            onUpload={requestOverviewUpload}
            onOpenProject={(projectId) => {
              router.push(buildProjectCockpitHref(projectId, demoMode), { scroll: false });
              setUploadProjectId(projectId);
              resetSelection();
            }}
          />
        ) : (
          <>
        {/* Breadcrumb */}
        <div className="flex items-center gap-3 mb-2">
          <nav className="breadcrumb">
            <Link
              href={buildProjectLibraryHref(searchParams.toString(), null, null)}
              onClick={resetSelection}
            >
              Projects
            </Link>
            <ChevronRight size={12} className="breadcrumb-sep" />
            {activeFolder ? (
              <>
                <Link
                  href={buildProjectLibraryHref(searchParams.toString(), activeProjectId, null)}
                  onClick={resetSelection}
                >
                  {activeProject?.name || "Project"}
                </Link>
                <ChevronRight size={12} className="breadcrumb-sep" />
                <span className="breadcrumb-current">{activeFolder.name}</span>
              </>
            ) : (
              <span className="breadcrumb-current">{activeProject?.name || "All Files"}</span>
            )}
          </nav>
          {demoMode ? <span className="demo-pill">Local reconstruction</span> : null}

          {/* Right side: Upload media button (Wipster style) */}
          <div className="ml-auto flex items-center gap-2">
            <button
              className="page-upload-btn"
              onClick={requestLibraryUpload}
              disabled={uploading || Boolean(requestedFolderId && !activeFolderId)}
            >
              <Upload size={15} />
              {uploading ? "Uploading..." : "Upload media"}
            </button>
          </div>
        </div>

        <div className="library-status-row" aria-label="Project summary">
          <span>{filtered.length} {filtered.length === 1 ? "deliverable" : "deliverables"}</span>
          <span><i className="status-dot green" />{filtered.filter((asset) => asset.status === "in_review").length} in review</span>
          <span><i className="status-dot orange" />{filtered.filter((asset) => asset.status === "needs_changes").length} changes requested</span>
          <span><i className="status-dot blue" />{filtered.filter((asset) => asset.status === "approved").length} approved</span>
        </div>

        {selectedIds.size > 0 ? (
          <div className="library-selection-bar">
            <span><strong>{selectedIds.size}</strong> selected</span>
            <div>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => demoMode ? setShareOpen(true) : void shareLiveAssets(Array.from(selectedIds))}
                disabled={sharing}
              >
                <Share2 size={14} /> {sharing ? "Creating links..." : "Share for review"}
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
          onNewProject={() => setShowNewProject(true)}
          thumbnailSize={thumbnailSize}
          onThumbnailSize={setThumbnailSize}
        />

        {/* New Project modal */}
        {showNewProject && (
          <div className="mb-4 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg flex items-center gap-3">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void createProject()}
              placeholder="Project name..."
              className="input flex-1"
              autoFocus
            />
            <button onClick={() => void createProject()} className="btn btn-primary" disabled={creatingProject}>{creatingProject ? "Creating..." : "Create"}</button>
            <button onClick={() => setShowNewProject(false)} className="btn btn-secondary" disabled={creatingProject}>Cancel</button>
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
              {searchQuery ? `No results for "${searchQuery}"` : projects.length === 0 ? "Create your first project" : "No media yet"}
            </h3>
            <p className="empty-state-text">
              {searchQuery
                ? "Try a different search term"
                : projects.length === 0
                ? "Start by creating a project, then upload your media files."
                : "Upload your first media file to start reviewing."}
            </p>
            {!searchQuery && (
              <div className="flex gap-3 mt-4 justify-center">
                {projects.length === 0 && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowNewProject(true)}
                  >
                    <Plus size={14} /> New Project
                  </button>
                )}
                <button
                  className="page-upload-btn"
                  onClick={requestLibraryUpload}
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
            onShare={shareSingleAsset}
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
                onShare={shareSingleAsset}
                onArchive={demoMode ? archiveSingleAsset : undefined}
                onTrash={demoMode ? trashSingleAsset : undefined}
              />
            ))}
          </div>
        )}
          </>
        )}
      </div>

      {uploadTarget ? (
        <AuthoritativeUploadDialog
          projectId={uploadTarget.projectId}
          folderId={uploadTarget.folderId ?? undefined}
          projectName={projects.find((project) => project.id === uploadTarget.projectId)?.name ?? "Project"}
          onClose={() => setUploadTarget(null)}
          onUploadComplete={() => {
            setNotice("Upload committed by the guarded ingest pipeline");
            setLibraryReload((current) => current + 1);
          }}
        />
      ) : null}

      {demoMode && shareOpen ? (
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
