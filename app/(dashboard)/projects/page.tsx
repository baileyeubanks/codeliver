"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Menu, FolderOpen, Plus, ChevronRight, ChevronDown, Upload } from "lucide-react";
import FolderTree, { type FolderNode } from "@/components/projects/FolderTree";
import ProjectToolbar, { type ViewMode, type SortMode } from "@/components/projects/ProjectToolbar";
import MediaCard, { type MediaAsset } from "@/components/projects/MediaCard";
import MediaTable from "@/components/projects/MediaTable";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

interface Project {
  id: string;
  name: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [thumbnailSize, setThumbnailSize] = useState(220);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    // Fetch projects list, then folders and assets
    Promise.all([
      fetch("/api/projects").then((r) => r.ok ? r.json() : { items: [] }),
      fetch("/api/folders").then((r) => r.ok ? r.json() : { items: [] }),
      fetch("/api/assets").then((r) => r.ok ? r.json() : { items: [] }),
    ])
      .then(([p, f, a]) => {
        const projectList = p.items ?? p ?? [];
        setProjects(Array.isArray(projectList) ? projectList : []);
        setFolders(f.items ?? []);
        setAssets(a.items ?? []);
        // Select first project if available
        if (Array.isArray(projectList) && projectList.length > 0) {
          setActiveProject(projectList[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Filter & sort
  const filtered = useMemo(() => {
    let items = assets;
    if (activeProject) {
      items = items.filter((a: any) => a.project_id === activeProject);
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

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function handleSelectAll(val: boolean) {
    setSelectAll(val);
    if (val) {
      setSelectedIds(new Set(filtered.map((a) => a.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  async function createProject() {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (res.ok) {
        const project = await res.json();
        setProjects((prev) => [...prev, project]);
        setActiveProject(project.id);
        setNewProjectName("");
        setShowNewProject(false);
      }
    } catch {}
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;

    // If no project, create one first
    let projectId = activeProject;
    if (!projectId) {
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "My First Project" }),
        });
        if (res.ok) {
          const project = await res.json();
          setProjects([project]);
          setActiveProject(project.id);
          projectId = project.id;
        }
      } catch {}
    }

    if (!projectId) return;
    setUploading(true);

    const supabase = createSupabaseBrowser();

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() ?? "";
      const fileType = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("audio/")
        ? "audio"
        : "document";

      // Upload to Supabase Storage
      const path = `${projectId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("deliverables")
        .upload(path, file);

      if (uploadError) {
        console.error("Upload failed:", uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("deliverables")
        .getPublicUrl(path);

      // Create asset record
      try {
        const res = await fetch(`/api/projects/${projectId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: file.name.replace(`.${ext}`, ""),
            file_type: fileType,
            file_url: urlData.publicUrl,
            file_size: file.size,
          }),
        });

        if (res.ok) {
          const asset = await res.json();
          setAssets((prev) => [asset, ...prev]);
        }
      } catch (e) {
        console.error("Asset creation failed:", e);
      }
    }

    setUploading(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex h-[calc(100vh-var(--topnav-h))]">
      {/* Folder sidebar */}
      <FolderTree
        folders={folders}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="btn-icon"
            title="Toggle sidebar"
          >
            <Menu size={18} />
          </button>
          <nav className="breadcrumb">
            <Link href="/projects">Projects</Link>
            <ChevronRight size={12} className="breadcrumb-sep" />
            <span className="breadcrumb-current">
              {projects.find((p) => p.id === activeProject)?.name || "All Files"}
            </span>
          </nav>

          {/* Right side: Upload media button (Wipster style) */}
          <div className="ml-auto flex items-center gap-2">
            <div className="page-upload-split">
              <button
                className="page-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload size={15} />
                {uploading ? "Uploading..." : "Upload media"}
              </button>
              <button className="split-chevron">
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,image/*,audio/*,.pdf,.doc,.docx,.srt,.vtt"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />

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
          onNewFolder={() => setShowNewProject(true)}
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
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              placeholder="Project name..."
              className="input flex-1"
              autoFocus
            />
            <button onClick={createProject} className="btn btn-primary">Create</button>
            <button onClick={() => setShowNewProject(false)} className="btn btn-secondary">Cancel</button>
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
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} /> Upload Media
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
