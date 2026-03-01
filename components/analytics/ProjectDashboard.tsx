"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileStack,
  Eye,
  MessageSquare,
  Clock,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface ProjectDashboardProps {
  projectId: string;
}

interface DayCount {
  date: string;
  count: number;
}

interface AnalyticsData {
  total_assets: number;
  active_reviews: number;
  comments_this_week: number;
  avg_approval_hours: number;
  comments_per_day: DayCount[];
  decisions: Record<string, number>;
}

const DECISION_LABELS: Record<string, string> = {
  approved: "Approved",
  approved_with_changes: "Approved w/ Changes",
  changes_requested: "Changes Requested",
  rejected: "Rejected",
};

const DECISION_COLORS: Record<string, string> = {
  approved: "var(--green)",
  approved_with_changes: "var(--orange)",
  changes_requested: "var(--purple)",
  rejected: "var(--red)",
};

export default function ProjectDashboard({ projectId }: ProjectDashboardProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/analytics/project?project_id=${projectId}`
      );
      if (!res.ok) throw new Error("Failed to load analytics");
      const json = await res.json();
      setData(json as AnalyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw size={20} className="animate-spin text-[var(--muted)]" />
        <span className="ml-2 text-sm text-[var(--muted)]">
          Loading analytics...
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-[var(--red)]">{error || "No data"}</p>
        <button
          onClick={fetchData}
          className="mt-2 text-sm text-[var(--accent)] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const decisionChartData = Object.entries(data.decisions).map(
    ([key, value]) => ({
      name: DECISION_LABELS[key] || key,
      count: value,
      fill: DECISION_COLORS[key] || "var(--accent)",
    })
  );

  const stats = [
    {
      label: "Total Assets",
      value: data.total_assets,
      icon: <FileStack size={18} />,
      color: "var(--accent)",
    },
    {
      label: "Active Reviews",
      value: data.active_reviews,
      icon: <Eye size={18} />,
      color: "var(--orange)",
    },
    {
      label: "Comments This Week",
      value: data.comments_this_week,
      icon: <MessageSquare size={18} />,
      color: "var(--green)",
    },
    {
      label: "Avg Approval Time",
      value: `${data.avg_approval_hours}h`,
      icon: <Clock size={18} />,
      color: "var(--purple)",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-4"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center"
                style={{ backgroundColor: `color-mix(in srgb, ${s.color} 15%, transparent)` }}
              >
                <span style={{ color: s.color }}>{s.icon}</span>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider">
                  {s.label}
                </p>
                <p className="text-xl font-bold text-[var(--ink)]">
                  {s.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Comments per day */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-5">
          <h3 className="text-sm font-semibold text-[var(--ink)] mb-4">
            Comments (Last 30 Days)
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.comments_per_day}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--dim)", fontSize: 10 }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis
                tick={{ fill: "var(--dim)", fontSize: 10 }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--ink)",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                name="Comments"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Approval decisions */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-5">
          <h3 className="text-sm font-semibold text-[var(--ink)] mb-4">
            Approval Decisions
          </h3>
          {decisionChartData.length === 0 ? (
            <p className="text-sm text-[var(--dim)] py-8 text-center">
              No decisions yet
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={decisionChartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--dim)", fontSize: 10 }}
                />
                <YAxis
                  tick={{ fill: "var(--dim)", fontSize: 10 }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--ink)",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                <Bar dataKey="count" name="Decisions" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
