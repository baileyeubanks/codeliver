"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  CheckCircle2,
  Upload,
  AlertTriangle,
  Clock,
  Activity,
  BellRing,
  Filter,
  ShieldCheck,
} from "lucide-react";
import { useDemoMode } from "@/lib/demo/mode";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";

interface ActivityItem {
  id: string;
  action: string;
  actor_name: string;
  details: Record<string, string>;
  created_at: string;
  project_id: string;
  asset_id: string | null;
}

type ActivityFilter = "all" | "comments" | "approvals" | "uploads" | "audit";

const activityFilters: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "comments", label: "Comments" },
  { id: "approvals", label: "Approvals" },
  { id: "uploads", label: "Uploads" },
  { id: "audit", label: "Audit" },
];

function activityKind(action: string): Exclude<ActivityFilter, "all"> {
  if (action.includes("comment")) return "comments";
  if (action.includes("approved") || action.includes("approval") || action.includes("change") || action.includes("reject")) {
    return "approvals";
  }
  if (action.includes("upload") || action.includes("created") || action.includes("version")) return "uploads";
  return "audit";
}

function actionIcon(action: string) {
  if (action.includes("comment")) return <MessageSquare size={14} className="text-[var(--accent)]" />;
  if (action.includes("approved")) return <CheckCircle2 size={14} className="text-[var(--green)]" />;
  if (action.includes("upload") || action.includes("created")) return <Upload size={14} className="text-[var(--purple)]" />;
  if (action.includes("change") || action.includes("reject")) return <AlertTriangle size={14} className="text-[var(--orange)]" />;
  return <Clock size={14} className="text-[var(--dim)]" />;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (hrs < 48) return "yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ActivityPage() {
  const demoMode = useDemoMode();
  const demoWorkspace = useDemoWorkspace();
  const [remoteItems, setRemoteItems] = useState<ActivityItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>("all");
  const items = demoMode ? demoWorkspace.activity : remoteItems;
  const loading = demoMode ? false : remoteLoading;
  const filteredItems = activeFilter === "all" ? items : items.filter((item) => activityKind(item.action) === activeFilter);
  const projectHref = demoMode ? "/projects?demo=1" : "/projects";
  const reviewHref = demoMode ? "/projects/bp?asset=bp-rodeo-v2&view=review&demo=1" : "/projects";

  const activityReadiness = [
    {
      label: "Events",
      value: items.length,
      detail: "Captured in audit history",
      icon: Activity,
    },
    {
      label: "Review comments",
      value: items.filter((item) => activityKind(item.action) === "comments").length,
      detail: "Timecoded collaboration",
      icon: MessageSquare,
    },
    {
      label: "Versions",
      value: items.filter((item) => activityKind(item.action) === "uploads").length,
      detail: "Uploads and new cuts",
      icon: Upload,
    },
    {
      label: "Approvals",
      value: items.filter((item) => activityKind(item.action) === "approvals").length,
      detail: "Decision trail",
      icon: ShieldCheck,
    },
  ];

  useEffect(() => {
    if (demoMode) return;

    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => setRemoteItems(d.items ?? []))
      .catch(() => {})
      .finally(() => setRemoteLoading(false));
  }, [demoMode]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            Audit history
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">
            Production activity
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Comments, approvals, version uploads, share events, and notification audit entries in one production trail.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={reviewHref}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--accent)] px-3 text-sm font-semibold text-white shadow-sm"
          >
            <MessageSquare size={15} />
            Review cockpit
          </Link>
          <Link
            href={projectHref}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--ink)]"
          >
            <Upload size={15} />
            Upload media
          </Link>
        </div>
      </header>

      <section
        aria-label="Activity readiness"
        className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        {activityReadiness.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="grid min-h-[74px] grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--accent)]">
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

      {loading ? (
        <div className="rounded-lg border border-[var(--border)] bg-white">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="grid grid-cols-[32px_minmax(0,1fr)_58px] items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
            >
              <div className="skeleton h-8 w-8 rounded-md" />
              <div className="min-w-0 space-y-2">
                <div className="skeleton h-3 w-3/5 rounded-sm" />
                <div className="skeleton h-2.5 w-2/5 rounded-sm" />
              </div>
              <div className="skeleton h-3 w-12 rounded-sm" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-white px-5 py-14 text-center">
          <BellRing size={30} className="mx-auto mb-3 text-[var(--accent)]" />
          <h2 className="text-base font-semibold text-[var(--ink)]">No production activity yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
            Activity appears after uploads, comments, approval decisions, share notifications, or backend audit events.
          </p>
          <Link
            href={projectHref}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--accent)]"
          >
            Open project cockpit
          </Link>
        </div>
      ) : (
        <section className="rounded-lg border border-[var(--border)] bg-white">
          <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
              <Filter size={15} className="text-[var(--dim)]" />
              Production trail
            </div>
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Activity filters">
              {activityFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === filter.id}
                  aria-pressed={activeFilter === filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`h-8 rounded-md px-3 text-xs font-semibold transition ${
                    activeFilter === filter.id
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Clock size={24} className="mx-auto mb-2 text-[var(--dim)]" />
              <p className="text-sm font-medium text-[var(--ink)]">No matching activity</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                This filter will populate when matching events are recorded.
              </p>
            </div>
          ) : (
            <div>
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0 sm:grid-cols-[32px_minmax(0,1fr)_80px]"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--surface)]">
                    {actionIcon(item.action)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--ink)]">
                      <span className="font-semibold">{item.actor_name || "Someone"}</span>{" "}
                      <span className="text-[var(--muted)]">{item.action.replace(/_/g, " ")}</span>
                      {item.details?.asset_title && (
                        <span> on {item.details.asset_title}</span>
                      )}
                    </p>
                    {item.details?.body && (
                      <p className="mt-0.5 truncate text-xs text-[var(--dim)]">
                        &ldquo;{item.details.body}&rdquo;
                      </p>
                    )}
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--dim)]">
                      {activityKind(item.action)}
                      {item.asset_id ? ` / ${item.asset_id}` : ""}
                    </p>
                  </div>
                  <time className="hidden justify-self-end text-xs text-[var(--dim)] sm:block">
                    {formatDate(item.created_at)}
                  </time>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
