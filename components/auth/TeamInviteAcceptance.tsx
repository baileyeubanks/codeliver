"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogIn, UserPlus, X } from "lucide-react";
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
  | {
      kind: "complete";
      action: "accepted" | "declined";
      reauthenticationRequired: boolean;
    };

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

    const reauthenticationRequired = body.reauthentication_required === true;
    setState({
      kind: "complete",
      action: action === "accept" ? "accepted" : "declined",
      reauthenticationRequired,
    });
    setSubmitting(null);
    if (action === "accept") {
      window.setTimeout(() => {
        router.replace(
          reauthenticationRequired
            ? "/login?next=%2Fprojects"
            : "/projects",
        );
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
          <div className={styles.heading} aria-live="polite">
            <h1 id="invite-title">Opening invitation</h1>
            <p>Confirming your Content Co-op workspace access.</p>
            <LoaderCircle size={20} aria-hidden="true" />
          </div>
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
                className={styles.backLink}
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
            </header>
            <div className={styles.alert} role="alert">
              {state.message}
            </div>
            <footer className={styles.footer}>
              <Link href="/login">Return to sign in</Link>
            </footer>
          </>
        ) : null}

        {state.kind === "complete" ? (
          <header className={styles.heading} aria-live="polite">
            <h1 id="invite-title">
              Invitation {state.action === "accepted" ? "accepted" : "declined"}
            </h1>
            <p>
              {state.action === "accepted"
                ? state.reauthenticationRequired
                  ? "Sign in once more to open your projects."
                  : "Opening your projects now."
                : "No team access was added."}
            </p>
          </header>
        ) : null}
      </section>
    </AuthShell>
  );
}
