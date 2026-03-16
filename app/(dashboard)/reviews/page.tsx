"use client";

import { useEffect, useState } from "react";
import {
  Link2,
  Copy,
  ExternalLink,
  MessageSquare,
  Download,
  Shield,
  Eye,
} from "lucide-react";

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
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ReviewsPage() {
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ShareLink | null>(null);

  useEffect(() => {
    fetch("/api/sharing")
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((d) => setLinks(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = tab === "mine"
    ? links.filter((l) => l.created_by_name === "You")
    : links;

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).catch(() => {});
  }

  return (
    <div className="flex-1 p-6 max-w-[1200px] mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Reviews
        </h1>
      </div>

      {/* Tabs */}
      <div className="tabs mb-6">
        <button
          className={`tab ${tab === "all" ? "active" : ""}`}
          onClick={() => setTab("all")}
        >
          All
        </button>
        <button
          className={`tab ${tab === "mine" ? "active" : ""}`}
          onClick={() => setTab("mine")}
        >
          Created by me
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 48 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: "48px" }}>
            <div className="empty-state-icon">
              <Link2 size={24} />
            </div>
            <h3 className="empty-state-title">No share links yet</h3>
            <p className="empty-state-text">
              Share links will appear here when you share media for review
            </p>
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
                {filtered.map((link) => (
                  <tr
                    key={link.id}
                    className="cursor-pointer"
                    onClick={() => setDetail(link)}
                  >
                    <td>
                      <Link2 size={15} className="text-[var(--blue)]" />
                    </td>
                    <td className="text-xs">{timeAgo(link.created_at)}</td>
                    <td className="text-xs">{link.created_by_name || "—"}</td>
                    <td className="text-xs max-w-[200px] truncate">{link.message || "—"}</td>
                    <td className="text-xs">{link.media_count ?? 0}</td>
                    <td className="text-xs">{link.invited_count ?? 0}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {link.allow_comments !== false && (
                          <span className="badge badge-in-review">
                            <MessageSquare size={10} className="mr-1" /> Review
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
                      {link.public_url && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyLink(link.public_url!);
                          }}
                          className="btn btn-ghost text-xs"
                        >
                          <Copy size={12} /> Copy
                        </button>
                      )}
                    </td>
                    <td>
                      <button
                        className={`toggle ${link.is_active !== false ? "on" : ""}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-sm font-semibold">Share Link Details</h3>
              <button onClick={() => setDetail(null)} className="btn-icon">✕</button>
            </div>
            <div className="modal-body space-y-4">
              <div className="flex items-center justify-between">
                <span className="kicker">Type</span>
                <span className="flex items-center gap-2 text-sm">
                  <Link2 size={14} /> Public URL Link
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="kicker">Created</span>
                <span className="text-sm">{timeAgo(detail.created_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="kicker">Active</span>
                <button className={`toggle ${detail.is_active !== false ? "on" : ""}`} />
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
                    Review enabled
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
                </div>
              </div>

              {detail.public_url && (
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="kicker mb-2">Share Link</p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={detail.public_url}
                      className="input flex-1"
                      style={{ fontSize: "0.75rem" }}
                    />
                    <button
                      onClick={() => copyLink(detail.public_url!)}
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
