"use client";

import { useMemo } from "react";
import type { AnalysisCandidate } from "@/lib/audio-analysis/core";
import type { TranscriptDocument } from "@/lib/transcript/core";

const DISPLAY_BINS = 160;

function downsample(peaks: readonly number[]): number[] {
  if (peaks.length <= DISPLAY_BINS) return [...peaks];
  const stride = peaks.length / DISPLAY_BINS;
  return Array.from({ length: DISPLAY_BINS }, (_, index) => {
    const start = Math.floor(index * stride);
    const end = Math.max(start + 1, Math.floor((index + 1) * stride));
    return Math.max(...peaks.slice(start, end));
  });
}

interface WaveformTranscriptProps {
  document: TranscriptDocument;
  candidates?: readonly AnalysisCandidate[];
  currentTimeMs?: number;
  onSeek?: (seconds: number) => void;
  onPreviewCandidate?: (candidate: AnalysisCandidate) => void;
}

export function WaveformTranscript({
  document,
  candidates = [],
  currentTimeMs = 0,
  onSeek,
  onPreviewCandidate,
}: WaveformTranscriptProps) {
  const bars = useMemo(() => downsample(document.waveform.peaks), [document.waveform.peaks]);
  const durationMs = document.source.durationMs;
  const playhead = Math.min(100, Math.max(0, (currentTimeMs / durationMs) * 100));

  return (
    <div
      className="relative h-24 w-full overflow-hidden border-y border-[var(--border)] bg-[var(--bg-elevated)]"
      role="group"
      aria-label={`Source waveform for media version ${document.source.versionNumber}`}
      onClick={(event) => {
        if (!onSeek) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
        onSeek((ratio * durationMs) / 1_000);
      }}
    >
      <div className="absolute inset-x-0 top-2 flex h-14 items-center gap-px px-2" aria-hidden="true">
        {bars.map((peak, index) => (
          <span
            key={index}
            className="min-w-0 flex-1 bg-[var(--muted)] opacity-70"
            style={{ height: `${Math.max(2, Math.round(peak * 52))}px` }}
          />
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-2 h-3" aria-hidden="true">
        {document.segments.map((segment) => (
          <span
            key={segment.id}
            className="absolute top-0 h-1.5 bg-[var(--accent)]"
            style={{
              left: `${(segment.startMs / durationMs) * 100}%`,
              width: `${Math.max(0.15, ((segment.endMs - segment.startMs) / durationMs) * 100)}%`,
            }}
          />
        ))}
      </div>

      {candidates.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          title={`Preview ${candidate.detector === "filler_word" ? "filler" : "silence"} candidate`}
          aria-label={`Preview ${candidate.label} at ${(candidate.startMs / 1_000).toFixed(2)} seconds`}
          className={`absolute top-0 h-full min-w-1 border-x transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
            candidate.review.status === "rejected"
              ? "border-[var(--red)] bg-[var(--red-dim)] opacity-35"
              : "border-[var(--accent)] bg-[var(--accent-dim)] opacity-65"
          }`}
          style={{
            left: `${(candidate.startMs / durationMs) * 100}%`,
            width: `${Math.max(0.3, ((candidate.endMs - candidate.startMs) / durationMs) * 100)}%`,
          }}
          onClick={(event) => {
            event.stopPropagation();
            onPreviewCandidate?.(candidate);
          }}
        />
      ))}

      <span
        className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
        style={{ left: `${playhead}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
