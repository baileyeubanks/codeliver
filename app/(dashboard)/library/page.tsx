"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Play, Image as ImageIcon, FileText, Music, Filter } from "lucide-react";

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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const FILE_TYPES = ["all", "video", "image", "audio", "document"] as const;

export default function LibraryPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/assets")
      .then((r) => r.json())
      .then((d) => setAssets(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = assets.filter((a) => {
    if (typeFilter !== "all" && a.file_type !== typeFilter) return false;
    if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Media Library</h1>
      <p className="text-sm text-[var(--muted)] mb-6">All assets across your projects</p>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] outline-none transition-colors"
          />
        </div>
        <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1">
          {FILE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
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
            <div key={i} className="skeleton h-48 rounded-xl" />
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
              href={`/projects/${a.project_id}/assets/${a.id}`}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--border-light)] transition-colors group"
            >
              <div className="aspect-video bg-[var(--bg)] flex items-center justify-center">
                {a.thumbnail_url ? (
                  <img src={a.thumbnail_url} alt={a.title} className="w-full h-full object-cover" />
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
