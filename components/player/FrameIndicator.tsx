"use client";

import { usePlayerStore, frameToTimecode } from "@/lib/stores/playerStore";

export default function FrameIndicator() {
  const currentFrame = usePlayerStore((s) => s.currentFrame);
  const frameRate = usePlayerStore((s) => s.frameRate);

  const frame = currentFrame();
  const timecode = frameToTimecode(frame, frameRate);

  return (
    <div className="absolute right-3 top-3 z-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 font-mono text-xs text-[var(--muted)]">
      <span className="text-[var(--ink)]">{timecode}</span>
      <span className="mx-1.5 text-[var(--dim)]">|</span>
      <span>F{frame}</span>
    </div>
  );
}
