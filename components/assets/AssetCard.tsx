"use client";

import { useState } from "react";
import {
  Video,
  Image as ImageIcon,
  Music,
  FileText,
  File,
  MessageSquare,
  GitBranch,
  CheckCircle2,
} from "lucide-react";
import type { Tag } from "@/lib/types/codeliver";
import { formatFileSize, formatDuration, timeAgo } from "@/lib/utils/media";

type Asset = {
  id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  thumbnail_url: string | null;
  status: string;
  file_size: number | null;
  duration_seconds: number | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  _commentCount?: number;
  _versionCount?: number;
  _approvalProgress?: number;
  tags?: Tag[];
};

const FILE_TYPE_ICONS: Record<string, typeof Video> = {
  video: Video,
  image: ImageIcon,
  audio: Music,
  document: FileText,
  other: File,
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-[var(--dim)] text-[var(--ink)]",
  in_review: "bg-[var(--orange)]/20 text-[var(--orange)]",
  approved: "bg-[var(--green)]/20 text-[var(--green)]",
  needs_changes: "bg-[var(--red)]/20 text-[var(--red)]",
  final: "bg-[var(--purple)]/20 text-[var(--purple)]",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  needs_changes: "Changes",
  final: "Final",
};

export default function AssetCard({
  asset,
  selected,
  onSelect,
  onClick,
}: {
  asset: Asset;
  selected: boolean;
  onSelect: (id: string) => void;
  onClick: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = FILE_TYPE_ICONS[asset.file_type] || File;

  return (
    <div
      className={`group relative rounded-[var(--radius)] border overflow-hidden cursor-pointer transition-all ${
        selected
          ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
          : "border-[var(--border)] hover:border-[var(--muted)]"
      } bg-[var(--surface)]`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(asset.id)}
    >
      {/* Checkbox */}
      <div
        className={`absolute top-2 left-2 z-10 transition-opacity ${
          selected || hovered ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(asset.id);
        }}
      >
        <div
          className={`w-5 h-5 rounded-[4px] border flex items-center justify-center ${
            selected
              ? "bg-[var(--accent)] border-[var(--accent)]"
              : "border-[var(--muted)] bg-[var(--bg)]/80"
          }`}
        >
          {selected && <CheckCircle2 size={14} className="text-white" />}
        </div>
      </div>

      {/* Thumbnail */}
      <div className="aspect-video bg-[var(--surface-2)] relative flex items-center justify-center">
        {asset.thumbnail_url ? (
          <img
            src={asset.thumbnail_url}
            alt={asset.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <Icon size={32} className="text-[var(--dim)]" />
        )}
        {asset.duration_seconds && (
          <span className="absolute bottom-1 right-1 text-xs bg-black/70 text-white px-1.5 py-0.5 rounded">
            {formatDuration(asset.duration_seconds)}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-[var(--ink)] truncate flex-1">
            {asset.title}
          </h3>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
              STATUS_COLORS[asset.status] || STATUS_COLORS.draft
            }`}
          >
            {STATUS_LABELS[asset.status] || asset.status}
          </span>
        </div>

        {asset.tags && asset.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {asset.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--muted)]"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-[var(--dim)] text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <GitBranch size={12} />
              {asset._versionCount ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={12} />
              {asset._commentCount ?? 0}
            </span>
          </div>
          {asset.file_size && (
            <span>{formatFileSize(asset.file_size)}</span>
          )}
        </div>

        {asset._approvalProgress !== undefined && (
          <div className="w-full bg-[var(--surface-2)] rounded-full h-1">
            <div
              className="bg-[var(--green)] h-1 rounded-full transition-all"
              style={{ width: `${asset._approvalProgress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
