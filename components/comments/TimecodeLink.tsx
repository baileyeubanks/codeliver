"use client";

import { DEFAULT_TIMECODE_FPS, formatSmpteTimecode } from "@/components/player/timecode";

interface TimecodeLinkProps {
  seconds: number;
  onClick?: () => void;
  /** Per-asset frame rate; defaults to the P16 24fps review default. */
  fps?: number;
}

export default function TimecodeLink({ seconds, onClick, fps = DEFAULT_TIMECODE_FPS }: TimecodeLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20 hover:underline"
    >
      {formatSmpteTimecode(seconds, fps)}
    </button>
  );
}
