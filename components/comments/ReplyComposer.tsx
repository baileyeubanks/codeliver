"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import {
  extractMentionQuery,
  filterMentionRoster,
  parseMentions,
  type MentionQuery,
} from "@/lib/comments/mentions";
import type { MentionRosterEntry } from "@/lib/types/codeliver";

interface ReplyComposerProps {
  roster?: MentionRosterEntry[];
  onSubmit: (body: string, mentions: string[]) => void;
  onCancel?: () => void;
  placeholder?: string;
  submitLabel?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}

/**
 * Inline reply composer. Enter sends, Shift+Enter inserts a newline.
 * Typing `@` opens an autocomplete over the provided roster; the submitted
 * body's parsed handles are handed back via `onSubmit(body, mentions)`.
 */
export default function ReplyComposer({
  roster = [],
  onSubmit,
  onCancel,
  placeholder = "Write a reply… (@ to mention)",
  submitLabel = "Reply",
  ariaLabel = "Reply",
  autoFocus = false,
}: ReplyComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const suggestions = query ? filterMentionRoster(roster, query.query) : [];
  const autocompleteOpen = query !== null && suggestions.length > 0;

  function syncQuery(value: string, caret: number) {
    setQuery(extractMentionQuery(value, caret));
    setHighlighted(0);
  }

  function insertMention(entry: MentionRosterEntry) {
    if (!query) return;
    const caret = textareaRef.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, query.start)}@${entry.handle} ${text.slice(caret)}`;
    setText(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const position = query.start + entry.handle.length + 2;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(position, position);
    });
  }

  function submit() {
    const body = text.trim();
    if (!body) return;
    onSubmit(body, parseMentions(body));
    setText("");
    setQuery(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (autocompleteOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted(
          (index) => (index - 1 + suggestions.length) % suggestions.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(suggestions[highlighted]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={text}
        autoFocus={autoFocus}
        rows={2}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={autocompleteOpen}
        aria-controls={autocompleteOpen ? "mention-autocomplete" : undefined}
        onChange={(event) => {
          setText(event.target.value);
          syncQuery(event.target.value, event.target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:border-[var(--accent)] focus:outline-none"
      />

      {autocompleteOpen && (
        <ul
          id="mention-autocomplete"
          role="listbox"
          aria-label="Mention suggestions"
          className="absolute bottom-full left-0 z-20 mb-1 w-56 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] shadow-lg"
        >
          {suggestions.map((entry, index) => (
            <li key={entry.id} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onClick={() => insertMention(entry)}
                onMouseEnter={() => setHighlighted(index)}
                className={`flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm sm:min-h-0 ${
                  index === highlighted
                    ? "bg-[var(--accent)]/10 text-[var(--ink)]"
                    : "text-[var(--muted)]"
                }`}
              >
                <span className="font-medium text-[var(--blue)]">
                  @{entry.handle}
                </span>
                <span className="truncate text-xs text-[var(--dim)]">
                  {entry.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-[var(--radius-sm)] px-3 text-xs text-[var(--muted)] transition-colors hover:text-[var(--ink)] sm:min-h-0"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          aria-label={submitLabel}
          className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40 sm:min-h-0 sm:py-1.5"
        >
          <Send size={12} />
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
