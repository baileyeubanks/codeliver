"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  Link2,
  Copy,
  ExternalLink,
  MessageSquare,
  Download,
  Shield,
  Eye,
  Plus,
  Send,
  Users,
  X,
} from "lucide-react";
import { useDemoMode } from "@/lib/demo/mode";
import {
  setDemoShareLinkActive,
  useDemoWorkspace,
} from "@/lib/demo/workspace-store";
import { toClientSiteUrl, toDemoSiteUrl } from "@/lib/surface-origins";

interface ShareLink {
  id: string;
  token: string;
  type: string;
  created_at: string;
  created_by_name?: string;
  message?: string;
  media_count?: number;
  invited_count?: number;
  allow_comments?: boolean;
  allow_downloads?: boolean;
  is_active?: boolean;
  public_url?: string;
  asset_ids?: string[];
  permission?: "view" | "comment" | "approve";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function resolvePublicLink(value: string, demoMode: boolean): string | null {
  const runtimeOrigin = typeof window === "undefined" ? undefined : window.location.origin;

  try {
    if (demoMode && runtimeOrigin) return toDemoSiteUrl(value, runtimeOrigin);
    return toClientSiteUrl(value, runtimeOrigin);
  } catch {
    return null;
  }
}

function permissionLabel(permission?: ShareLink["permission"]) {
  if (permission === "approve") return "Approval";
  if (permission === "comment") return "Review";
  return "View";
}

export default function ReviewsPage() {
  const demoMode = useDemoMode();
  const demoWorkspace = useDemoWorkspace();
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [remoteLinks, setRemoteLinks] = useState<ShareLink[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [detail, setDetail] = useState<ShareLink | null>(null);
  const links = demoMode ? demoWorkspace.shareLinks : remoteLinks;
  const loading = demoMode ? false : remoteLoading;

  useEffect(() => {
    if (demoMode) return;

    fetch("/api/sharing")
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((d) => setRemoteLinks(d.items ?? []))
      .catch(() => {})
      .finally(() => setRemoteLoading(false));
  }, [demoMode]);

  const filtered = tab === "mine"
    ? links.filter((l) => l.created_by_name === "You")
    : links;
  const detailPublicUrl = detail?.public_url
    ? resolvePublicLink(detail.public_url, demoMode)
    : null;
  const reviewHref = demoMode
    ? "/projects/bp?asset=bp-rodeo-v2&view=review&demo=1"
    : "/projects";
  const projectHref = demoMode ? "/projects?demo=1" : "/projects";
  const reviewReadiness = [
    {
      label: "Share links",
      value: links.length,
      detail: "Review portals created",
      icon: Link2,
    },
    {
      label: "Active links",
      value: links.filter((link) => link.is_active !== false).length,
      detail: "Ready for recipients",
      icon: CheckCircle2,
    },
    {
      label: "Approval links",
      value: links.filter((link) => link.permission === "approve").length,
      detail: "Decision authority",
      icon: Shield,
    },
    {
      label: "Recipients",
      value: links.reduce((total, link) => total + (link.invited_count ?? 0), 0),
      detail: "Invited reviewers",
      icon: Users,
    },
  ];

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).catch(() => {});
  }

