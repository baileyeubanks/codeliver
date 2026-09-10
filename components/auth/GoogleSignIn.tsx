"use client";

import { useEffect, useState } from "react";
import { resolveReviewAuthReturn } from "@/lib/auth/review-return";
import { authStyles as styles } from "./AuthShell";

export default function GoogleSignIn({ next }: { next: string | null }) {
  const reviewTarget = resolveReviewAuthReturn(next);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!reviewTarget) return;
    const controller = new AbortController();
    void fetch("/api/auth/google", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!controller.signal.aborted) setEnabled(data?.enabled === true); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [reviewTarget]);

  async function signIn() {
    if (busy || !reviewTarget) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next: reviewTarget }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error("unavailable");
      const destination = new URL(data.url);
      if (destination.protocol !== "https:") throw new Error("invalid destination");
      window.location.assign(destination.href);
    } catch {
      setError("Google sign-in is unavailable right now. You can still use your review link or sign in below.");
      setBusy(false);
    }
  }

  if (!enabled || !reviewTarget) return null;
  return (
    <div>
      <button type="button" className={styles.secondaryAction} disabled={busy} onClick={() => void signIn()}>
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error ? <p className={styles.alert} role="alert">{error}</p> : null}
    </div>
  );
}
