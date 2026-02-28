"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  MessageSquare,
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus,
  TrendingUp,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  status: string;
  updated_at: string;
  assets: { id: string; status: string }[];
}

interface ActivityItem {
  id: string;
  action: string;
  actor_name: string;
  details: Record<string, string>;
  created_at: string;
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

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/activity").then((r) => r.json()),
    ])
      .then(([p, a]) => {
        setProjects(p.items ?? []);
        setActivity(a.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalProjects = projects.length;
  const activeReviews = projects.flatMap((p) => p.assets ?? []).filter((a) => a.status === "in_review").length;
  const approved = projects.flatMap((p) => p.assets ?? []).filter((a) => a.status === "approved").length;
  const totalAssets = projects.flatMap((p) => p.assets ?? []).length;

  const stats = [
    { label: "Projects", value: totalProjects, icon: FolderOpen, color: "var(--accent)" },
    { label: "In Review", value: activeReviews, icon: Clock, color: "var(--orange)" },
    { label: "Approved", value: approved, icon: CheckCircle2, color: "var(--green)" },
    { label: "Total Assets", value: totalAssets, icon: TrendingUp, color: "var(--purple)" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Content review and delivery overview
          </p>
        </div>
        <Link
          href="/projects/new"
          className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          New Project
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                {s.label}
              </span>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <div className="text-2xl font-bold">{loading ? "—" : s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Recent Projects */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent Projects</h2>
            <Link
              href="/projects"
              className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-20 rounded-xl" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
              <FolderOpen size={32} className="mx-auto mb-3 text-[var(--dim)]" />
              <p className="text-[var(--muted)] text-sm">
                No projects yet. Create your first project to get started.
              </p>
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-2 mt-4 bg-[var(--accent)] text-white text-sm px-4 py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
              >
                <Plus size={14} /> Create Project
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.slice(0, 5).map((p) => {
                const assetCount = p.assets?.length ?? 0;
                const reviewCount = p.assets?.filter((a) => a.status === "in_review").length ?? 0;
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--border-light)] transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                      <FolderOpen size={18} className="text-[var(--accent)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate group-hover:text-[var(--accent)] transition-colors">
                        {p.name}
                      </div>
                      <div className="text-xs text-[var(--muted)] mt-0.5">
                        {assetCount} asset{assetCount !== 1 ? "s" : ""}
                        {reviewCount > 0 && (
                          <span className="text-[var(--orange)]"> · {reviewCount} in review</span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-[var(--dim)]">{timeAgo(p.updated_at)}</div>
                    <ArrowRight size={14} className="text-[var(--dim)] group-hover:text-[var(--accent)] transition-colors" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <Link
              href="/activity"
              className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton h-12 rounded-lg" />
                ))}
              </div>
            ) : activity.length === 0 ? (
              <p className="text-sm text-[var(--muted)] text-center py-4">
                No activity yet
              </p>
            ) : (
              <div className="space-y-3">
                {activity.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex items-start gap-3">
                    <div
                      className={`status-dot mt-1.5 ${
                        a.action.includes("approved")
                          ? "green"
                          : a.action.includes("comment")
                          ? "blue"
                          : a.action.includes("change") || a.action.includes("reject")
                          ? "orange"
                          : "blue"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">
                        <span className="font-medium">{a.actor_name || "Someone"}</span>{" "}
                        <span className="text-[var(--muted)]">{a.action.replace(/_/g, " ")}</span>
                      </p>
                      <p className="text-xs text-[var(--dim)] mt-0.5">{timeAgo(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
