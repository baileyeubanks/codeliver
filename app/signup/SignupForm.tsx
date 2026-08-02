"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, LoaderCircle, ShieldCheck, UserPlus } from "lucide-react";
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

export default function SignupForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [invalidField, setInvalidField] = useState<SignupValidationField | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const demoMode = useDemoMode();
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
        }),
      });
      if (!response.ok) {
        if (response.status === 503) {
          // Keep the deployment detail in telemetry, never on the client's screen.
          console.warn("[signup] account service returned 503");
        }
        showError(
          response.status === 503
            ? "Account creation is temporarily unavailable. Please try again in a few minutes."
            : "Account creation could not be completed.",
        );
        return;
      }
      setSuccess(true);
      setLoading(false);
    } catch {
      showError("Account creation is temporarily unavailable.");
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
              {demoMode ? "Local account ready" : "Account request received"}
            </p>
            <h1 id="signup-title" ref={successHeadingRef} tabIndex={-1}>
              {demoMode ? "Your workspace is ready" : "Verify your account"}
            </h1>
            <p className={styles.successCopy}>
              {demoMode
                ? "Sign in with the local demo identity to continue."
                : "Check your email for a verification link, then sign in."}
            </p>
            <Link className={styles.submit} href={loginHref}>
              Sign in to Co-VideoPro
            </Link>
          </div>
        ) : (
          <>
            <Link className={styles.backLink} href={loginHref}>
              <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
            </Link>

            <div className={styles.contextRow}>
              <span className={styles.contextLabel}>
                <ShieldCheck size={13} aria-hidden="true" /> Account access
              </span>
              {demoMode ? <span className={styles.demoLabel}>Demo</span> : null}
            </div>

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

              <div className={styles.field}>
                <label htmlFor="signup-confirm-password">Confirm password</label>
                <div className={styles.passwordField}>
                  <input
                    className={styles.input}
                    id="signup-confirm-password"
                    name="confirm_password"
                    type={showPasswords ? "text" : "password"}
                    required
                    minLength={AUTH_PASSWORD_MIN_LENGTH}
                    autoComplete="new-password"
                    aria-invalid={invalidField === "confirmation"}
                    aria-describedby={
                      invalidField === "confirmation"
                        ? "signup-confirm-hint signup-error"
                        : "signup-confirm-hint"
                    }
                    onChange={() => clearFieldError("confirmation")}
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
                <p className={styles.passwordHint} id="signup-confirm-hint">
                  Must match the password above
                </p>
              </div>

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
