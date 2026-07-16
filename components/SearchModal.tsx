"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect, useMemo } from "react";
import { Film, Search, X } from "lucide-react";
import { useDemoMode } from "@/lib/demo/mode";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";

interface SearchModalProps {
  onClose: () => void;
}

export default function SearchModal({ onClose }: SearchModalProps) {
  const demoMode = useDemoMode();
  const workspace = useDemoWorkspace();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    if (!demoMode || !query.trim()) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return workspace.assets.filter((asset) => {
      const project = workspace.projects.find((candidate) => candidate.id === asset.project_id);
      return (
        asset.title.toLowerCase().includes(normalizedQuery) ||
        project?.name.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [demoMode, query, workspace.assets, workspace.projects]);

  useEffect(() => {
    inputRef.current?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 600 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="flex items-center gap-3 flex-1">
            <Search size={18} className="text-[var(--muted)]" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search for Media..."
              aria-label="Search media"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--ink)]"
            />
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close search">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ minHeight: 200 }}>
          {!query ? (
            <div className="empty-state" style={{ padding: "32px 24px" }}>
              <p className="text-sm text-[var(--muted)]">
                Search by media title or tag across all projects
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="empty-state" style={{ padding: "32px 24px" }}>
              <p className="text-sm text-[var(--muted)]">
                No results for &ldquo;{query}&rdquo;
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {results.map((asset) => (
                <Link
                  key={asset.id}
                  href={asset.href ?? `/projects/${asset.project_id}/assets/${asset.id}`}
                  className="flex items-center gap-3 py-3 text-sm hover:bg-[var(--surface-hover)]"
                  onClick={onClose}
                >
                  <span className="relative flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
                    {asset.thumbnail_url ? (
                      <Image src={asset.thumbnail_url} alt="" fill sizes="64px" className="object-cover" />
                    ) : (
                      <Film size={16} className="text-[var(--muted)]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate font-medium">{asset.title}</strong>
                    <small className="block truncate text-[var(--muted)]">
                      {workspace.projects.find((project) => project.id === asset.project_id)?.name ?? "Project"}
                    </small>
                  </span>
                  <span className="text-xs capitalize text-[var(--muted)]">
                    {asset.status.replace(/_/g, " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
