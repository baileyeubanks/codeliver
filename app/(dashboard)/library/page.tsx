"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CheckCircle2,
  Clock3,
  FolderOpen,
  Image as ImageIcon,
  LibraryBig,
  Music,
  Play,
  Search,
  Upload,
  FileText,
} from "lucide-react";
import { useDemoMode } from "@/lib/demo/mode";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";

interface Asset {
  id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  thumbnail_url: string | null;
  status: string;
  file_size: number | null;
  updated_at: string;
  project_id: string;
  project_name?: string;
  href?: string;
}

function fileIcon(type: string) {
  switch (type) {
    case "video": return <Play size={18} className="text-[var(--accent)]" />;
    case "image": return <ImageIcon size={18} className="text-[var(--purple)]" />;
    case "audio": return <Music size={18} className="text-[var(--green)]" />;
    default: return <FileText size={18} className="text-[var(--muted)]" />;
  }
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_TYPES = ["all", "video", "image", "audio", "document"] as const;

export default function LibraryPage() {
  const demoMode = useDemoMode();
  const demoWorkspace = useDemoWorkspace();
  const [remoteAssets, setRemoteAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [remoteLoading, setRemoteLoading] = useState(true);
  const assets: Asset[] = demoMode
    ? demoWorkspace.assets.map((asset) => ({
        id: asset.id,
        title: asset.title,
        file_type: asset.file_type,
        file_url: null,
        thumbnail_url: asset.thumbnail_url ?? null,
        status: asset.status,
        file_size: null,
        updated_at: asset.created_at,
        project_id: asset.project_id,
        project_name: demoWorkspace.projects.find((project) => project.id === asset.project_id)?.name,
        href: asset.href,
      }))
    : remoteAssets;
  const loading = demoMode ? false : remoteLoading;

  useEffect(() => {
    if (demoMode) return;

    fetch("/api/assets")
      .then((r) => r.json())
      .then((d) => setRemoteAssets(d.items ?? []))
      .catch(() => {})
      .finally(() => setRemoteLoading(false));
  }, [demoMode]);

  const filtered = assets.filter((a) => {
    if (typeFilter !== "all" && a.file_type !== typeFilter) return false;
    if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const uniqueProjectCount = new Set(assets.map((asset) => asset.project_id)).size;
  const inReviewCount = assets.filter((asset) =>
    ["in_review", "needs_changes"].includes(asset.status),
  ).length;
  const approvedCount = assets.filter((asset) =>
    ["approved", "final"].includes(asset.status),
  ).length;
  const libraryReadiness = [
    {
      id: "total",
      label: "Assets",
      value: String(assets.length),
      detail: `${filtered.length} visible`,
      icon: LibraryBig,
    },
    {
      id: "projects",
      label: "Projects",
      value: String(uniqueProjectCount),
      detail: "Linked workspaces",
      icon: FolderOpen,
    },
    {
      id: "review",
      label: "Review queue",
      value: String(inReviewCount),
      detail: "In review or changes",
      icon: Clock3,
    },
    {
      id: "approved",
      label: "Approved",
      value: String(approvedCount),
      detail: "Ready for delivery",
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-bold uppercase text-[var(--dim)]">Asset management</p>
          <h1 className="text-[22px] font-bold leading-tight text-[var(--ink)]">Media library</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Search, inspect, and reopen project assets without leaving the Co-Production Pro workspace.
          </p>
        </div>
        <Link
          href={demoMode ? "/projects?demo=1" : "/projects"}
          className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
        >
          <Upload size={14} aria-hidden="true" />
          Upload in project
        </Link>
      </div>

      <div className="mb-4 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--border)]">
        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          {libraryReadiness.map(({ id, label, value, detail, icon: Icon }) => (
            <article
              key={id}
              className="grid min-h-[74px] grid-cols-[24px_minmax(0,1fr)] gap-2 bg-[var(--surface)] px-3 py-3"
            >
              <Icon size={16} className="mt-0.5 text-[var(--accent)]" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase text-[var(--muted)]">{label}</span>
                <strong className="mt-1 block text-lg leading-none text-[var(--ink)]">{value}</strong>
                <small className="mt-1 block truncate text-[10px] text-[var(--muted)]">{detail}</small>
              </span>
            </article>
          ))}
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
          <input
            type="text"
            placeholder="Search assets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search media library"
            className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] pl-10 pr-4 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--dim)] focus:border-[var(--accent)]"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-1" aria-label="File type filters">
          {FILE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              aria-pressed={typeFilter === t}
              className={`min-h-8 whitespace-nowrap rounded-[var(--radius-sm)] px-3 text-xs font-bold capitalize transition-colors ${
                typeFilter === t
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
              <div className="skeleton aspect-video" />
              <div className="space-y-2 p-3">
                <div className="skeleton h-4 w-4/5 rounded-[var(--radius-sm)]" />
                <div className="skeleton h-3 w-1/2 rounded-[var(--radius-sm)]" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="grid min-h-[260px] place-items-center rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
          <div className="max-w-sm">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--accent)]">
              <LibraryBig size={20} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-sm font-bold text-[var(--ink)]">
              {search || typeFilter !== "all" ? "No matching assets" : "No media assets yet"}
            </h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {search || typeFilter !== "all"
                ? "Adjust the search or file-type filter to return to the full library."
                : "Upload media from a project cockpit so review, approvals, versions, and sharing stay linked."}
            </p>
            <Link
              href={demoMode ? "/projects?demo=1" : "/projects"}
              className="mt-4 inline-flex min-h-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-xs font-bold text-[var(--accent)]"
            >
              Open projects
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map((a) => (
            <Link
              key={a.id}
              href={a.href ?? `/projects/${a.project_id}/assets/${a.id}`}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden hover:border-[var(--border-light)] transition-colors group"
            >
              <div className="relative aspect-video bg-[var(--bg)] flex items-center justify-center">
                {a.thumbnail_url ? (
                  <Image
                    src={a.thumbnail_url}
                    alt={a.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover"
                  />
                ) : (
                  fileIcon(a.file_type)
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium truncate group-hover:text-[var(--accent)] transition-colors">
                  {a.title}
                </p>
                <div className="flex items-center justify-between mt-1 text-[10px] text-[var(--dim)]">
                  <span className="capitalize">{a.file_type}</span>
                  <span>{formatSize(a.file_size)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
