"use client";

/**
 * Share links 2.0 (P22) — reviewer watermark overlay.
 *
 * Standalone: the coordinator mounts this on the review stage (it is NOT
 * wired into components/review/* from this lane). Tiled, low-opacity,
 * pointer-events-none, aria-hidden — a deterrent overlay, never an
 * interaction blocker.
 */

interface ShareWatermarkProps {
  /** Reviewer identity shown in every tile (name or email). */
  reviewerLabel: string;
  /** ISO instant or preformatted label stamped into every tile. */
  timestamp?: string | Date;
  /** Tile opacity — keep low so the review stays watchable. */
  opacity?: number;
  /** Grid density: columns x rows of repeated tiles. */
  columns?: number;
  rows?: number;
}

function formatStamp(timestamp?: string | Date): string {
  if (!timestamp) return "";
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ShareWatermark({
  reviewerLabel,
  timestamp,
  opacity = 0.08,
  columns = 3,
  rows = 4,
}: ShareWatermarkProps) {
  const label = reviewerLabel.trim() || "Reviewer";
  const stamp = formatStamp(timestamp);
  const tileText = stamp ? `${label} · ${stamp}` : label;
  const tiles = Array.from({ length: Math.max(1, columns) * Math.max(1, rows) });

  return (
    <div
      aria-hidden="true"
      data-testid="share-watermark"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(1, columns)}, 1fr)`,
          gridTemplateRows: `repeat(${Math.max(1, rows)}, 1fr)`,
          width: "100%",
          height: "100%",
          transform: "rotate(-18deg) scale(1.4)",
        }}
      >
        {tiles.map((_, index) => (
          <span
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              fontWeight: 500,
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
              color: "var(--ink, #18223e)",
              opacity,
              userSelect: "none",
            }}
          >
            {tileText}
          </span>
        ))}
      </div>
    </div>
  );
}
