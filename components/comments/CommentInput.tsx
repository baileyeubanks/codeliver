"use client";

import { useRef, useState, useCallback } from "react";
import { Send, X, MapPin, Clock } from "lucide-react";
import { formatTime } from "@/lib/stores/playerStore";
import MentionSuggestions from "@/components/comments/MentionSuggestions";
import type { Comment } from "@/lib/types/codeliver";

interface CommentInputProps {
  assetId: string;
  parentId?: string;
  timecode?: number;
  pin?: { x: number; y: number } | null;
  onSubmit: (comment: Comment) => void;
  onCancel?: () => void;
}

export default function CommentInput({
  assetId,
  parentId,
  timecode,
  pin,
  onSubmit,
  onCancel,
}: CommentInputProps) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, []);

  function handleChange(value: string) {
    setBody(value);

    // Detect @mention trigger
    const match = value.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  }

  function handleMentionSelect(name: string) {
    const updated = body.replace(/@\w*$/, `@${name} `);
    setBody(updated);
    setShowMentions(false);
    textareaRef.current?.focus();
  }

  async function handleSubmit() {
    if (!body.trim() || submitting) return;
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        body: body.trim(),
        parent_id: parentId || null,
        timecode_seconds: timecode ?? null,
        pin_x: pin?.x ?? null,
        pin_y: pin?.y ?? null,
      };

      const res = await fetch(`/api/assets/${assetId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to post comment");

      const { comment } = await res.json();
      onSubmit(comment);
      setBody("");

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3">
      {/* Context indicators */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {parentId && (
          <span className="flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent)]">
            Replying to...
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--accent)]/20"
              >
                <X size={10} />
              </button>
            )}
          </span>
        )}
        {timecode != null && timecode > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--muted)]">
            <Clock size={10} />
            {formatTime(timecode)}
          </span>
        )}
        {pin && (
          <span className="flex items-center gap-1 rounded-full bg-[var(--orange)]/10 px-2 py-0.5 text-xs text-[var(--orange)]">
            <MapPin size={10} />
            Pin set
          </span>
        )}
      </div>

      {/* Input area */}
      <div className="relative">
        <MentionSuggestions
          query={mentionQuery}
          onSelect={handleMentionSelect}
          visible={showMentions}
        />
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => {
            handleChange(e.target.value);
            autoResize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Add a comment... (@ to mention)"
          rows={1}
          className="w-full resize-none bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:outline-none"
        />
      </div>

      {/* Submit row */}
      <div className="mt-2 flex items-center justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={12} />
          {submitting ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
