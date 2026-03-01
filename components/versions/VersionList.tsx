"use client";

import { useState } from "react";
import { Upload, Check, Star, Clock, FileVideo, FileImage, FileAudio } from "lucide-react";
import type { Version } from "@/lib/types/codeliver";
import { formatFileSize, timeAgo } from "@/lib/utils/media";

interface VersionListProps {
  versions: Version[];
  currentVersionId?: string;
  onSetCurrent: (versionId: string) => void;
  onCompare: (versionAId: string, versionBId: string) => void;
  onUpload: () => void;
}

export default function VersionList({
  versions,
  currentVersionId,
  onSetCurrent,
  onCompare,
  onUpload,
}: VersionListProps) {
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const sorted = [...versions].sort((a, b) => b.version_number - a.version_number);

  function handleCompareSelect(id: string) {
    if (selectedForCompare.includes(id)) {
      setSelectedForCompare((prev) => prev.filter((v) => v !== id));
    } else if (selectedForCompare.length < 2) {
      const next = [...selectedForCompare, id];
      setSelectedForCompare(next);
      if (next.length === 2) {
        onCompare(next[0], next[1]);
        setSelectedForCompare([]);
        setCompareMode(false);
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
          Versions ({versions.length})
        </h4>
        <div className="flex gap-2">
          {versions.length >= 2 && (
            <button
              onClick={() => { setCompareMode(!compareMode); setSelectedForCompare([]); }}
              className={`text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                compareMode
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--accent)] hover:bg-[var(--accent)]/10"
              }`}
            >
              {compareMode ? "Cancel" : "Compare"}
            </button>
          )}
          <button
            onClick={onUpload}
            className="flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
          >
            <Upload size={12} /> Upload New
          </button>
        </div>
      </div>

      {compareMode && (
        <p className="text-xs text-[var(--dim)]">
          Select 2 versions to compare ({selectedForCompare.length}/2 selected)
        </p>
      )}

      {sorted.map((v) => {
        const isCurrent = v.id === currentVersionId || v.is_current;
        const isSelected = selectedForCompare.includes(v.id);

        return (
          <div
            key={v.id}
            onClick={() => compareMode && handleCompareSelect(v.id)}
            className={`bg-[var(--bg)] border rounded-lg p-3 transition-colors ${
              isSelected
                ? "border-[var(--accent)] bg-[var(--accent)]/5"
                : isCurrent
                ? "border-[var(--green)]/30"
                : "border-[var(--border)]"
            } ${compareMode ? "cursor-pointer hover:border-[var(--accent)]/50" : ""}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">v{v.version_number}</span>
                {isCurrent && (
                  <span className="flex items-center gap-0.5 text-[10px] font-medium text-[var(--green)] bg-[var(--green-dim)] px-1.5 py-0.5 rounded-full">
                    <Star size={8} /> Current
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[var(--dim)] flex items-center gap-1">
                <Clock size={10} /> {timeAgo(v.created_at)}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-[var(--dim)]">
              {v.file_size && <span>{formatFileSize(v.file_size)}</span>}
              {v.duration_seconds && <span>{Math.floor(v.duration_seconds)}s</span>}
              {v.resolution && <span>{v.resolution}</span>}
            </div>

            {v.notes && (
              <p className="text-xs text-[var(--muted)] mt-1 italic">{v.notes}</p>
            )}

            {!compareMode && !isCurrent && (
              <button
                onClick={() => onSetCurrent(v.id)}
                className="text-[10px] font-semibold text-[var(--accent)] hover:underline mt-2 flex items-center gap-1"
              >
                <Check size={10} /> Set as current
              </button>
            )}
          </div>
        );
      })}

      {versions.length === 0 && (
        <div className="text-center py-6">
          <FileVideo size={24} className="mx-auto mb-2 text-[var(--dim)]" />
          <p className="text-sm text-[var(--muted)]">Original version</p>
        </div>
      )}
    </div>
  );
}
