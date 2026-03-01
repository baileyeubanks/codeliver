"use client";

import { formatTime } from "@/lib/stores/playerStore";

interface TimecodeLinkProps {
  seconds: number;
  onClick?: () => void;
}

export default function TimecodeLink({ seconds, onClick }: TimecodeLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20 hover:underline"
    >
      {formatTime(seconds)}
    </button>
  );
}
