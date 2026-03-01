"use client";

import { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  Loader2,
  TrendingUp,
  Minus,
  TrendingDown,
} from "lucide-react";

interface AISummaryProps {
  assetId: string;
  comments: Array<{
    body: string;
    author_name: string;
    status: string;
  }>;
}

interface SummaryResult {
  sentiment: "positive" | "neutral" | "negative";
  themes: string[];
  action_items: string[];
  summary: string;
}

const SENTIMENT_CONFIG = {
  positive: {
    label: "Positive",
    color: "var(--green)",
    icon: <TrendingUp size={14} />,
  },
  neutral: {
    label: "Neutral",
    color: "var(--orange)",
    icon: <Minus size={14} />,
  },
  negative: {
    label: "Negative",
    color: "var(--red)",
    icon: <TrendingDown size={14} />,
  },
};

export default function AISummary({ assetId, comments }: AISummaryProps) {
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["sentiment", "themes", "actions", "summary"])
  );

  function toggleSection(section: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }

  function toggleCheck(idx: number) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: assetId, comments }),
      });

      if (!res.ok) throw new Error("Summary generation failed");

      const json = await res.json();

      // Parse enhanced response — the API may return structured or text data
      const data = json as Record<string, unknown>;

      const parsed: SummaryResult = {
        sentiment: (data.sentiment as SummaryResult["sentiment"]) || "neutral",
        themes: (data.themes as string[]) || [],
        action_items: (data.action_items as string[]) || [],
        summary: (data.summary as string) || (data.text as string) || "",
      };

      setResult(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <div className="space-y-3">
        <button
          onClick={generate}
          disabled={loading || comments.length === 0}
          className="flex items-center gap-2 bg-[var(--accent)] text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {loading ? "Generating..." : "Generate Summary"}
        </button>
        {comments.length === 0 && (
          <p className="text-xs text-[var(--dim)]">
            No comments to summarize yet.
          </p>
        )}
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
      </div>
    );
  }

  const sentimentCfg = SENTIMENT_CONFIG[result.sentiment];

  return (
    <div className="space-y-3">
      {/* Sentiment */}
      <CollapsibleSection
        title="Sentiment"
        expanded={expandedSections.has("sentiment")}
        onToggle={() => toggleSection("sentiment")}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: `color-mix(in srgb, ${sentimentCfg.color} 15%, transparent)`,
              color: sentimentCfg.color,
            }}
          >
            {sentimentCfg.icon}
          </div>
          <span
            className="text-sm font-medium"
            style={{ color: sentimentCfg.color }}
          >
            {sentimentCfg.label}
          </span>
        </div>
      </CollapsibleSection>

      {/* Key Themes */}
      {result.themes.length > 0 && (
        <CollapsibleSection
          title="Key Themes"
          expanded={expandedSections.has("themes")}
          onToggle={() => toggleSection("themes")}
        >
          <div className="flex flex-wrap gap-2">
            {result.themes.map((theme, i) => (
              <span
                key={i}
                className="px-2.5 py-1 text-xs font-medium bg-[var(--surface-2)] text-[var(--ink)] rounded-full border border-[var(--border)]"
              >
                {theme}
              </span>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Action Items */}
      {result.action_items.length > 0 && (
        <CollapsibleSection
          title="Action Items"
          expanded={expandedSections.has("actions")}
          onToggle={() => toggleSection("actions")}
        >
          <ul className="space-y-1.5">
            {result.action_items.map((item, i) => (
              <li key={i}>
                <button
                  onClick={() => toggleCheck(i)}
                  className="flex items-start gap-2 text-sm text-left w-full group"
                >
                  {checkedItems.has(i) ? (
                    <CheckSquare
                      size={16}
                      className="text-[var(--green)] shrink-0 mt-0.5"
                    />
                  ) : (
                    <Square
                      size={16}
                      className="text-[var(--dim)] group-hover:text-[var(--muted)] shrink-0 mt-0.5"
                    />
                  )}
                  <span
                    className={
                      checkedItems.has(i)
                        ? "text-[var(--dim)] line-through"
                        : "text-[var(--ink)]"
                    }
                  >
                    {item}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Summary */}
      <CollapsibleSection
        title="Summary"
        expanded={expandedSections.has("summary")}
        onToggle={() => toggleSection("summary")}
      >
        <p className="text-sm text-[var(--muted)] leading-relaxed">
          {result.summary}
        </p>
      </CollapsibleSection>

      {/* Regenerate */}
      <button
        onClick={generate}
        disabled={loading}
        className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
      >
        {loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Sparkles size={12} />
        )}
        Regenerate
      </button>
    </div>
  );
}

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider hover:text-[var(--ink)] transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} />
        ) : (
          <ChevronRight size={14} />
        )}
        {title}
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
