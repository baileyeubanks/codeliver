"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import AuthShell, { authStyles as styles } from "@/components/auth/AuthShell";
import {
  buildAuthPageHref,
  normalizeAuthEmail,
} from "@/components/auth/auth-policy";
import useAuthReturnTarget from "@/components/auth/useAuthReturnTarget";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const returnTarget = useAuthReturnTarget();
  const loginHref = buildAuthPageHref("/login", returnTarget, false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeAuthEmail(email) }),
      });
      if (!response.ok) {
        setError(
          response.status >= 500
            ? "Password recovery is temporarily unavailable."
            : "Enter a valid email address.",
        );
        window.requestAnimationFrame(() => alertRef.current?.focus());
        return;
      }
      setSent(true);
    } catch {
      setError("Password recovery is temporarily unavailable.");
      window.requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell demoMode={false} loginHref={loginHref}>
      <section className={styles.panel} aria-labelledby="forgot-password-title">
        {sent ? (
          <div className={styles.success} role="status" aria-live="polite">
            <span className={styles.successIcon}>
              <CheckCircle2 size={25} aria-hidden="true" />
            </span>
            <p className={styles.successKicker}>Check your inbox</p>
            <h1 id="forgot-password-title">Recovery email requested</h1>
            <p className={styles.successCopy}>
              If an account exists for {normalizeAuthEmail(email)}, a password-reset link is on
              its way. The message can take a few minutes to arrive.
            </p>
            <Link className={styles.submit} href={loginHref}>
              Return to sign in
            </Link>
          </div>
        ) : (
          <>
            <Link className={styles.backLink} href={loginHref}>
              <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
            </Link>
            <header className={styles.heading}>
              <h1 id="forgot-password-title">Reset your password</h1>
              <p>Enter your account email and we’ll send a secure recovery link.</p>
            </header>

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

            <form className={styles.form} onSubmit={handleSubmit} aria-busy={loading}>
              <label className={styles.field} htmlFor="recovery-email">
                <span>Email</span>
                <input
                  className={styles.input}
                  id="recovery-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setError("");
                  }}
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  autoFocus
                />
              </label>
              <button className={styles.submit} type="submit" disabled={loading}>
                {loading ? <LoaderCircle size={17} aria-hidden="true" /> : <KeyRound size={17} aria-hidden="true" />}
                {loading ? "Sending..." : "Send recovery link"}
              </button>
            </form>
          </>
        )}
      </section>
    </AuthShell>
  );
}
