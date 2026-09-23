"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { useOverlay } from "@/components/overlay/useOverlay";

export interface DownloadLadderItem {
  label: string;
  url: string;
  bytes?: number | null;
  resolution?: string | null;
}

function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * VA-025: the download ladder lives on the stage bar — Original (exact bytes)
 * plus any ready renditions, all from the server projection. Renders nothing
 * when the link allows no downloads; never a disabled teaser.
 */
export default function DownloadMenu({ items }: { items: DownloadLadderItem[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuRef, menuStyle] = useOverlay({
    open,
    onClose: () => setOpen(false),
    anchorRef: triggerRef,
    side: "bottom",
    align: "end",
    offset: 8,
  });

  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    return (
      <a
        href={item.url}
        download
        className="flex min-h-8 items-center gap-1.5 rounded-full border border-white/25 bg-white/5 px-3 text-xs font-medium text-white/85 transition-colors hover:border-white/50 hover:text-white"
        aria-label={`Download ${item.label}`}
      >
        <Download size={13} aria-hidden="true" />
        Download
        {formatBytes(item.bytes) ? (
          <span className="text-white/55">{formatBytes(item.bytes)}</span>
        ) : null}
      </a>
    );
  }

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Download options"
        className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-white/25 bg-white/5 px-3 text-xs font-medium text-white/85 transition-colors hover:border-white/50 hover:text-white"
        onClick={() => setOpen((value) => !value)}
      >
        <Download size={13} aria-hidden="true" />
        Download
      </button>
      {open ? (
        <span
          ref={menuRef}
          style={menuStyle}
          role="menu"
          aria-label="Download ladder"
          className="z-[70] grid min-w-56 gap-0.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-lg"
        >
          {items.map((item) => (
            <a
              key={item.url}
              role="menuitem"
              href={item.url}
              download
              className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-xs text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
              onClick={() => setOpen(false)}
            >
              <span className="font-medium">{item.label}</span>
              <span className="text-[var(--muted)]">
                {[item.resolution, formatBytes(item.bytes)].filter(Boolean).join(" · ")}
              </span>
            </a>
          ))}
        </span>
      ) : null}
    </span>
  );
}
