"use client";

import { X } from "lucide-react";
import { formatBytes, shortChecksum } from "@/lib/assets/formats";
import type { PackageManifest } from "@/lib/assets/manifest";

export interface PackageManifestPanelProps {
  manifest: PackageManifest;
  description: string;
  onClose: () => void;
}

/**
 * Curated package manifest: the real file list with sizes and SHA-256
 * checksums recorded over the delivered files. Only files that exist are
 * listed — the manifest never invents a deliverable.
 */
export default function PackageManifestPanel({
  manifest,
  description,
  onClose,
}: PackageManifestPanelProps) {
  return (
    <section
      aria-label={`Manifest for ${manifest.title}`}
      data-testid="package-manifest"
      className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-[var(--dim)]">
            Package manifest — {manifest.campaign}
          </p>
          <h3 className="truncate text-sm font-bold text-[var(--ink)]">{manifest.title}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{description}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close package manifest"
          className="mt-0.5 shrink-0 text-[var(--muted)] hover:text-[var(--ink)]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] uppercase text-[var(--dim)]">
            <th className="px-4 py-2 font-bold">Asset</th>
            <th className="px-4 py-2 font-bold">Format</th>
            <th className="px-4 py-2 font-bold">File</th>
            <th className="px-4 py-2 font-bold">Size</th>
            <th className="px-4 py-2 font-bold">SHA-256</th>
          </tr>
        </thead>
        <tbody>
          {manifest.files.map((file) => (
            <tr
              key={`${file.asset_id}-${file.format}`}
              className="border-b border-[var(--border)] last:border-0"
              data-testid={`manifest-row-${file.asset_id}-${file.format}`}
            >
              <td className="max-w-40 truncate px-4 py-2 font-bold text-[var(--ink)]">
                {file.asset_title}
              </td>
              <td className="px-4 py-2 text-[var(--muted)]">{file.format_label}</td>
              <td className="max-w-44 truncate px-4 py-2 text-[var(--muted)]">
                <a href={file.href} download className="text-[var(--accent)] hover:underline">
                  {file.file_name}
                </a>
              </td>
              <td className="px-4 py-2 text-[var(--muted)]">{formatBytes(file.size_bytes)}</td>
              <td className="px-4 py-2 font-mono text-[10px] text-[var(--dim)]" title={file.sha256}>
                {shortChecksum(file.sha256)}…
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--dim)]">
        {manifest.file_count} files · {formatBytes(manifest.total_bytes)} total. Checksums recorded
        over the real delivered files.
      </p>
    </section>
  );
}
