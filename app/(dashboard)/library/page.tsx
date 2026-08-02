"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Play, Image as ImageIcon, FileText, Music } from "lucide-react";
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

function AssetThumbnail({ asset }: { asset: Asset }) {
  const [failed, setFailed] = useState(false);

  if (!asset.thumbnail_url || failed) {
    return fileIcon(asset.file_type);
  }

  return (
    <Image
      src={asset.thumbnail_url}
      alt={asset.title}
      fill
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
      className="object-cover"
      unoptimized
      onError={() => setFailed(true)}
    />
  );
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Media Library</h1>
      <p className="text-sm text-[var(--muted)] mb-6">All assets across your projects</p>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
          <input
            type="text"
            aria-label="Search media assets"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] outline-none transition-colors"
          />
        </div>
        <div
          className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
          aria-label="Filter media type"
        >
          {FILE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={typeFilter === t}
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
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
            <div key={i} className="skeleton h-48 rounded-[var(--radius)]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--muted)]">{search || typeFilter !== "all" ? "No matching assets" : "No assets yet"}</p>
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
                <AssetThumbnail asset={a} />
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
