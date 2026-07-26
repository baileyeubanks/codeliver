"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LogIn, ShieldCheck } from "lucide-react";
import AuthShell, { authStyles as styles } from "@/components/auth/AuthShell";
import {
  authFailureMessage,
  buildAuthPageHref,
  normalizeAuthEmail,
  resolveSafeReturnPath,
  resolveSurfaceMismatchNotice,
  type SurfaceMismatchNotice,
  withDemoMode,
} from "@/components/auth/auth-policy";
import useAuthReturnTarget from "@/components/auth/useAuthReturnTarget";
import { isDemoSessionAllowed, useDemoMode } from "@/lib/demo/mode";
import { signInDemoSession } from "@/lib/demo/workspace-store";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [surfaceMismatch, setSurfaceMismatch] = useState<SurfaceMismatchNotice | null>(null);
  const [notice, setNotice] = useState("");
  const [linkError, setLinkError] = useState("");
  const alertRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const demoMode = useDemoMode();
  const returnTarget = useAuthReturnTarget();
  const requestedPath = resolveSafeReturnPath(returnTarget, "/projects");
  const loginHref = buildAuthPageHref("/login", returnTarget, demoMode);
  const signupHref = buildAuthPageHref("/signup", returnTarget, demoMode);
  const forgotPasswordHref = buildAuthPageHref("/forgot-password", returnTarget, demoMode);

  useEffect(() => {
    function syncSurfaceMismatch() {
      const search = window.location.search;
      const params = new URLSearchParams(search);
      setSurfaceMismatch(resolveSurfaceMismatchNotice(search));
      if (params.get("status") === "password_updated") {
        setNotice("Password updated. Sign in with your new password.");
        setLinkError("");
      } else if (params.has("auth_error")) {
        setNotice("");
        setLinkError("That account link is invalid or has expired. Request a new one and try again.");
      } else {
        setNotice("");
        setLinkError("");
      }
    }

    syncSurfaceMismatch();
    window.addEventListener("popstate", syncSurfaceMismatch);
    return () => window.removeEventListener("popstate", syncSurfaceMismatch);
  }, []);

  function showError(message: string) {
    setError(message);
    setLoading(false);
    // Never keep a rejected password on screen.
    const passwordInput = document.getElementById("login-password");
    if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
    window.requestAnimationFrame(() => alertRef.current?.focus());
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const normalizedEmail = normalizeAuthEmail(String(formData.get("email") ?? ""));

    if (isDemoSessionAllowed(demoMode)) {
      signInDemoSession(normalizedEmail);
      router.replace(withDemoMode(requestedPath, true));
      return;
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password: formData.get("password"),
          next: requestedPath,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        destination?: unknown;
        required_surface?: unknown;
      } | null;
      if (
        response.status === 403 &&
        (payload?.required_surface === "admin" || payload?.required_surface === "client")
      ) {
        const params = new URLSearchParams({
          access: "surface_mismatch",
          required_surface: payload.required_surface,
          next: requestedPath,
        });
        router.replace(`/login?${params.toString()}`);
        setLoading(false);
        return;
      }
      if (!response.ok) {
        showError(authFailureMessage(response.status));
        return;
      }
      const destination = typeof payload?.destination === "string"
        ? payload.destination
        : requestedPath;
      const safeDestination =
        destination === "/onboarding" || destination.startsWith("/onboarding?")
          ? destination
          : resolveSafeReturnPath(destination, requestedPath);
      router.replace(safeDestination);
      router.refresh();
    } catch {
      showError("Authentication is temporarily unavailable.");
    }
  }

  return (
    <AuthShell demoMode={demoMode} loginHref={loginHref}>
      <section className={styles.panel} aria-labelledby="login-title">
        <div className={styles.contextRow}>
          <span className={styles.contextLabel}>
            <ShieldCheck size={13} aria-hidden="true" /> Account access
          </span>
          {demoMode ? <span className={styles.demoLabel}>Demo</span> : null}
        </div>

        <header className={styles.heading}>
          <h1 id="login-title">Sign in to Co‑ProVideo</h1>
          <p>Review and approve work with Content Co-op.</p>
        </header>

        {surfaceMismatch && !demoMode ? (
          <div className={styles.alert} role="alert">
            This account uses the {surfaceMismatch.portalLabel}. Its session on this portal was
            cleared.{" "}
            <a className={styles.backLink} href={surfaceMismatch.portalHref}>
              Sign in to the {surfaceMismatch.portalLabel}
            </a>
          </div>
        ) : null}

        {notice && !surfaceMismatch && !demoMode ? (
          <div className={styles.notice} role="status" aria-live="polite">
            {notice}
          </div>
        ) : null}

        {linkError && !surfaceMismatch && !demoMode ? (
          <div className={styles.alert} role="alert">
            {linkError}
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

        <form
          id="auth-form"
          className={styles.form}
          onSubmit={handleLogin}
          aria-busy={loading}
        >
          <label className={styles.field} htmlFor="login-email">
            <span>Email</span>
            <input
              className={styles.input}
              id="login-email"
              name="email"
              type="email"
              required={!demoMode}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              onChange={() => {
                if (error) setError("");
              }}
            />
          </label>

          <div className={styles.field}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor="login-password">Password</label>
              {!demoMode ? <Link href={forgotPasswordHref}>Forgot password?</Link> : null}
            </div>
            <div className={styles.passwordField}>
              <input
                className={styles.input}
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                required={!demoMode}
                autoComplete="current-password"
                onChange={() => {
                  if (error) setError("");
                }}
              />
              <button
                className={styles.iconButton}
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-controls="login-password"
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? <LoaderCircle size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
            {loading ? "Signing in..." : demoMode ? "Open local workspace" : "Sign in"}
          </button>
        </form>

        <footer className={styles.footer}>
          <span>New to Co‑ProVideo?</span>
          <Link href={signupHref}>Create an account</Link>
        </footer>
      </section>
    </AuthShell>
  );
}
