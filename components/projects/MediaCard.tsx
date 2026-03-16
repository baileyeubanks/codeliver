"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import {
  Play,
  MoreHorizontal,
  Users,
  MessageSquare,
  Share2,
  Upload,
  Star,
  FolderInput,
  Copy,
  Download,
  Archive,
  Trash2,
  Pencil,
  Layers,
  Link2,
  CloudDownload,
} from "lucide-react";

export interface MediaAsset {
  id: string;
  project_id: string;
  title: string;
  thumbnail_url?: string;
  file_type: string;
  duration_seconds?: number;
  status: string;
  version_count?: number;
  reviewer_count?: number;
  reviewer_done?: number;
  comment_count?: number;
  created_at: string;
  is_favorited?: boolean;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function formatDuration(seconds?: number) {
  if (!seconds) return "";
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

export default function MediaCard({
  asset,
  selected,
  onSelect,
}: {
  asset: MediaAsset;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const statusInfo = STATUS_MAP[asset.status] ?? STATUS_MAP.draft;
  const versionLabel = `V${asset.version_count ?? 1}`;

  return (
    <div className="card-media group">
      {/* Selection checkbox */}
      {onSelect && (
        <div className="absolute top-2 left-2 z-10">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(asset.id)}
            className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Context menu button */}
      <div className="absolute top-2 right-2 z-10" ref={menuRef}>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="w-7 h-7 rounded-md flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreHorizontal size={14} />
        </button>

        {menuOpen && (
          <div className="dropdown" style={{ right: 0, top: "calc(100% + 4px)", minWidth: 200 }}>
            <button className="dropdown-item"><Share2 size={14} /> Share for review</button>
            <button className="dropdown-item"><Upload size={14} /> Upload new version</button>
            <button className="dropdown-item"><CloudDownload size={14} /> Import from cloud</button>
            <div className="dropdown-divider" />
            <button className="dropdown-item"><Star size={14} /> Add to favorites</button>
            <button className="dropdown-item"><Layers size={14} /> Manage versions</button>
            <button className="dropdown-item"><Link2 size={14} /> Manage share links</button>
            <div className="dropdown-divider" />
            <button className="dropdown-item"><Pencil size={14} /> Rename</button>
            <button className="dropdown-item"><FolderInput size={14} /> Move</button>
            <button className="dropdown-item"><Copy size={14} /> Copy</button>
            <button className="dropdown-item"><Download size={14} /> Download</button>
            <div className="dropdown-divider" />
            <button className="dropdown-item"><Archive size={14} /> Archive</button>
            <button className="dropdown-item danger"><Trash2 size={14} /> Trash</button>
          </div>
        )}
      </div>

      {/* Thumbnail */}
      <Link href={`/projects/${asset.project_id}/assets/${asset.id}`}>
        <div
          className="card-media-thumb"
          style={{
            background: asset.thumbnail_url
              ? `url(${asset.thumbnail_url}) center/cover`
              : "linear-gradient(135deg, var(--surface-2), var(--surface-3))",
          }}
        >
          {!asset.thumbnail_url && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Play size={32} className="text-[var(--dim)]" />
            </div>
          )}
        </div>
        {asset.duration_seconds != null && asset.duration_seconds > 0 && (
          <span className="card-media-duration">
            {formatDuration(asset.duration_seconds)}
          </span>
        )}
        <div className="card-media-overlay">
          <Play size={32} className="text-white" />
        </div>
      </Link>

      {/* Body */}
      <div className="card-media-body">
        <div className="card-media-title">{asset.title}</div>
        <div className="card-media-meta">
          <span className="badge badge-version">{versionLabel}</span>
          <span>{timeAgo(asset.created_at)}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
            <span className="flex items-center gap-1">
              <Users size={12} />
              {asset.reviewer_done ?? 0}/{asset.reviewer_count ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={12} />
              {asset.comment_count ?? 0}
            </span>
          </div>
          <span className={`badge-status ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        </div>
      </div>
    </div>
  );
}
