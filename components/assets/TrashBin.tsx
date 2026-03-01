"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { formatFileSize, timeAgo } from "@/lib/utils/media";

type DeletedAsset = {
  id: string;
  title: string;
  file_type: string;
  file_size: number | null;
  deleted_at: string;
};

export default function TrashBin({ projectId }: { projectId: string }) {
  const [assets, setAssets] = useState<DeletedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchDeleted = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/assets?project_id=${projectId}&deleted=true`
      );
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || data);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchDeleted();
  }, [fetchDeleted]);

  const handleRestore = async (id: string) => {
    setActionId(id);
    try {
      await fetch("/api/assets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", asset_ids: [id] }),
      });
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setActionId(null);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!confirm("Permanently delete this asset? This cannot be undone."))
      return;
    setActionId(id);
    try {
      await fetch(`/api/assets/${id}`, { method: "DELETE" });
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[var(--dim)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[var(--muted)]">
        <Trash2 size={18} />
        <h2 className="text-sm font-medium text-[var(--ink)]">Trash</h2>
        <span className="text-xs">({assets.length})</span>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-[var(--radius-sm)] bg-[var(--orange)]/5 border border-[var(--orange)]/20">
        <AlertTriangle size={14} className="text-[var(--orange)] mt-0.5 flex-shrink-0" />
        <p className="text-xs text-[var(--muted)]">
          Items are permanently deleted after 30 days.
        </p>
      </div>

      {assets.length === 0 ? (
        <p className="text-sm text-[var(--dim)] py-8 text-center">
          Trash is empty
        </p>
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between p-3 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)]"
            >
              <div className="min-w-0">
                <p className="text-sm text-[var(--ink)] truncate">
                  {asset.title}
                </p>
                <p className="text-xs text-[var(--dim)]">
                  {asset.file_type} {asset.file_size ? `- ${formatFileSize(asset.file_size)}` : ""}
                  {" "} - Deleted {timeAgo(asset.deleted_at)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <button
                  onClick={() => handleRestore(asset.id)}
                  disabled={actionId === asset.id}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded-[var(--radius-sm)] transition-colors disabled:opacity-50"
                >
                  {actionId === asset.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  Restore
                </button>
                <button
                  onClick={() => handlePermanentDelete(asset.id)}
                  disabled={actionId === asset.id}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs text-[var(--red)] hover:bg-[var(--red)]/10 rounded-[var(--radius-sm)] transition-colors disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