  function toggleLink(link: ShareLink) {
    if (!demoMode) return;
    setDemoShareLinkActive(link.id, link.is_active === false);
    setDetail((current) =>
      current?.id === link.id
        ? { ...current, is_active: current.is_active === false }
        : current,
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            Review authority
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">
            Review links
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Track client portals, approval authority, recipient readiness, download access, and share status.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={reviewHref}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--accent)] px-3 text-sm font-semibold text-white shadow-sm"
          >
            <Plus size={15} />
            Create from cockpit
          </Link>
          <Link
            href={projectHref}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)]"
          >
            <MessageSquare size={15} />
            Open projects
          </Link>
        </div>
      </header>

      <section
        aria-label="Review readiness"
        className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        {reviewReadiness.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="grid min-h-[74px] grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
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

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Review link filters">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          aria-pressed={tab === "all"}
          className={`h-8 rounded-md px-3 text-xs font-semibold transition ${
            tab === "all"
              ? "bg-[var(--accent-dim)] text-[var(--accent)]"
              : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          }`}
          onClick={() => setTab("all")}
        >
          All links
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mine"}
          aria-pressed={tab === "mine"}
          className={`h-8 rounded-md px-3 text-xs font-semibold transition ${
            tab === "mine"
              ? "bg-[var(--accent-dim)] text-[var(--accent)]"
              : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          }`}
          onClick={() => setTab("mine")}
        >
          Created by me
        </button>
      </div>

      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {loading ? (
          <div className="divide-y divide-[var(--border)]">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="grid grid-cols-[32px_minmax(0,1fr)_72px] items-center gap-3 px-4 py-3"
              >
                <div className="skeleton h-8 w-8 rounded-md" />
                <div className="space-y-2">
                  <div className="skeleton h-3 w-3/5 rounded-sm" />
                  <div className="skeleton h-2.5 w-2/5 rounded-sm" />
                </div>
                <div className="skeleton h-3 w-16 rounded-sm" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Link2 size={30} className="mx-auto mb-3 text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--ink)]">No review links yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
              Review links appear after a project asset is shared from the cockpit. No delivery or notification is implied until a link is created.
            </p>
            <Link
              href={reviewHref}
              className="mt-4 inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--accent)]"
            >
              Open review cockpit
            </Link>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Created</th>
                  <th>Created by</th>
                  <th>Message</th>
                  <th>Media</th>
                  <th>Invited</th>
                  <th>Settings</th>
                  <th>Link</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((link) => {
                  const publicUrl = link.public_url
                    ? resolvePublicLink(link.public_url, demoMode)
                    : null;

                  return (
                    <tr
                      key={link.id}
                      className="cursor-pointer"
                      onClick={() => setDetail(link)}
                    >
                    <td>
                      <Link2 size={15} className="text-[var(--accent)]" />
                    </td>
                    <td className="text-xs">{timeAgo(link.created_at)}</td>
                    <td className="text-xs">{link.created_by_name || "—"}</td>
                    <td className="text-xs max-w-[200px] truncate">{link.message || "—"}</td>
                    <td className="text-xs">{link.media_count ?? 0}</td>
                    <td className="text-xs">{link.invited_count ?? 0}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {link.permission === "approve" ? (
                          <span className="badge badge-approved">
                            <Shield size={10} className="mr-1" /> Approval
                          </span>
                        ) : link.allow_comments !== false ? (
                          <span className="badge badge-in-review">
                            <MessageSquare size={10} className="mr-1" /> Review
                          </span>
                        ) : (
                          <span className="badge badge-working">
                            <Eye size={10} className="mr-1" /> View
                          </span>
                        )}
                        {link.allow_downloads && (
                          <span className="badge badge-working">
                            <Download size={10} className="mr-1" /> DL
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {publicUrl && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyLink(publicUrl);
                            }}
                            className="btn btn-ghost text-xs"
                          >
                            <Copy size={12} /> Copy
                          </button>
                          <a
                            href={publicUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="btn-icon"
                            title="Open review link"
                            aria-label="Open review link"
                          >
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        className={`toggle ${link.is_active !== false ? "on" : ""}`}
                        aria-pressed={link.is_active !== false}
                        aria-label={`${link.is_active !== false ? "Deactivate" : "Activate"} review link`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLink(link);
                        }}
                      />
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-link-details-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="review-link-details-title" className="text-sm font-semibold">
                Review link details
              </h3>
              <button
                onClick={() => setDetail(null)}
                className="btn-icon"
                aria-label="Close review link details"
              >
                <X size={15} />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div className="flex items-center justify-between">
                <span className="kicker">Authority</span>
                <span className="flex items-center gap-2 text-sm">
                  <Shield size={14} /> {permissionLabel(detail.permission)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="kicker">Created</span>
                <span className="flex items-center gap-2 text-sm">
                  <Clock3 size={14} /> {timeAgo(detail.created_at)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="kicker">Active</span>
                <button
                  className={`toggle ${detail.is_active !== false ? "on" : ""}`}
                  aria-pressed={detail.is_active !== false}
                  aria-label={`${detail.is_active !== false ? "Deactivate" : "Activate"} review link`}
                  onClick={() => toggleLink(detail)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="kicker">Created by</span>
                <span className="text-sm">{detail.created_by_name || "—"}</span>
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <p className="kicker mb-2">Settings</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Eye size={14} className="text-[var(--accent)]" />
                    Portal access enabled
                  </div>
                  {detail.allow_downloads && (
                    <div className="flex items-center gap-2">
                      <Download size={14} className="text-[var(--blue)]" />
                      Downloads enabled
                    </div>
                  )}
                  {detail.allow_comments !== false && (
                    <div className="flex items-center gap-2">
                      <MessageSquare size={14} className="text-[var(--blue)]" />
                      Comments enabled
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Send size={14} className="text-[var(--dim)]" />
                    Notification status is controlled by share settings and provider readiness.
                  </div>
                </div>
              </div>

              {detailPublicUrl && (
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="kicker mb-2">Share Link</p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={detailPublicUrl}
                      className="input flex-1"
                      style={{ fontSize: "0.75rem" }}
                    />
                    <button
                      onClick={() => copyLink(detailPublicUrl)}
                      className="btn btn-secondary"
                    >
                      <Copy size={13} /> Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
