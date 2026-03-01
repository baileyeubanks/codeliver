"use client";

import { useState } from "react";
import { Download, Loader2, FileText, FileJson } from "lucide-react";

interface ExportReportProps {
  projectId: string;
}

type ExportFormat = "csv" | "json";

export default function ExportReport({ projectId }: ExportReportProps) {
  const [loading, setLoading] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("csv");

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/analytics/export?project_id=${projectId}&format=${format}`
      );
      if (!res.ok) throw new Error("Export failed");

      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch
        ? filenameMatch[1]
        : `report.${format}`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silently handle - user can retry
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {/* Format toggle */}
      <div className="flex bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] overflow-hidden">
        <button
          onClick={() => setFormat("csv")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            format === "csv"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          <FileText size={12} />
          CSV
        </button>
        <button
          onClick={() => setFormat("json")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            format === "json"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          <FileJson size={12} />
          JSON
        </button>
      </div>

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={loading}
        className="flex items-center gap-2 bg-[var(--accent)] text-white text-sm font-semibold px-4 py-2 rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        {loading ? "Exporting..." : "Export Report"}
      </button>
    </div>
  );
}
