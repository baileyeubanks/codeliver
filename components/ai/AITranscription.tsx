"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Mic,
  Loader2,
  Search,
  Download,
  Clock,
  RefreshCw,
} from "lucide-react";
import type { Transcription, TranscriptionSegment } from "@/lib/types/codeliver";

interface AITranscriptionProps {
  assetId: string;
  onTimecodeClick?: (seconds: number) => void;
}

type ExportFormat = "txt" | "srt";

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

export default function AITranscription({
  assetId,
  onTimecodeClick,
}: AITranscriptionProps) {
  const [transcription, setTranscription] = useState<Transcription | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const fetchTranscription = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/ai/transcribe?asset_id=${assetId}`
      );
      if (!res.ok) throw new Error("Failed to load transcription");
      const json = await res.json();
      setTranscription(
        (json.transcription as Transcription | null) || null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    fetchTranscription();
  }, [fetchTranscription]);

  async function startTranscription() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: assetId }),
      });
      if (!res.ok) throw new Error("Failed to start transcription");
      // Re-fetch to show processing state
      await fetchTranscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  function exportTranscription(format: ExportFormat) {
    if (!transcription || transcription.segments.length === 0) return;

    let content: string;
    let mimeType: string;
    let extension: string;

    if (format === "srt") {
      content = transcription.segments
        .map((seg: TranscriptionSegment, i: number) =>
          `${i + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text}`
        )
        .join("\n\n");
      mimeType = "text/srt";
      extension = "srt";
    } else {
      content = transcription.segments
        .map(
          (seg: TranscriptionSegment) =>
            `[${formatTimecode(seg.start)}] ${seg.text}`
        )
        .join("\n");
      mimeType = "text/plain";
      extension = "txt";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcription.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const filteredSegments = useMemo(() => {
    if (!transcription) return [];
    if (!search.trim()) return transcription.segments;
    const q = search.toLowerCase();
    return transcription.segments.filter((seg: TranscriptionSegment) =>
      seg.text.toLowerCase().includes(q)
    );
  }, [transcription, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw size={18} className="animate-spin text-[var(--muted)]" />
        <span className="ml-2 text-sm text-[var(--muted)]">Loading...</span>
      </div>
    );
  }

  // No transcription exists
  if (!transcription) {
    return (
      <div className="space-y-3">
        <button
          onClick={startTranscription}
          disabled={generating}
          className="flex items-center gap-2 bg-[var(--accent)] text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
        >
          {generating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Mic size={16} />
          )}
          {generating ? "Starting..." : "Generate Transcription"}
        </button>
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
      </div>
    );
  }

  // Processing state
  if (
    transcription.status === "pending" ||
    transcription.status === "processing"
  ) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-5">
        <div className="flex items-center gap-3 mb-3">
          <Loader2
            size={20}
            className="animate-spin text-[var(--accent)]"
          />
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">
              Transcription in progress
            </p>
            <p className="text-xs text-[var(--muted)]">
              This may take a few minutes...
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
          <div className="h-full bg-[var(--accent)] rounded-full animate-pulse w-2/3" />
        </div>
        <button
          onClick={fetchTranscription}
          className="mt-3 text-xs text-[var(--accent)] hover:underline"
        >
          Check status
        </button>
      </div>
    );
  }

  // Failed state
  if (transcription.status === "failed") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--red)]">
          Transcription failed. Please try again.
        </p>
        <button
          onClick={startTranscription}
          disabled={generating}
          className="flex items-center gap-2 bg-[var(--accent)] text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
        >
          {generating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Mic size={16} />
          )}
          Retry Transcription
        </button>
      </div>
    );
  }

  // Completed — show segments
  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transcript..."
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] pl-8 pr-3 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Export */}
        <div className="flex gap-1">
          <button
            onClick={() => exportTranscription("txt")}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] transition-colors"
          >
            <Download size={12} />
            .txt
          </button>
          <button
            onClick={() => exportTranscription("srt")}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] transition-colors"
          >
            <Download size={12} />
            .srt
          </button>
        </div>
      </div>

      {/* Segments */}
      <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1">
        {filteredSegments.length === 0 ? (
          <p className="text-sm text-[var(--dim)] py-4">
            {search ? "No matching segments." : "No segments available."}
          </p>
        ) : (
          filteredSegments.map((seg: TranscriptionSegment, i: number) => (
            <div
              key={i}
              className="flex gap-3 py-1.5 group hover:bg-white/[0.02] rounded-[var(--radius-sm)] px-2 -mx-2 transition-colors"
            >
              <button
                onClick={() => onTimecodeClick?.(seg.start)}
                className="flex items-center gap-1 text-xs text-[var(--accent)] font-mono shrink-0 hover:underline"
              >
                <Clock size={10} />
                {formatTimecode(seg.start)}
              </button>
              <p className="text-sm text-[var(--ink)] leading-relaxed">
                {seg.text}
              </p>
            </div>
          ))
        )}
      </div>

      {error && <p className="text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}
