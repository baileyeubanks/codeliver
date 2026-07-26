"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, LoaderCircle, UserPlus } from "lucide-react";
import AuthShell, { authStyles as styles } from "@/components/auth/AuthShell";
import {
  AUTH_PASSWORD_MIN_LENGTH,
  buildAuthPageHref,
  validateSignupCredentials,
  type SignupValidationField,
} from "@/components/auth/auth-policy";
import useAuthReturnTarget from "@/components/auth/useAuthReturnTarget";
import { useDemoMode } from "@/lib/demo/mode";
import { registerDemoAccount } from "@/lib/demo/workspace-store";

export default function SignupPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [invalidField, setInvalidField] = useState<SignupValidationField | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const demoMode = useDemoMode();
  const router = useRouter();
  const returnTarget = useAuthReturnTarget();
  const loginHref = buildAuthPageHref("/login", returnTarget, demoMode);

  useEffect(() => {
    if (success) successHeadingRef.current?.focus();
  }, [success]);

  function clearFieldError(field: SignupValidationField) {
    if (invalidField !== field) return;
    setInvalidField(null);
    setError("");
  }

  function showError(message: string, field: SignupValidationField | null = null) {
    setError(message);
    setInvalidField(field);
    setLoading(false);
    window.requestAnimationFrame(() => {
      if (field) {
        document.getElementById(`signup-${field === "confirmation" ? "confirm-password" : field}`)?.focus();
        return;
      }
      alertRef.current?.focus();
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError("");
    setInvalidField(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const validation = validateSignupCredentials({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmation: String(formData.get("confirm_password") ?? ""),
    });

    if (validation.error) {
      showError(validation.error, validation.field);
      return;
    }

    if (demoMode) {
      registerDemoAccount(
        validation.email,
        String(formData.get("display_name") ?? ""),
      );
      setSuccess(true);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: validation.email,
          password: formData.get("password"),
          display_name: formData.get("display_name"),
          next: returnTarget,
        }),
      });
      if (!response.ok) {
        showError(
          response.status === 503
            ? "Account service is temporarily unavailable — the sign-in backend cannot be reached from this environment."
            : "Account creation could not be completed.",
        );
        return;
      }
      const payload = await response.json().catch(() => null) as {
        confirmation_required?: unknown;
        destination?: unknown;
      } | null;
      if (
        payload?.confirmation_required === false &&
        typeof payload.destination === "string" &&
        (payload.destination === "/onboarding" || payload.destination.startsWith("/onboarding?"))
      ) {
        router.replace(payload.destination);
        router.refresh();
        return;
      }
      setSubmittedEmail(validation.email);
      setSuccess(true);
      setLoading(false);
    } catch {
      showError("Account creation is temporarily unavailable.");
    }
  }

  async function resendConfirmation() {
    if (!submittedEmail || resending) return;
    setResending(true);
    setResendMessage("");
    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: submittedEmail, next: returnTarget }),
      });
      setResendMessage(
        response.ok
          ? "If confirmation is still required, a new email is on its way."
          : "Confirmation email could not be sent right now.",
      );
    } catch {
      setResendMessage("Confirmation email could not be sent right now.");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell demoMode={demoMode} loginHref={loginHref}>
      <section className={styles.panel} aria-labelledby="signup-title">
        {success ? (
          <div className={styles.success} role="status" aria-live="polite">
            <span className={styles.successIcon}>
              <CheckCircle2 size={25} aria-hidden="true" />
            </span>
            <p className={styles.successKicker}>
              {demoMode ? "Local account ready" : "One more step"}
            </p>
            <h1 id="signup-title" ref={successHeadingRef} tabIndex={-1}>
              {demoMode ? "Your workspace is ready" : "Verify your account"}
            </h1>
            <p className={styles.successCopy}>
              {demoMode
                ? "Sign in with the local demo identity to continue."
                : `We sent a confirmation link to ${submittedEmail}. Open it to verify your email and continue onboarding.`}
            </p>
            {!demoMode ? (
              <>
                <button
                  className={styles.secondaryAction}
                  type="button"
                  disabled={resending}
                  onClick={() => void resendConfirmation()}
                >
                  {resending ? <LoaderCircle size={16} aria-hidden="true" /> : null}
                  {resending ? "Sending..." : "Resend confirmation email"}
                </button>
                {resendMessage ? (
                  <p className={styles.inlineStatus} role="status" aria-live="polite">
                    {resendMessage}
                  </p>
                ) : null}
              </>
            ) : null}
            <Link className={styles.submit} href={loginHref}>
              Sign in to Co‑ProVideo
            </Link>
          </div>
        ) : (
          <>
            <Link className={styles.backLink} href={loginHref}>
              <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
            </Link>

            <header className={styles.heading}>
              <h1 id="signup-title">Create your account</h1>
              <p>Use one identity for comments, approvals, and delivery activity.</p>
            </header>

            {error ? (
              <div
                id="signup-error"
                ref={alertRef}
                className={styles.alert}
                role="alert"
                aria-live="assertive"
                tabIndex={-1}
              >
                {error}
              </div>
            ) : null}

            <form
              id="auth-form"
              className={`${styles.form} ${styles.formSignup}`}
              onSubmit={handleSubmit}
              aria-busy={loading}
            >
              <label className={`${styles.field} ${styles.spanTwo}`} htmlFor="signup-display-name">
                <span>Name</span>
                <input
                  className={styles.input}
                  id="signup-display-name"
                  name="display_name"
                  type="text"
                  placeholder="Your name"
                  autoComplete="name"
                  required
                  maxLength={120}
                />
              </label>

              <label className={`${styles.field} ${styles.spanTwo}`} htmlFor="signup-email">
                <span>Email</span>
                <input
                  className={styles.input}
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={invalidField === "email"}
                  aria-describedby={invalidField === "email" ? "signup-error" : undefined}
                  onChange={() => clearFieldError("email")}
                />
              </label>

              <div className={styles.field}>
                <label htmlFor="signup-password">Password</label>
                <div className={styles.passwordField}>
                  <input
                    className={styles.input}
                    id="signup-password"
                    name="password"
                    type={showPasswords ? "text" : "password"}
                    required
                    minLength={AUTH_PASSWORD_MIN_LENGTH}
                    autoComplete="new-password"
                    aria-invalid={invalidField === "password"}
                    aria-describedby={
                      invalidField === "password"
                        ? "signup-password-hint signup-error"
                        : "signup-password-hint"
                    }
                    onChange={() => clearFieldError("password")}
                  />
                  <button
                    className={styles.iconButton}
                    type="button"
                    onClick={() => setShowPasswords((visible) => !visible)}
                    aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                    aria-controls="signup-password signup-confirm-password"
                    aria-pressed={showPasswords}
                    title={showPasswords ? "Hide passwords" : "Show passwords"}
                  >
                    {showPasswords ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                  </button>
                </div>
                <p className={styles.passwordHint} id="signup-password-hint">
                  At least {AUTH_PASSWORD_MIN_LENGTH} characters
                </p>
              </div>

              <label className={styles.field} htmlFor="signup-confirm-password">
                <span>Confirm password</span>
                <input
                  className={styles.input}
                  id="signup-confirm-password"
                  name="confirm_password"
                  type={showPasswords ? "text" : "password"}
                  required
                  minLength={AUTH_PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  aria-invalid={invalidField === "confirmation"}
                  aria-describedby={invalidField === "confirmation" ? "signup-error" : undefined}
                  onChange={() => clearFieldError("confirmation")}
                />
              </label>

              <button className={styles.submit} type="submit" disabled={loading}>
                {loading ? <LoaderCircle size={17} aria-hidden="true" /> : <UserPlus size={17} aria-hidden="true" />}
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>
          </>
        )}
      </section>
    </AuthShell>
  );
}
