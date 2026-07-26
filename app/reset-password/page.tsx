"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import AuthShell, { authStyles as styles } from "@/components/auth/AuthShell";
import { AUTH_PASSWORD_MIN_LENGTH } from "@/components/auth/auth-policy";

export default function ResetPasswordPage() {
  const [sessionState, setSessionState] = useState<
    "checking" | "ready" | "invalid" | "unavailable"
  >("checking");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        setSessionState(
          response.ok ? "ready" : response.status === 401 ? "invalid" : "unavailable",
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setSessionState("unavailable");
      });
    return () => controller.abort();
  }, []);

  function showError(message: string) {
    setError(message);
    setLoading(false);
    window.requestAnimationFrame(() => alertRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || sessionState !== "ready") return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirm_password") ?? "");
    if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
      showError(`Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      showError("Passwords do not match.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        showError(
          response.status === 401
            ? "This recovery link is invalid or has expired. Request a new one."
            : response.status >= 500
              ? "Password reset is temporarily unavailable."
              : "Password could not be updated. Request a new recovery link and try again.",
        );
        return;
      }
      router.replace("/login?status=password_updated");
      router.refresh();
    } catch {
      showError("Password reset is temporarily unavailable.");
    }
  }

  return (
    <AuthShell demoMode={false} loginHref="/login">
      <section className={styles.panel} aria-labelledby="reset-password-title">
        <header className={styles.heading}>
          <h1 id="reset-password-title">Choose a new password</h1>
          <p>Use a password you haven’t used for this account before.</p>
        </header>

        {sessionState === "checking" ? (
          <div className={styles.loadingRow} role="status">
            <LoaderCircle className={styles.spinIcon} size={17} aria-hidden="true" />
            Verifying recovery link…
          </div>
        ) : null}

        {sessionState === "invalid" ? (
          <div className={styles.alert} role="alert">
            This recovery link is invalid or has expired.
          </div>
        ) : null}

        {sessionState === "unavailable" ? (
          <div className={styles.alert} role="alert">
            Password recovery is temporarily unavailable. Try again in a moment.
          </div>
        ) : null}

        {error ? (
          <div
            ref={alertRef}
            className={styles.alert}
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
          >
            {error}
          </div>
        ) : null}

        {sessionState === "ready" ? (
          <form className={styles.form} onSubmit={handleSubmit} aria-busy={loading}>
            <div className={styles.field}>
              <label htmlFor="reset-password">New password</label>
              <div className={styles.passwordField}>
                <input
                  className={styles.input}
                  id="reset-password"
                  name="password"
                  type={showPasswords ? "text" : "password"}
                  minLength={AUTH_PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  required
                  autoFocus
                />
                <button
                  className={styles.iconButton}
                  type="button"
                  onClick={() => setShowPasswords((visible) => !visible)}
                  aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                  aria-controls="reset-password reset-confirm-password"
                  aria-pressed={showPasswords}
                >
                  {showPasswords ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
              <p className={styles.passwordHint}>At least {AUTH_PASSWORD_MIN_LENGTH} characters</p>
            </div>
            <label className={styles.field} htmlFor="reset-confirm-password">
              <span>Confirm new password</span>
              <input
                className={styles.input}
                id="reset-confirm-password"
                name="confirm_password"
                type={showPasswords ? "text" : "password"}
                minLength={AUTH_PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                required
              />
            </label>
            <button className={styles.submit} type="submit" disabled={loading}>
              {loading ? <LoaderCircle size={17} aria-hidden="true" /> : <KeyRound size={17} aria-hidden="true" />}
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        ) : (
          <footer className={styles.footer}>
            <Link href="/forgot-password">Request a new recovery link</Link>
          </footer>
        )}
      </section>
    </AuthShell>
  );
}
