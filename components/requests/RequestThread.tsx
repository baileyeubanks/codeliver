"use client";

import { useState } from "react";
import { Lock, Send } from "lucide-react";
import type { DemoRequestMessage } from "@/lib/demo/workspace-store";
import { visibleRequestMessages, type MessageVisibility, type RequestAudience } from "@/lib/requests/views.ts";

export interface RequestThreadProps {
  messages: DemoRequestMessage[];
  /** client = portal view (internal notes filtered out); team = internal queue. */
  audience: RequestAudience;
  /** Posts a message; returns ok or a truthful failure reason. */
  onPost: (input: { body: string; visibility: MessageVisibility }) => { ok: boolean; reason?: string };
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Per-request messaging thread. Internal notes are a team-only channel: the
 * filtering happens in visibleRequestMessages, so the client audience cannot
 * render them even if asked.
 */
export default function RequestThread({ messages, audience, onPost }: RequestThreadProps) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<MessageVisibility>("client");
  const [error, setError] = useState<string | null>(null);

  const visible = visibleRequestMessages(messages, audience);

  function handlePost(event: React.FormEvent) {
    event.preventDefault();
    const result = onPost({ body, visibility });
    if (!result.ok) {
      setError(result.reason ?? "The message could not be posted.");
      return;
    }
    setError(null);
    setBody("");
  }

  return (
    <section aria-label="Request thread" data-testid="request-thread" className="space-y-3">
      {visible.length === 0 ? (
        <p className="text-xs text-[var(--muted)]" data-testid="request-thread-empty">
          No messages yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((message) => (
            <li
              key={message.id}
              data-testid={`request-message-${message.id}`}
              className={`rounded-[var(--radius-sm)] border px-3 py-2 ${
                message.visibility === "internal"
                  ? "border-dashed border-[var(--border-light)] bg-[var(--surface-2)]"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex min-h-5 items-center rounded-full bg-[var(--cvp-blue-tint)] px-2 text-[10px] font-bold text-[var(--accent)]">
                  {message.author_name}
                </span>
                <span className="text-[10px] font-bold uppercase text-[var(--dim)]">
                  {message.author_role === "team" ? "Team" : "Client"}
                </span>
                {message.visibility === "internal" ? (
                  <span
                    data-testid="internal-note-badge"
                    className="inline-flex min-h-5 items-center gap-1 rounded-full bg-[var(--red-dim)] px-2 text-[10px] font-bold uppercase text-[var(--red)]"
                  >
                    <Lock size={10} aria-hidden="true" />
                    Internal note
                  </span>
                ) : null}
                <span className="text-[10px] text-[var(--dim)]">
                  {formatTimestamp(message.created_at)}
                </span>
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--ink)]">{message.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handlePost} className="space-y-2">
        {audience === "team" ? (
          <fieldset>
            <legend className="text-[10px] font-bold uppercase text-[var(--muted)]">
              Channel
            </legend>
            <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Message channel">
              {(
                [
                  ["client", "Client-visible"],
                  ["internal", "Internal note"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={visibility === value}
                  data-testid={`visibility-${value}`}
                  onClick={() => setVisibility(value)}
                  className={`min-h-11 rounded-[var(--radius-sm)] border px-3 text-xs font-bold ${
                    visibility === value
                      ? value === "internal"
                        ? "border-[var(--red)] bg-[var(--red-dim)] text-[var(--red)]"
                        : "border-[var(--accent)] bg-[var(--cvp-blue-tint)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <label className="block text-[10px] font-bold uppercase text-[var(--muted)]">
          {audience === "team" && visibility === "internal"
            ? "Internal note (team only)"
            : "Message"}
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={2}
            data-testid="request-composer"
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs normal-case text-[var(--ink)]"
          />
        </label>

        {error ? (
          <p role="alert" className="text-xs font-bold text-[var(--red)]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          data-testid="request-post"
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-hover)]"
        >
          <Send size={13} aria-hidden="true" />
          {audience === "team" && visibility === "internal" ? "Post internal note" : "Post message"}
        </button>
      </form>
    </section>
  );
}
