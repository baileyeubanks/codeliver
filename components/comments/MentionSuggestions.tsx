"use client";

import { useEffect, useRef, useState } from "react";

interface Suggestion {
  name: string;
  email: string;
}

interface MentionSuggestionsProps {
  query: string;
  onSelect: (name: string, email: string) => void;
  visible: boolean;
}

const MOCK_USERS: Suggestion[] = [
  { name: "Bailey Eubanks", email: "bailey@contentco-op.com" },
  { name: "Caio Gustin", email: "caio@astrocleanings.com" },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function MentionSuggestions({
  query,
  onSelect,
  visible,
}: MentionSuggestionsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = MOCK_USERS.filter(
    (u) =>
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!visible) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        onSelect(filtered[activeIndex].name, filtered[activeIndex].email);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, activeIndex, filtered, onSelect]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
    >
      {filtered.map((user, i) => (
        <button
          key={user.email}
          type="button"
          onClick={() => onSelect(user.name, user.email)}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
            i === activeIndex
              ? "bg-[var(--accent)]/10 text-[var(--ink)]"
              : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
          }`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/20 text-[10px] font-semibold text-[var(--accent)]">
            {getInitials(user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-[var(--dim)]">{user.email}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
