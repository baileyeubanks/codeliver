"use client";

import { Download, FileText, Printer } from "lucide-react";

interface DownloadPanelProps {
  originalUrl?: string;
  originalSize?: string;
  hdUrl?: string;
  sdUrl?: string;
  thumbnailUrl?: string;
  captionFiles?: { name: string; url: string }[];
}

export default function DownloadPanel({
  originalUrl,
  originalSize,
  hdUrl,
  sdUrl,
  thumbnailUrl,
  captionFiles = [],
}: DownloadPanelProps) {
  const mediaFiles = [
    { label: "Original", detail: originalSize || "—", url: originalUrl },
    { label: "HD 1080p", detail: "", url: hdUrl },
    { label: "SD 540p", detail: "", url: sdUrl },
    { label: "Thumbnail", detail: "", url: thumbnailUrl },
  ];

  return (
    <div className="space-y-6">
      {/* Media */}
      <section>
        <p className="kicker mb-3">Media</p>
        <div className="space-y-1">
          {mediaFiles.map((f) => (
            <div
              key={f.label}
              className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
            >
              <div>
                <p className="text-sm">{f.label}</p>
                {f.detail && <p className="text-xs text-[var(--muted)]">{f.detail}</p>}
              </div>
              <button
                className="btn-icon"
                style={{ width: 28, height: 28 }}
                disabled={!f.url}
                title={`Download ${f.label}`}
              >
                <Download size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Captions */}
      <section>
        <p className="kicker mb-3">Captions</p>
        {captionFiles.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No captions.</p>
        ) : (
          <div className="space-y-1">
            {captionFiles.map((f) => (
              <div key={f.name} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-[var(--surface-hover)]">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-[var(--muted)]" />
                  <span className="text-sm">{f.name}</span>
                </div>
                <button className="btn-icon" style={{ width: 28, height: 28 }}>
                  <Download size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Comments Export */}
      <section>
        <p className="kicker mb-3">Comments</p>
        <div className="space-y-1">
          <button className="flex items-center gap-2 text-sm text-[var(--ink-secondary)] py-2 px-2 rounded-lg hover:bg-[var(--surface-hover)] w-full transition-colors">
            <Download size={14} /> Export CSV
          </button>
          <button className="flex items-center gap-2 text-sm text-[var(--ink-secondary)] py-2 px-2 rounded-lg hover:bg-[var(--surface-hover)] w-full transition-colors">
            <Printer size={14} /> Print comments
          </button>
        </div>
      </section>
    </div>
  );
}
