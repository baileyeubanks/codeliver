"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FolderOpen, Plus, Search, Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
  assets: { id: string; status: string }[];
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

function statusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 size={14} className="text-[var(--green)]" />;
    case "archived": return <AlertCircle size={14} className="text-[var(--dim)]" />;
    default: return <Clock size={14} className="text-[var(--accent)]" />;
  }
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Manage your content review projects</p>
        </div>
        <Link
          href="/projects/new"
          className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> New Project
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
        <input
          type="text"
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] outline-none transition-colors"
        />
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-44 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
          <FolderOpen size={40} className="mx-auto mb-4 text-[var(--dim)]" />
          <h3 className="text-lg font-semibold mb-2">
            {search ? "No matching projects" : "No projects yet"}
          </h3>
          <p className="text-sm text-[var(--muted)] mb-4">
            {search
              ? "Try a different search term"
              : "Create your first project to start reviewing content"}
          </p>
          {!search && (
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 bg-[var(--accent)] text-white text-sm px-4 py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
            >
              <Plus size={14} /> Create Project
            </Link>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const assetCount = p.assets?.length ?? 0;
            const reviewing = p.assets?.filter((a) => a.status === "in_review").length ?? 0;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--border-light)] transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                    <FolderOpen size={18} className="text-[var(--accent)]" />
                  </div>
                  {statusIcon(p.status)}
                </div>
                <h3 className="font-semibold text-sm mb-1 group-hover:text-[var(--accent)] transition-colors truncate">
                  {p.name}
                </h3>
                {p.description && (
                  <p className="text-xs text-[var(--muted)] line-clamp-2 mb-3">
                    {p.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-[var(--dim)] mt-auto pt-3 border-t border-[var(--border)]">
                  <span>
                    {assetCount} asset{assetCount !== 1 ? "s" : ""}
                    {reviewing > 0 && (
                      <span className="text-[var(--orange)]"> · {reviewing} reviewing</span>
                    )}
                  </span>
                  <span>{timeAgo(p.updated_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
