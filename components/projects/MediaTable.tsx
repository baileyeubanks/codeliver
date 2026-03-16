"use client";

import Link from "next/link";
import { Users, MessageSquare, Play, MoreHorizontal } from "lucide-react";
import type { MediaAsset } from "./MediaCard";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(seconds?: number) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  in_review: { label: "In Review", className: "badge-in-review" },
  needs_changes: { label: "Requires Changes", className: "badge-requires-changes" },
  draft: { label: "Working on it", className: "badge-working" },
  approved: { label: "Approved", className: "badge-approved" },
  final: { label: "Approved", className: "badge-approved" },
};

interface MediaTableProps {
  assets: MediaAsset[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  selectAll: boolean;
  onSelectAll: (v: boolean) => void;
}

export default function MediaTable({
  assets,
  selectedIds,
  onSelect,
  selectAll,
  onSelectAll,
}: MediaTableProps) {
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>
              <input
                type="checkbox"
                checked={selectAll}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="w-3.5 h-3.5 accent-[var(--accent)]"
              />
            </th>
            <th style={{ width: 60 }}></th>
            <th>Title</th>
            <th>Duration</th>
            <th>Version</th>
            <th>Uploaded</th>
            <th>Reviewers</th>
            <th>Status</th>
            <th style={{ width: 48 }}></th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const status = STATUS_MAP[asset.status] ?? STATUS_MAP.draft;
            return (
              <tr key={asset.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(asset.id)}
                    onChange={() => onSelect(asset.id)}
                    className="w-3.5 h-3.5 accent-[var(--accent)]"
                  />
                </td>
                <td>
                  <Link href={`/projects/${asset.project_id}/assets/${asset.id}`}>
                    <div
                      className="w-10 h-7 rounded overflow-hidden bg-[var(--surface-2)]"
                      style={{
                        background: asset.thumbnail_url
                          ? `url(${asset.thumbnail_url}) center/cover`
                          : "var(--surface-2)",
                      }}
                    />
                  </Link>
                </td>
                <td>
                  <Link
                    href={`/projects/${asset.project_id}/assets/${asset.id}`}
                    className="font-medium text-[var(--ink)] hover:text-[var(--accent)] transition-colors"
                  >
                    {asset.title}
                  </Link>
                </td>
                <td className="text-xs">{formatDuration(asset.duration_seconds)}</td>
                <td>
                  <span className="badge badge-version">V{asset.version_count ?? 1}</span>
                </td>
                <td className="text-xs">{timeAgo(asset.created_at)}</td>
                <td>
                  <span className="flex items-center gap-1 text-xs">
                    <Users size={12} />
                    {asset.reviewer_done ?? 0}/{asset.reviewer_count ?? 0}
                  </span>
                </td>
                <td>
                  <span className={`badge-status ${status.className}`}>
                    {status.label}
                  </span>
                </td>
                <td>
                  <button className="btn-icon" style={{ width: 28, height: 28 }}>
                    <MoreHorizontal size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
