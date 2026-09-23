import Link from "next/link";
import AuthShell, { authStyles as auth } from "@/components/auth/AuthShell";
import styles from "./welcome.module.css";

/**
 * Public product door. Same quiet auth column and sapphire brand rail as sign-in.
 */
export default function WelcomePage() {
  return (
    <AuthShell demoMode={false} loginHref="/login">
      <section
        className={auth.panel}
        id="welcome-content"
        tabIndex={-1}
        aria-labelledby="welcome-title"
      >
        <header className={auth.heading}>
          <h1 id="welcome-title">A clear workspace for video production.</h1>
          <p>
            Keep projects, review, and delivery connected from the first brief to the final handoff.
          </p>
        </header>
        <div className={styles.actions}>
          <Link href="/login" className={auth.submit}>
            Sign in
          </Link>
          <Link href="/signup" className={auth.secondaryAction}>
            Request access
          </Link>
        </div>
      </section>
    </AuthShell>
  );
}
