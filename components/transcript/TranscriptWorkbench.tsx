"use client";

import { Captions, ListFilter, Search, TextQuote, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { AnalysisCandidate, AudioAnalysisRun } from "@/lib/audio-analysis/core";
import type { TranscriptDocument } from "@/lib/transcript/core";
import { CandidateReviewList } from "@/components/transcript/CandidateReviewList";
import { WaveformTranscript } from "@/components/transcript/WaveformTranscript";

type WorkbenchTab = "transcript" | "candidates" | "captions";
const EMPTY_CANDIDATES: readonly AnalysisCandidate[] = Object.freeze([]);

interface TranscriptWorkbenchProps {
  document: TranscriptDocument;
  analysis?: AudioAnalysisRun | null;
  currentTimeMs?: number;
  pendingCandidateId?: string | null;
  onSeek?: (seconds: number) => void;
  onPreviewCandidate?: (candidate: AnalysisCandidate) => void;
  onDecision?: (candidate: AnalysisCandidate, action: "accept" | "reject") => void | Promise<void>;
}

function timecode(milliseconds: number): string {
  const totalSeconds = milliseconds / 1_000;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${Math.floor(totalSeconds % 60).toString().padStart(2, "0")}`;
}

export function TranscriptWorkbench({
  document,
  analysis = null,
  currentTimeMs = 0,
  pendingCandidateId = null,
  onSeek,
  onPreviewCandidate,
  onDecision,
}: TranscriptWorkbenchProps) {
  const [tab, setTab] = useState<WorkbenchTab>("transcript");
  const [query, setQuery] = useState("");
  const [speakerId, setSpeakerId] = useState("all");
  const [reviewLowConfidence, setReviewLowConfidence] = useState(false);
  const candidates = analysis?.candidates ?? EMPTY_CANDIDATES;
  const normalizedQuery = query.trim().toLowerCase();

  const visibleSegments = useMemo(() => {
    return document.segments.filter((segment) => {
      if (speakerId !== "all" && segment.speakerId !== speakerId) return false;
      if (normalizedQuery && !segment.text.toLowerCase().includes(normalizedQuery)) return false;
      if (!reviewLowConfidence) return true;
      const tokens = document.tokens.filter((token) => segment.tokenIds.includes(token.id));
      return tokens.some((token) => token.confidence !== null && token.confidence < 0.9);
    });
  }, [document.segments, document.tokens, normalizedQuery, reviewLowConfidence, speakerId]);

  const visibleCandidates = useMemo(() => {
    if (!normalizedQuery) return candidates;
    return candidates.filter((candidate) => candidate.label.toLowerCase().includes(normalizedQuery));
  }, [candidates, normalizedQuery]);

  return (
    <section className="min-w-0 bg-[var(--surface)] text-[var(--ink)]" aria-label="Transcript and audio analysis">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">Transcript</h2>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
            v{document.source.versionNumber} · {document.language.detectedTag} · {document.tokens.length} words
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <Users size={14} aria-hidden="true" />
          <span>{document.speakers.length} speakers</span>
          <span aria-hidden="true">·</span>
          <span>{document.provenance.provider.providerId}</span>
        </div>
      </header>

      <WaveformTranscript
        document={document}
        candidates={candidates}
        currentTimeMs={currentTimeMs}
        onSeek={onSeek}
        onPreviewCandidate={onPreviewCandidate}
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search transcript</span>
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search transcript"
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] pl-9 pr-3 text-sm outline-none focus:border-[var(--border-active)]"
          />
        </label>
        <label className="relative">
          <span className="sr-only">Filter by speaker</span>
          <select
            value={speakerId}
            onChange={(event) => setSpeakerId(event.target.value)}
            className="h-9 max-w-40 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 text-sm outline-none focus:border-[var(--border-active)]"
          >
            <option value="all">All speakers</option>
            {document.speakers.map((speaker) => (
              <option key={speaker.id} value={speaker.id}>{speaker.label}</option>
            ))}
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={reviewLowConfidence}
            onChange={(event) => setReviewLowConfidence(event.target.checked)}
            className="accent-[var(--accent)]"
          />
          Low confidence
        </label>
      </div>

      <div className="flex h-11 items-end gap-1 border-b border-[var(--border)] px-4" role="tablist" aria-label="Transcript views">
        {([
          ["transcript", "Transcript", TextQuote],
          ["candidates", `Candidates ${candidates.length}`, ListFilter],
          ["captions", `Captions ${document.captions.length}`, Captions],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`flex h-10 items-center gap-2 border-b-2 px-3 text-xs font-medium ${
              tab === value
                ? "border-[var(--accent)] text-[var(--ink)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="max-h-[34rem] overflow-y-auto px-4" role="tabpanel">
        {tab === "transcript" && (
          <ol className="divide-y divide-[var(--border)]" aria-label="Source-time transcript segments">
            {visibleSegments.map((segment) => {
              const speaker = document.speakers.find((item) => item.id === segment.speakerId);
              const tokens = document.tokens.filter((token) => segment.tokenIds.includes(token.id));
              return (
                <li key={segment.id} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 py-4">
                  <button
                    type="button"
                    className="h-fit text-left font-mono text-xs text-[var(--accent)] hover:underline"
                    onClick={() => onSeek?.(segment.startMs / 1_000)}
                  >
                    {timecode(segment.startMs)}
                  </button>
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-semibold text-[var(--muted)]">
                      {speaker?.label ?? "Unknown speaker"}
                    </p>
                    <p className="text-sm leading-7 text-[var(--ink-secondary)]">
                      {tokens.map((token) => (
                        <button
                          key={token.id}
                          type="button"
                          onClick={() => onSeek?.(token.startMs / 1_000)}
                          aria-label={`${token.text}, ${timecode(token.startMs)}, ${
                            token.confidence === null ? "confidence unavailable" : `${Math.round(token.confidence * 100)} percent confidence`
                          }`}
                          className={`mr-1 rounded-sm px-0.5 text-left hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                            token.kind === "filler"
                              ? "bg-[var(--red-dim)] text-[var(--ink)]"
                              : token.confidence !== null && token.confidence < 0.9
                                ? "border-b border-dotted border-[var(--red)]"
                                : ""
                          }`}
                        >
                          {token.text}
                        </button>
                      ))}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {tab === "candidates" && (
          <CandidateReviewList
            candidates={visibleCandidates}
            pendingCandidateId={pendingCandidateId}
            onPreview={onPreviewCandidate}
            onDecision={onDecision}
          />
        )}

        {tab === "captions" && (
          <ol className="divide-y divide-[var(--border)]" aria-label="Accessible caption cues">
            {document.captions.map((caption) => (
              <li key={caption.id} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 py-4">
                <button
                  type="button"
                  className="h-fit text-left font-mono text-xs text-[var(--accent)] hover:underline"
                  onClick={() => onSeek?.(caption.startMs / 1_000)}
                >
                  {timecode(caption.startMs)}
                </button>
                <div className="min-w-0">
                  <p className="text-sm leading-6 text-[var(--ink-secondary)]">{caption.text}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {caption.accessibility.charactersPerSecond} chars/sec · {caption.accessibility.warnings.length === 0
                      ? "No accessibility flags"
                      : caption.accessibility.warnings.join(", ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)]">
        <span>{document.source.identityDigest}</span>
        <span>{analysis ? `${analysis.pipelineVersion} · ${analysis.metrics.estimatedLatencyMs}ms budget estimate` : "Analysis not loaded"}</span>
      </footer>
    </section>
  );
}
