"use client";

import { Upload, FileText, Trash2 } from "lucide-react";

interface CaptionFile {
  id: string;
  name: string;
  language?: string;
}

interface CaptionsPanelProps {
  captions: CaptionFile[];
  onUpload: () => void;
  onDelete: (id: string) => void;
}

export default function CaptionsPanel({ captions, onUpload, onDelete }: CaptionsPanelProps) {
  return (
    <div className="space-y-4">
      <p className="kicker mb-2">Manage Files</p>

      {captions.length === 0 ? (
        <div className="empty-state" style={{ padding: "24px 0" }}>
          <div className="empty-state-icon">
            <FileText size={20} />
          </div>
          <p className="empty-state-text">No caption files uploaded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {captions.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--surface-2)]"
            >
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-[var(--muted)]" />
                <div>
                  <p className="text-sm">{c.name}</p>
                  {c.language && <p className="text-xs text-[var(--muted)]">{c.language}</p>}
                </div>
              </div>
              <button
                onClick={() => onDelete(c.id)}
                className="btn-icon"
                style={{ width: 28, height: 28 }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button onClick={onUpload} className="btn btn-primary w-full">
        <Upload size={14} /> Upload caption file
      </button>
    </div>
  );
}
