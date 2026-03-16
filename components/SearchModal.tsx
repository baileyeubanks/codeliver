"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

interface SearchModalProps {
  onClose: () => void;
}

export default function SearchModal({ onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--ink)]"
            />
          </div>
          <button onClick={onClose} className="btn-icon">
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
          ) : (
            <div className="empty-state" style={{ padding: "32px 24px" }}>
              <p className="text-sm text-[var(--muted)]">
                No results for &ldquo;{query}&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
