"use client";

import { Download, Droplets, Eye, Film } from "lucide-react";

interface ShareAuthorityPreviewProps {
  preview: unknown;
}

export default function ShareAuthorityPreview({ preview }: ShareAuthorityPreviewProps) {
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) return null;
  const manifest = preview as Record<string, unknown>;
  const items = Array.isArray(manifest.items) ? manifest.items : [];
  const first =
    items[0] && typeof items[0] === "object" && !Array.isArray(items[0])
      ? (items[0] as Record<string, unknown>)
      : null;
  if (!first) return null;
  const version =
    first.version && typeof first.version === "object" && !Array.isArray(first.version)
      ? (first.version as Record<string, unknown>)
      : {};

  return (
    <div className="border-l-2 border-[var(--green)] pl-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--dim)]">
        Authority preview
      </p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1">
          <Film size={11} />v{String(version.version_number ?? "-")}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1">
          <Eye size={11} />{String(first.permissions ?? "view")}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1">
          <Download size={11} />{first.download_enabled ? "Download" : "No download"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1">
          <Droplets size={11} />{first.watermark_enabled ? "Watermark" : "No watermark"}
        </span>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">No link or message was created.</p>
    </div>
  );
}
