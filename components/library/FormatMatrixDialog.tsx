"use client";

import { X } from "lucide-react";
import { formatBytes, formatMatrixFor, LIBRARY_FORMAT_LABELS } from "@/lib/assets/formats";
import type { LibraryFormatEntry } from "@/lib/assets/types";

export interface FormatMatrixDialogProps {
  assetTitle: string;
  formats: LibraryFormatEntry[];
  onClose: () => void;
}

/**
 * Per-asset format download matrix. Honest availability: only formats backed
 * by a real file render a download link; everything else reports the seeded
 * reason ("Not produced for this asset") — never a fake download.
 */
export default function FormatMatrixDialog({ assetTitle, formats, onClose }: FormatMatrixDialogProps) {
  const rows = formatMatrixFor(formats);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(10,29,61,0.45)] px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Formats for ${assetTitle}`}
        data-testid="format-matrix-dialog"
        className="w-full max-w-xl overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-[var(--dim)]">Download matrix</p>
            <h2 className="truncate text-sm font-bold text-[var(--ink)]">{assetTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close format matrix"
            className="text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] uppercase text-[var(--dim)]">
              <th className="px-4 py-2 font-bold">Format</th>
              <th className="px-4 py-2 font-bold">Details</th>
              <th className="px-4 py-2 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr
                key={entry.format}
                className="border-b border-[var(--border)] last:border-0"
                data-testid={`format-row-${entry.format}`}
              >
                <td className="px-4 py-2 font-bold text-[var(--ink)]">
                  {LIBRARY_FORMAT_LABELS[entry.format]}
                </td>
                <td className="px-4 py-2 text-[var(--muted)]">
                  {entry.available
                    ? [entry.resolution ?? "", formatBytes(entry.size_bytes)]
                        .filter(Boolean)
                        .join(" · ")
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  {entry.available ? (
                    <a
                      href={entry.href}
                      download
                      title={`SHA-256 ${entry.sha256}`}
                      data-testid={`format-download-${entry.format}`}
                      className="inline-flex min-h-7 items-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 text-[10px] font-bold text-white hover:bg-[var(--accent-hover)]"
                    >
                      Download
                    </a>
                  ) : (
                    <span
                      className="text-[10px] text-[var(--dim)]"
                      data-testid={`format-unavailable-${entry.format}`}
                    >
                      {entry.reason}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--dim)]">
          Checksums are SHA-256 over the real delivered files (hover a download to inspect).
          Formats not listed as downloadable were not produced for this asset.
        </p>
      </div>
    </div>
  );
}
