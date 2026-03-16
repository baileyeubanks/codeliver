"use client";

import { X, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";

interface UploadMonitorProps {
  onClose: () => void;
}

export default function UploadMonitor({ onClose }: UploadMonitorProps) {
  const [tab, setTab] = useState<"processing" | "completed">("processing");

  return (
    <div
      className="fixed right-4 top-16 w-80 z-50"
      style={{ animation: "slideUp 0.2s ease-out" }}
    >
      <div className="card" style={{ boxShadow: "var(--shadow-lg)" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <span className="text-sm font-semibold">Media Uploads</span>
          <button onClick={onClose} className="btn-icon" style={{ width: 28, height: 28 }}>
            <X size={14} />
          </button>
        </div>

        <div className="tabs">
          <button
            className={`tab flex-1 ${tab === "processing" ? "active" : ""}`}
            onClick={() => setTab("processing")}
          >
            Processing
          </button>
          <button
            className={`tab flex-1 ${tab === "completed" ? "active" : ""}`}
            onClick={() => setTab("completed")}
          >
            Completed
          </button>
        </div>

        <div className="p-4" style={{ minHeight: 120 }}>
          {tab === "processing" ? (
            <div className="empty-state" style={{ padding: "16px 0" }}>
              <Loader2 size={20} className="text-[var(--dim)] mb-2" />
              <p className="text-xs text-[var(--muted)]">No uploads in progress</p>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "16px 0" }}>
              <CheckCircle2 size={20} className="text-[var(--dim)] mb-2" />
              <p className="text-xs text-[var(--muted)]">No completed uploads</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
