"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import type { Tag } from "@/lib/types/codeliver";

const PRESET_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
];

export default function TagManager({
  projectId,
  tags,
  onTagsChange,
}: {
  projectId: string;
  tags: Tag[];
  onTagsChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await fetch("/api/assets/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, name: name.trim(), color }),
      });
      setName("");
      setColor(PRESET_COLORS[0]);
      setShowForm(false);
      onTagsChange();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tag? It will be removed from all assets.")) return;
    setDeletingId(id);
    try {
      await fetch("/api/assets/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      onTagsChange();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-[var(--ink)]">Tags</h3>

      {/* Existing tags */}
      <div className="space-y-1">
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="flex items-center justify-between px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--surface-2)] group"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="text-sm text-[var(--ink)]">{tag.name}</span>
            </div>
            <button
              onClick={() => handleDelete(tag.id)}
              disabled={deletingId === tag.id}
              className="opacity-0 group-hover:opacity-100 text-[var(--dim)] hover:text-[var(--red)] transition-opacity"
            >
              {deletingId === tag.id ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <X size={14} />
              )}
            </button>
          </div>
        ))}
        {tags.length === 0 && (
          <p className="text-xs text-[var(--dim)] px-2">No tags yet</p>
        )}
      </div>

      {/* Add tag form */}
      {showForm ? (
        <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--surface)] border border-[var(--border)] space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tag name"
            className="w-full px-3 py-1.5 text-sm bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--ink)] placeholder:text-[var(--dim)] focus:outline-none focus:border-[var(--accent)]"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            autoFocus
          />
          <div className="flex gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  color === c
                    ? "border-white scale-110"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || loading}
              className="px-3 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[var(--radius-sm)] disabled:opacity-50 flex items-center gap-1"
            >
              {loading && <Loader2 size={12} className="animate-spin" />}
              Add
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setName("");
              }}
              className="px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs text-[var(--dim)] hover:text-[var(--muted)] transition-colors"
        >
          <Plus size={14} />
          Add Tag
        </button>
      )}
    </div>
  );
}
