"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowUpDown, RefreshCw } from "lucide-react";

interface ReviewerStatsProps {
  projectId: string;
}

interface ReviewerStat {
  email: string;
  avg_response_hours: number;
  approval_rate: number;
  total_comments: number;
  total_decisions: number;
}

type SortKey = keyof ReviewerStat;

export default function ReviewerStats({ projectId }: ReviewerStatsProps) {
  const [reviewers, setReviewers] = useState<ReviewerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_decisions");
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/analytics/project?project_id=${projectId}&type=reviewers`
      );
      if (!res.ok) throw new Error("Failed to load reviewer stats");
      const json = await res.json();
      setReviewers((json.reviewers ?? []) as ReviewerStat[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sorted = [...reviewers].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const na = av as number;
    const nb = bv as number;
    return sortAsc ? na - nb : nb - na;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw size={18} className="animate-spin text-[var(--muted)]" />
        <span className="ml-2 text-sm text-[var(--muted)]">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-[var(--red)]">{error}</p>
        <button
          onClick={fetchData}
          className="mt-2 text-sm text-[var(--accent)] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (reviewers.length === 0) {
    return (
      <p className="text-sm text-[var(--dim)] py-4">
        No reviewer activity yet.
      </p>
    );
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: "email", label: "Reviewer" },
    { key: "avg_response_hours", label: "Avg Response" },
    { key: "approval_rate", label: "Approval Rate" },
    { key: "total_comments", label: "Comments" },
    { key: "total_decisions", label: "Decisions" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left py-2 px-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider cursor-pointer hover:text-[var(--ink)] select-none"
                onClick={() => handleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  <ArrowUpDown
                    size={12}
                    className={
                      sortKey === col.key
                        ? "text-[var(--accent)]"
                        : "text-[var(--dim)]"
                    }
                  />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.email}
              className="border-b border-[var(--border)] hover:bg-white/[0.02] transition-colors"
            >
              <td className="py-2.5 px-3 text-[var(--ink)] font-medium">
                {r.email}
              </td>
              <td className="py-2.5 px-3 text-[var(--muted)]">
                {r.avg_response_hours}h
              </td>
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${r.approval_rate}%`,
                        backgroundColor:
                          r.approval_rate >= 80
                            ? "var(--green)"
                            : r.approval_rate >= 50
                              ? "var(--orange)"
                              : "var(--red)",
                      }}
                    />
                  </div>
                  <span className="text-[var(--muted)] text-xs">
                    {r.approval_rate}%
                  </span>
                </div>
              </td>
              <td className="py-2.5 px-3 text-[var(--muted)]">
                {r.total_comments}
              </td>
              <td className="py-2.5 px-3 text-[var(--muted)]">
                {r.total_decisions}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
