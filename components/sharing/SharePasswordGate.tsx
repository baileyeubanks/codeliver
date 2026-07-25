"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { verifyShareLinkPassword } from "@/lib/sharing/share-link-settings";

/**
 * Share links 2.0 (P22) — password gate for protected review links.
 *
 * Brand-styled gate card (white canvas, navy ink, lime accent) — a real form,
 * never a window.alert. Demo honesty: the fingerprint checked here is
 * demo-grade and lives in this browser's localStorage; this is not
 * production-grade password security.
 */

interface SharePasswordGateProps {
  /** Link name shown in the gate heading. */
  shareName?: string;
  /** Stored demo-grade fingerprint from the link record. */
  passwordHash: string;
  /** Called once with the admitted password after a correct attempt. */
  onUnlock: (password: string) => void;
}

export default function SharePasswordGate({
  shareName,
  passwordHash,
  onUnlock,
}: SharePasswordGateProps) {
  const [attempt, setAttempt] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verifyShareLinkPassword({ has_password: true, password_hash: passwordHash }, attempt)) {
      setError("");
      onUnlock(attempt);
      return;
    }
    setError("Incorrect password — check the link invite and try again.");
  }

  return (
    <div
      data-testid="share-password-gate"
      className="flex min-h-[60vh] items-center justify-center bg-white px-6 py-16"
    >
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--line,#e3e7ee)] border-t-4 border-t-[var(--cvp-accent,#b9ff77)] bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2 text-[var(--ink,#18223e)]">
          <Lock size={16} aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Protected review link
          </p>
        </div>
        <h1 className="mt-3 text-lg font-semibold text-[var(--ink,#18223e)]">
          {shareName?.trim() || "This review is password protected"}
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-secondary,#3f4962)]">
          Enter the password from the sender to open this review.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block text-xs font-medium text-[var(--muted)]" htmlFor="share-gate-password">
            Review password
          </label>
          <input
            id="share-gate-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={attempt}
            onChange={(event) => setAttempt(event.target.value)}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--line,#e3e7ee)] px-3 py-2 text-sm text-[var(--ink,#18223e)] focus:border-[var(--accent)] focus:outline-none"
          />
          {error ? (
            <p role="alert" className="text-xs font-medium text-[#b3261e]">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            Open review
          </button>
        </form>

        <p className="mt-4 text-[11px] leading-relaxed text-[var(--dim)]">
          Demo gate — the password fingerprint is stored in this browser only
          and is not production-grade security.
        </p>
      </div>
    </div>
  );
}
