"use client";

import { Clock } from "lucide-react";

/**
 * Share links 2.0 (P22) — truthful expired-link page.
 *
 * Expired links are dead at the expiry instant; there is no grace period and
 * this page never pretends otherwise.
 */

interface ShareLinkExpiredProps {
  shareName?: string;
  /** ISO instant the link expired at, when known. */
  expiresAt?: string | null;
}

function formatExpiry(expiresAt?: string | null): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function ShareLinkExpired({ shareName, expiresAt }: ShareLinkExpiredProps) {
  const expiredOn = formatExpiry(expiresAt);

  return (
    <div
      data-testid="share-link-expired"
      className="flex min-h-[60vh] items-center justify-center bg-white px-6 py-16"
    >
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--line,#e3e7ee)] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--ink-secondary,#3f4962)]">
          <Clock size={18} aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-[var(--ink,#18223e)]">
          This review link has expired
        </h1>
        {shareName?.trim() ? (
          <p className="mt-1 text-sm font-medium text-[var(--ink-secondary,#3f4962)]">
            {shareName.trim()}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-[var(--ink-secondary,#3f4962)]">
          {expiredOn
            ? `This link stopped working on ${expiredOn}. Expired links do not reopen — ask the sender for a new one.`
            : "Expired links do not reopen — ask the sender for a new one."}
        </p>
      </div>
    </div>
  );
}
