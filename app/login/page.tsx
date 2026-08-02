"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LogIn, ShieldCheck } from "lucide-react";
import AuthShell, { authStyles as styles } from "@/components/auth/AuthShell";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import {
  authFailureMessage,
  buildAuthPageHref,
  normalizeAuthEmail,
  resolveAuthStatusNotice,
  resolveSafeReturnPath,
  resolveSurfaceMismatchNotice,
  type AuthStatusNotice,
  type SurfaceMismatchNotice,
  withDemoMode,
} from "@/components/auth/auth-policy";
import useAuthReturnTarget from "@/components/auth/useAuthReturnTarget";
import { useDemoMode } from "@/lib/demo/mode";
import { signInDemoSession, useDemoWorkspace } from "@/lib/demo/workspace-store";

interface LoginResponseBody {
  code?: string;
  requiredSurface?: "admin" | "client";
}

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [surfaceMismatch, setSurfaceMismatch] = useState<SurfaceMismatchNotice | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatusNotice | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const demoMode = useDemoMode();
  const demoWorkspace = useDemoWorkspace();
  const returnTarget = useAuthReturnTarget();
  const requestedPath = resolveSafeReturnPath(returnTarget, "/projects");
  const loginHref = buildAuthPageHref("/login", returnTarget, demoMode);
  const signupHref = buildAuthPageHref("/signup", returnTarget, demoMode);

  useEffect(() => {
    function syncAuthNotices() {
      setSurfaceMismatch(resolveSurfaceMismatchNotice(window.location.search));
      setAuthStatus(resolveAuthStatusNotice(window.location.search));
    }

    syncAuthNotices();
    window.addEventListener("popstate", syncAuthNotices);
    return () => window.removeEventListener("popstate", syncAuthNotices);
  }, []);

  function showError(message: string) {
    setAuthStatus(null);
    setError(message);
    setLoading(false);
    window.requestAnimationFrame(() => alertRef.current?.focus());
  }

  function showSurfaceMismatch(requiredSurface: "admin" | "client") {
    const params = new URLSearchParams();
    params.set("access", "surface_mismatch");
    params.set("required_surface", requiredSurface);
    params.set("next", requestedPath);
    const search = `?${params.toString()}`;
    window.history.replaceState(window.history.state, "", `/login${search}`);
    setSurfaceMismatch(resolveSurfaceMismatchNotice(search));
    setAuthStatus(null);
    setLoading(false);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError("");
    setAuthStatus(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const normalizedEmail = normalizeAuthEmail(String(formData.get("email") ?? ""));

    if (demoMode) {
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
      if (!response.ok) {
        const body = await response.json().catch(() => null) as LoginResponseBody | null;
        if (
          response.status === 409 &&
          body?.code === "AUTH_SURFACE_MISMATCH" &&
          (body.requiredSurface === "admin" || body.requiredSurface === "client")
        ) {
          showSurfaceMismatch(body.requiredSurface);
          return;
        }
        if (body?.code === "AUTH_ACCESS_PENDING") {
          showError("Account access is pending approval.");
          return;
        }
        showError(authFailureMessage(response.status));
        return;
      }
      router.replace(requestedPath);
      router.refresh();
    } catch {
      showError("Authentication is temporarily unavailable.");
    }
  }

  return (
    <AuthShell demoMode={demoMode} loginHref={loginHref}>
      <section className={styles.panel} aria-labelledby="login-title">
        <CoProductionBrand
          className={styles.panelBrand}
          variant="stacked"
          sizes="(max-width: 520px) 188px, 212px"
          priority
        />

        <div className={styles.contextRow}>
          <span className={styles.contextLabel}>
            <ShieldCheck size={13} aria-hidden="true" /> Account access
          </span>
          {demoMode ? <span className={styles.demoLabel}>Demo</span> : null}
        </div>

        <header className={styles.heading}>
          <h1 id="login-title">Sign in to Co-VideoPro</h1>
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

        {authStatus && !demoMode ? (
          <div
            className={styles.alert}
            role={authStatus.kind === "error" ? "alert" : "status"}
            aria-live={authStatus.kind === "error" ? "assertive" : "polite"}
          >
            {authStatus.message}
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
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              key={demoMode ? demoWorkspace.session.email : "managed-email"}
              defaultValue={demoMode ? demoWorkspace.session.email : undefined}
              onChange={() => {
                if (error) setError("");
              }}
            />
          </label>

          <div className={styles.field}>
            <label htmlFor="login-password">Password</label>
            <div className={styles.passwordField}>
              <input
                className={styles.input}
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                defaultValue={demoMode ? "demo" : undefined}
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
          <span>New to Co-VideoPro?</span>
          <Link href={signupHref}>Create an account</Link>
        </footer>
      </section>
    </AuthShell>
  );
}
