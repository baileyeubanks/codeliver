"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock3, LoaderCircle, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import AuthShell, { authStyles as styles } from "@/components/auth/AuthShell";
import { resolveSafeReturnPath } from "@/components/auth/auth-policy";
import useAuthReturnTarget from "@/components/auth/useAuthReturnTarget";
import {
  hostForSurface,
  resolveHostSurface,
  type HostSurface,
} from "@/lib/auth/host-surface";

interface SessionPayload {
  authenticated?: boolean;
  email?: string;
  display_name?: string | null;
  access?: {
    state?: "pending" | "provisioned";
    email_confirmed?: boolean;
    required_surface?: HostSurface | null;
  };
}

export default function OnboardingPage() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const returnTarget = useAuthReturnTarget();
  const router = useRouter();
  const requestedPath = resolveSafeReturnPath(returnTarget, "/projects");

  const loadAccess = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (response.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(requestedPath)}`);
        return;
      }
      if (!response.ok) {
        setError("Account status is temporarily unavailable.");
        return;
      }
      const payload = await response.json() as SessionPayload;
      setSession(payload);
      if (payload.access?.state === "provisioned") {
        const requiredSurface = payload.access.required_surface;
        const currentSurface = resolveHostSurface(window.location.host);
        if (!requiredSurface || currentSurface === requiredSurface) {
          router.replace(requestedPath);
          router.refresh();
        }
      }
    } catch {
      setError("Account status is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [requestedPath, router]);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  const requiredSurface = session?.access?.required_surface;
  const portalHref = requiredSurface
    ? `https://${hostForSurface(requiredSurface)}/login?next=${encodeURIComponent(requestedPath)}`
    : null;

  return (
    <AuthShell demoMode={false} loginHref="/login">
      <section className={styles.panel} aria-labelledby="onboarding-title">
        <div className={styles.contextRow}>
          <span className={styles.contextLabel}>
            <ShieldCheck size={13} aria-hidden="true" /> Account onboarding
          </span>
        </div>
        <header className={styles.heading}>
          <h1 id="onboarding-title">
            {session?.display_name ? `Welcome, ${session.display_name}` : "Your account is ready"}
          </h1>
          <p>
            Your identity is secure. Content Co-op workspace access is approved separately so
            project data never opens from an unverified role.
          </p>
        </header>

        {loading ? (
          <div className={styles.loadingRow} role="status">
            <LoaderCircle className={styles.spinIcon} size={17} aria-hidden="true" />
            Checking account status…
          </div>
        ) : null}

        {error ? <div className={styles.alert} role="alert">{error}</div> : null}

        {session && !loading ? (
          <ol className={styles.onboardingSteps} aria-label="Account setup status">
            <li data-state="complete">
              <span><Check size={16} aria-hidden="true" /></span>
              <div><strong>Account created</strong><small>{session.email}</small></div>
            </li>
            <li data-state={session.access?.email_confirmed ? "complete" : "pending"}>
              <span>{session.access?.email_confirmed ? <Check size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}</span>
              <div><strong>Email verified</strong><small>{session.access?.email_confirmed ? "Confirmation complete" : "Open the confirmation email to continue"}</small></div>
            </li>
            <li data-state={session.access?.state === "provisioned" ? "complete" : "pending"}>
              <span>{session.access?.state === "provisioned" ? <Check size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}</span>
              <div><strong>Workspace access</strong><small>{session.access?.state === "provisioned" ? "Approved" : "Pending Content Co-op approval"}</small></div>
            </li>
          </ol>
        ) : null}

        {portalHref && session?.access?.state === "provisioned" ? (
          <Link className={styles.submit} href={portalHref}>
            Open the {requiredSurface === "admin" ? "team" : "client"} portal
          </Link>
        ) : (
          <button
            className={styles.submit}
            type="button"
            disabled={loading}
            onClick={() => void loadAccess()}
          >
            {loading ? <LoaderCircle size={17} aria-hidden="true" /> : <RefreshCw size={17} aria-hidden="true" />}
            Check access
          </button>
        )}

        <button
          className={styles.secondaryAction}
          type="button"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          {signingOut ? <LoaderCircle size={16} aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </section>
    </AuthShell>
  );
}
