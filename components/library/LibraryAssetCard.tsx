"use client";

import { useRef } from "react";
import Link from "next/link";
import { Clock3, Download, Scissors, Star } from "lucide-react";
import { formatBytes, formatDurationSeconds } from "@/lib/assets/formats";
import { scrubTimeForPointer } from "@/lib/assets/scrub";
import type { LibraryAssetMeta } from "@/lib/assets/types";

const RIGHTS_BADGE_STYLES: Record<LibraryAssetMeta["rights"]["kind"], { background: string; color: string }> = {
  paid_until: { background: "var(--cvp-amber-tint)", color: "var(--cvp-amber)" },
  internal_only: { background: "var(--surface-2)", color: "var(--muted)" },
  unlimited: { background: "var(--cvp-green-tint)", color: "var(--cvp-green)" },
};

export interface LibraryAssetCardProps {
  id: string;
  title: string;
  /** Deep link into the source project's review surface. */
  href: string;
  projectName: string;
  projectHref: string;
  posterUrl: string | null;
  /** Real file used for hover-scrub; null means poster-only (honest). */
  videoUrl: string | null;
  durationSeconds: number | null;
  resolution: string | null;
  sizeBytes: number | null;
  meta: LibraryAssetMeta | undefined;
  isFavorite: boolean;
  onToggleFavorite: (assetId: string) => void;
  onOpenFormats: (assetId: string) => void;
  onRequestCutdown: (assetId: string) => void;
}

export default function LibraryAssetCard({
  id,
  title,
  href,
  projectName,
  projectHref,
  posterUrl,
  videoUrl,
  durationSeconds,
  resolution,
  sizeBytes,
  meta,
  isFavorite,
  onToggleFavorite,
  onOpenFormats,
  onRequestCutdown,
}: LibraryAssetCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const duration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : (durationSeconds ?? 0);
    video.currentTime = scrubTimeForPointer(event.clientX, rect.left, rect.width, duration);
  }

  const facts = [
    durationSeconds !== null ? formatDurationSeconds(durationSeconds) : "",
    resolution ?? "",
    sizeBytes !== null ? formatBytes(sizeBytes) : "",
  ].filter(Boolean);

  return (
    <article
      data-testid="library-asset-card"
      data-asset-id={id}
      className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--border-light)]"
    >
      <div
        className="relative aspect-video bg-[var(--bg)]"
        onPointerMove={videoUrl ? handlePointerMove : undefined}
        data-testid={videoUrl ? `scrub-surface-${id}` : undefined}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            poster={posterUrl ?? undefined}
            preload="metadata"
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            aria-label={`${title} preview — hover to scrub`}
          />
        ) : posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- demo poster, no optimization pipeline in this surface
          <img src={posterUrl} alt={title} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[var(--dim)]">
            <Clock3 size={18} aria-hidden="true" />
          </span>
        )}
        {meta ? (
          <span
            className="absolute left-2 top-2 rounded-[var(--radius-sm)] px-2 py-0.5 text-[10px] font-bold"
            style={RIGHTS_BADGE_STYLES[meta.rights.kind]}
            data-testid={`rights-badge-${id}`}
          >
            {meta.rights.label}
          </span>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={href}
            className="min-w-0 truncate text-sm font-medium text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
          >
            {title}
          </Link>
          <button
            type="button"
            onClick={() => onToggleFavorite(id)}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
            data-testid={`favorite-toggle-${id}`}
            className={`mt-0.5 shrink-0 ${isFavorite ? "text-[var(--accent)]" : "text-[var(--dim)] hover:text-[var(--ink)]"}`}
          >
            <Star size={16} aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
          </button>
        </div>

        {facts.length > 0 ? (
          <p className="text-[10px] text-[var(--dim)]" data-testid={`asset-facts-${id}`}>
            {facts.join(" · ")}
          </p>
        ) : null}

        {meta ? (
          <p className="truncate text-[10px] text-[var(--muted)]">
            {meta.campaign}
            {meta.platforms.length > 0 ? ` — ${meta.platforms.join(", ")}` : ""}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Link
            href={projectHref}
            className="truncate text-[10px] font-bold text-[var(--accent)]"
            data-testid={`source-project-${id}`}
          >
            {projectName}
          </Link>
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => onOpenFormats(id)}
              data-testid={`formats-button-${id}`}
              className="inline-flex min-h-7 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 text-[10px] font-bold text-[var(--ink)] hover:border-[var(--accent)]"
            >
              <Download size={11} aria-hidden="true" />
              Formats
            </button>
            <button
              type="button"
              onClick={() => onRequestCutdown(id)}
              data-testid={`cutdown-button-${id}`}
              className="inline-flex min-h-7 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 text-[10px] font-bold text-[var(--ink)] hover:border-[var(--accent)]"
            >
              <Scissors size={11} aria-hidden="true" />
              Cutdown
            </button>
          </span>
        </div>
      </div>
    </article>
  );
}
