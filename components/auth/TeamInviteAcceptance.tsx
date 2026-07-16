"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  LoaderCircle,
  LogIn,
  Mail,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import AuthShell, { authStyles as styles } from "@/components/auth/AuthShell";

interface InviteSummary {
  id: string;
  email: string;
  role: string;
  expires_at: string | null;
  team: { id: string; name: string };
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; invite: InviteSummary }
  | { kind: "unauthorized" }
  | { kind: "error"; message: string }
  | { kind: "complete"; action: "accepted" | "declined" };

function formatInviteExpiry(value: string | null) {
  if (!value) return "No expiry provided";
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime())) return "Expiry unavailable";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(expiry);
}

export default function TeamInviteAcceptance({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState<"accept" | "decline" | null>(null);
  const router = useRouter();
  const invitePath = useMemo(() => `/invite/${encodeURIComponent(token)}`, [token]);
  const loginHref = `/login?next=${encodeURIComponent(invitePath)}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/teams/invites?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          setState({ kind: "unauthorized" });
          return;
        }
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState({
            kind: "error",
            message:
              typeof body.error === "string"
                ? body.error
                : "This invitation is unavailable.",
          });
          return;
        }
        setState({ kind: "ready", invite: body.invite as InviteSummary });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") {
          setState({ kind: "error", message: "Invitation access is temporarily unavailable." });
        }
      });
    return () => controller.abort();
  }, [token]);

  async function decide(action: "accept" | "decline") {
    if (submitting) return;
    setSubmitting(action);
    const response = await fetch("/api/teams/invites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action }),
    }).catch(() => null);
    if (!response) {
      setState({ kind: "error", message: "Invitation access is temporarily unavailable." });
      setSubmitting(null);
      return;
    }
    if (response.status === 401) {
      setState({ kind: "unauthorized" });
      setSubmitting(null);
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState({
        kind: "error",
        message: typeof body.error === "string" ? body.error : "The invitation could not be updated.",
      });
      setSubmitting(null);
      return;
    }

    setState({ kind: "complete", action: action === "accept" ? "accepted" : "declined" });
    setSubmitting(null);
    if (action === "accept") {
      window.setTimeout(() => {
        router.replace("/projects");
        router.refresh();
      }, 700);
    }
  }

  return (
    <AuthShell demoMode={false} loginHref={loginHref}>
      <section className={styles.panel} aria-labelledby="invite-title">
        <div className={styles.contextRow}>
          <span className={styles.contextLabel}>
            <UserPlus size={13} aria-hidden="true" /> Team access
          </span>
        </div>

        {state.kind === "loading" ? (
          <>
            <div className={styles.heading} aria-live="polite">
              <h1 id="invite-title">Opening invitation</h1>
              <p>Confirming the team, recipient, role, and expiry before access changes.</p>
            </div>
            <div className={styles.loadingRow} role="status">
              <LoaderCircle className={styles.spinIcon} size={18} aria-hidden="true" />
              Verifying team access
            </div>
          </>
        ) : null}

        {state.kind === "unauthorized" ? (
          <>
            <header className={styles.heading}>
              <h1 id="invite-title">Sign in to continue</h1>
              <p>Use the email address that received this invitation.</p>
            </header>
            <Link className={styles.submit} href={loginHref}>
              <LogIn size={17} aria-hidden="true" /> Sign in
            </Link>
          </>
        ) : null}

        {state.kind === "ready" ? (
          <>
            <header className={styles.heading}>
              <h1 id="invite-title">Join {state.invite.team.name}</h1>
              <p>
                Continue as <strong>{state.invite.email}</strong> with the {state.invite.role} role.
              </p>
            </header>
            <section className={styles.accessStrip} aria-label="Invitation readiness">
              <div className={styles.accessItem}>
                <span className={styles.accessIcon} aria-hidden="true">
                  <Users size={15} />
                </span>
                <span className={styles.accessCopy}>
                  <span>Workspace</span>
                  <strong>{state.invite.team.name}</strong>
                </span>
              </div>
              <div className={styles.accessItem}>
                <span className={styles.accessIcon} aria-hidden="true">
                  <ShieldCheck size={15} />
                </span>
                <span className={styles.accessCopy}>
                  <span>Role</span>
                  <strong>{state.invite.role}</strong>
                </span>
              </div>
              <div className={styles.accessItem}>
                <span className={styles.accessIcon} aria-hidden="true">
                  <CalendarClock size={15} />
                </span>
                <span className={styles.accessCopy}>
                  <span>Expires</span>
                  <strong>{formatInviteExpiry(state.invite.expires_at)}</strong>
                </span>
              </div>
            </section>
            <div className={styles.form} aria-busy={Boolean(submitting)}>
              <button
                className={styles.submit}
                type="button"
                disabled={Boolean(submitting)}
                onClick={() => decide("accept")}
              >
                {submitting === "accept" ? (
                  <LoaderCircle size={17} aria-hidden="true" />
                ) : (
                  <UserPlus size={17} aria-hidden="true" />
                )}
                {submitting === "accept" ? "Joining..." : "Accept invitation"}
              </button>
              <button
                className={styles.secondaryAction}
                type="button"
                disabled={Boolean(submitting)}
                onClick={() => decide("decline")}
              >
                <X size={15} aria-hidden="true" />
                {submitting === "decline" ? "Declining..." : "Decline"}
              </button>
            </div>
          </>
        ) : null}

        {state.kind === "error" ? (
          <>
            <header className={styles.heading}>
              <h1 id="invite-title">Invitation unavailable</h1>
              <p>This access change was not applied.</p>
            </header>
            <div className={styles.alert} role="alert">
              <AlertCircle size={14} aria-hidden="true" />
              {state.message}
            </div>
            <footer className={styles.footer}>
              <Link href="/login">Return to sign in</Link>
            </footer>
          </>
        ) : null}

        {state.kind === "complete" ? (
          <>
            <header className={styles.heading} aria-live="polite">
              <h1 id="invite-title">
                Invitation {state.action === "accepted" ? "accepted" : "declined"}
              </h1>
              <p>
                {state.action === "accepted"
                  ? "Opening your projects now."
                  : "No team access was added."}
              </p>
            </header>
            <div className={styles.loadingRow} role="status">
              {state.action === "accepted" ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : (
                <Mail size={18} aria-hidden="true" />
              )}
              {state.action === "accepted" ? "Workspace access confirmed" : "Invitation closed"}
            </div>
          </>
        ) : null}
      </section>
    </AuthShell>
  );
}
