"use client";

import { useState } from "react";
import {
  Shield,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";

interface AIBrandCheckProps {
  assetId: string;
}

interface CategoryResult {
  name: string;
  status: "pass" | "fail" | "warning";
  score: number;
  details: string;
}

interface IssueResult {
  category: string;
  severity: "high" | "medium" | "low";
  description: string;
  timecode_seconds?: number;
}

interface BrandCheckResult {
  overall_score: number;
  categories: CategoryResult[];
  issues: IssueResult[];
  summary: string;
}

const STATUS_CONFIG = {
  pass: {
    icon: <CheckCircle2 size={16} />,
    color: "var(--green)",
    label: "Pass",
  },
  fail: {
    icon: <XCircle size={16} />,
    color: "var(--red)",
    label: "Fail",
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    color: "var(--orange)",
    label: "Warning",
  },
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "var(--red)",
  medium: "var(--orange)",
  low: "var(--muted)",
};

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function CircularGauge({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80
      ? "var(--green)"
      : score >= 60
        ? "var(--orange)"
        : "var(--red)";

  return (
    <div className="relative w-24 h-24">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold text-[var(--ink)]">{score}</span>
      </div>
    </div>
  );
}

export default function AIBrandCheck({ assetId }: AIBrandCheckProps) {
  const [result, setResult] = useState<BrandCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runCheck() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/brand-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: assetId }),
      });
      if (!res.ok) throw new Error("Brand check failed");
      const json = await res.json();
      const check = json.brand_check as {
        results: Record<string, unknown>;
        score: number;
      };
      setResult(check.results as unknown as BrandCheckResult);
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
          onClick={runCheck}
          disabled={loading}
          className="flex items-center gap-2 bg-[var(--accent)] text-white text-sm font-semibold px-4 py-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Shield size={16} />
          )}
          {loading ? "Analyzing..." : "Run Brand Check"}
        </button>
        {error && <p className="text-xs text-[var(--red)]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Scorecard header */}
      <div className="flex items-center gap-6">
        <CircularGauge score={result.overall_score} />
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">
            Brand Compliance Score
          </p>
          <p className="text-xs text-[var(--muted)] mt-1">
            {result.summary}
          </p>
        </div>
      </div>

      {/* Category scores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {result.categories.map((cat) => {
          const cfg = STATUS_CONFIG[cat.status];
          return (
            <div
              key={cat.name}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-[var(--ink)] capitalize">
                  {cat.name}
                </span>
                <span
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: cfg.color }}
                >
                  {cfg.icon}
                  {cfg.label}
                </span>
              </div>
              {/* Score bar */}
              <div className="w-full h-1.5 bg-[var(--border)] rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${cat.score}%`,
                    backgroundColor: cfg.color,
                  }}
                />
              </div>
              <p className="text-xs text-[var(--dim)]">{cat.details}</p>
            </div>
          );
        })}
      </div>

      {/* Issues */}
      {result.issues.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
            Issues Found
          </h4>
          <div className="space-y-2">
            {result.issues.map((issue, i) => (
              <div
                key={i}
                className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3"
              >
                <span
                  className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded"
                  style={{
                    color: SEVERITY_COLORS[issue.severity],
                    backgroundColor: `color-mix(in srgb, ${SEVERITY_COLORS[issue.severity]} 15%, transparent)`,
                  }}
                >
                  {issue.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--ink)]">
                    {issue.description}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-[var(--dim)] capitalize">
                      {issue.category}
                    </span>
                    {issue.timecode_seconds !== undefined && (
                      <span className="flex items-center gap-1 text-xs text-[var(--accent)] font-mono">
                        <Clock size={10} />
                        {formatTimecode(issue.timecode_seconds)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Re-run */}
      <button
        onClick={runCheck}
        disabled={loading}
        className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
      >
        {loading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Shield size={12} />
        )}
        Re-run Check
      </button>
    </div>
  );
}
