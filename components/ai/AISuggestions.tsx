"use client";

import { useState } from "react";
import {
  Lightbulb,
  Loader2,
  X,
  Clock,
  MessageSquare,
} from "lucide-react";

interface AISuggestionsProps {
  assetId: string;
  comments: Array<{
    body: string;
    author_name: string;
    timecode_seconds: number | null;
  }>;
}

interface Suggestion {
  id: string;
  priority: "high" | "medium" | "low";
  description: string;
  related_comments: number[];
  timecode_seconds: number | null;
}

const PRIORITY_CONFIG = {
  high: {
    label: "High",
    color: "var(--red)",
    bg: "color-mix(in srgb, var(--red) 12%, transparent)",
  },
  medium: {
    label: "Medium",
    color: "var(--orange)",
    bg: "color-mix(in srgb, var(--orange) 12%, transparent)",
  },
  low: {
    label: "Low",
    color: "var(--muted)",
    bg: "color-mix(in srgb, var(--muted) 12%, transparent)",
  },
};

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AISuggestions({
  assetId,
  comments,
}: AISuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  async function getSuggestions() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          comments,
          mode: "suggestions",
        }),
      });
      if (!res.ok) throw new Error("Failed to get suggestions");
      const json = await res.json();
      const items = (json.suggestions ?? json.action_items ?? []) as Array<{
        id?: string;
        priority?: string;
        description?: string;
        text?: string;
        related_comments?: number[];
        timecode_seconds?: number | null;
      }>;

      const parsed: Suggestion[] = items.map((item, i) => ({
        id: item.id || `sug-${i}`,
        priority: (item.priority as Suggestion["priority"]) || "medium",
        description: item.description || item.text || String(item),
        related_comments: item.related_comments || [],
        timecode_seconds: item.timecode_seconds ?? null,
      }));

      setSuggestions(parsed);
      setDismissed(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
  }

  const visible = suggestions.filter((s) => !dismissed.has(s.id));

  if (suggestions.length === 0) {
    return (
      <div className="space-y-3">
        <button
          onClick={getSuggestions}
          disabled={loading || comments.length === 0}
          className="flex items-center gap-2 bg-[var(--accent)] text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Lightbulb size={16} />
          )}
          {loading ? "Analyzing..." : "Get AI Suggestions"}
        </button>
        {comments.length === 0 && (
          <p className="text-xs text-[var(--dim)]">
            Add comments first for AI to analyze.
          </p>
        )}
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visible.length === 0 ? (
        <p className="text-sm text-[var(--dim)] py-2">
          All suggestions dismissed.
        </p>
      ) : (
        visible.map((sug) => {
          const pCfg = PRIORITY_CONFIG[sug.priority];
          return (
            <div
              key={sug.id}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  {/* Priority badge */}
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded shrink-0 mt-0.5"
                    style={{
                      color: pCfg.color,
                      backgroundColor: pCfg.bg,
                    }}
                  >
                    {pCfg.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--ink)]">
                      {sug.description}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {/* Related comments */}
                      {sug.related_comments.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-[var(--dim)]">
                          <MessageSquare size={10} />
                          {sug.related_comments.length} related comment
                          {sug.related_comments.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {/* Timecode */}
                      {sug.timecode_seconds !== null && (
                        <span className="flex items-center gap-1 text-xs text-[var(--accent)] font-mono">
                          <Clock size={10} />
                          {formatTimecode(sug.timecode_seconds)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Dismiss */}
                <button
                  onClick={() => dismiss(sug.id)}
                  className="text-[var(--dim)] hover:text-[var(--ink)] shrink-0"
                  title="Dismiss suggestion"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })
      )}

      {/* Regenerate */}
      <button
        onClick={getSuggestions}
        disabled={loading}
        className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
      >
        {loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Lightbulb size={12} />
        )}
        Regenerate Suggestions
      </button>
    </div>
  );
}
