"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Archive, ExternalLink, MoreHorizontal, Share2, Trash2, Users } from "lucide-react";
import { useOverlay } from "@/components/overlay/useOverlay";
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
  onShare?: (id: string) => void;
  onArchive?: (id: string) => void;
  onTrash?: (id: string) => void;
}

export default function MediaTable({
  assets,
  selectedIds,
  onSelect,
  selectAll,
  onSelectAll,
  onShare,
  onArchive,
  onTrash,
}: MediaTableProps) {
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const [rowMenuOverlayRef, rowMenuOverlayStyle] = useOverlay({
    open: openAssetId !== null,
    onClose: () => setOpenAssetId(null),
    anchorRef: menuAnchorRef,
    align: "end",
    offset: 6,
  });

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>
              <input
                type="checkbox"
                checked={selectAll}
                readOnly
                onClick={(event) => onSelectAll(event.currentTarget.checked)}
                className="w-3.5 h-3.5 accent-[var(--accent)]"
                aria-label="Select all visible assets"
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
            const assetHref = asset.href ?? `/projects/${asset.project_id}/assets/${asset.id}`;
            return (
              <tr key={asset.id}>
                <td className="media-row-select">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(asset.id)}
                    readOnly
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(asset.id);
                    }}
                    className="w-3.5 h-3.5 accent-[var(--accent)]"
                    aria-label={`Select ${asset.title}`}
                  />
                </td>
                <td className="media-row-thumb">
                  <Link href={assetHref} aria-label={`Open ${asset.title}`}>
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
                <td className="media-row-title">
                  <Link
                    href={assetHref}
                    className="font-medium text-[var(--ink)] hover:text-[var(--accent)] transition-colors"
                  >
                    {asset.title}
                  </Link>
                  <span className="media-row-mobile-meta">
                    V{asset.version_count ?? 1} · {formatDuration(asset.duration_seconds)} · {timeAgo(asset.created_at)}
                  </span>
                </td>
                <td className="media-row-detail text-xs">{formatDuration(asset.duration_seconds)}</td>
                <td className="media-row-detail">
                  <span className="badge badge-version">V{asset.version_count ?? 1}</span>
                </td>
                <td className="media-row-detail text-xs">{timeAgo(asset.created_at)}</td>
                <td className="media-row-detail">
                  <span className="flex items-center gap-1 text-xs">
                    <Users size={12} />
                    {asset.reviewer_done ?? 0}/{asset.reviewer_count ?? 0}
                  </span>
                </td>
                <td className="media-row-status">
                  <span className={`badge-status ${status.className}`}>
                    {status.label}
                  </span>
                </td>
                <td className="media-row-actions relative">
                  <button
                    ref={openAssetId === asset.id ? menuAnchorRef : undefined}
                    className="btn-icon"
                    style={{ width: 28, height: 28 }}
                    title={`Actions for ${asset.title}`}
                    aria-label={`Actions for ${asset.title}`}
                    aria-expanded={openAssetId === asset.id}
                    onClick={() => setOpenAssetId(openAssetId === asset.id ? null : asset.id)}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {openAssetId === asset.id ? (
                    <div
                      ref={rowMenuOverlayRef}
                      className="dropdown"
                      style={{ ...rowMenuOverlayStyle, minWidth: 190 }}
                    >
                      <Link href={assetHref} className="dropdown-item">
                        <ExternalLink size={14} /> Open review
                      </Link>
                      {onShare ? (
                        <button
                          type="button"
                          className="dropdown-item"
                          onClick={() => {
                            onShare(asset.id);
                            setOpenAssetId(null);
                          }}
                        >
                          <Share2 size={14} /> Share for review
                        </button>
                      ) : null}
                      {onArchive ? (
                        <button
                          type="button"
                          className="dropdown-item"
                          onClick={() => {
                            onArchive(asset.id);
                            setOpenAssetId(null);
                          }}
                        >
                          <Archive size={14} /> Archive
                        </button>
                      ) : null}
                      {onTrash ? (
                        <button
                          type="button"
                          className="dropdown-item danger"
                          onClick={() => {
                            onTrash(asset.id);
                            setOpenAssetId(null);
                          }}
                        >
                          <Trash2 size={14} /> Move to Trash
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
