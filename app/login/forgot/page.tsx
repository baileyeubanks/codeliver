"use client";

import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import AuthShell, { authStyles as styles } from "@/components/auth/AuthShell";
import { useDemoMode } from "@/lib/demo/mode";
import loginStyles from "../login.module.css";

const SUPPORT_EMAIL = "hello@contentco-op.com";

export default function ForgotPasswordPage() {
  const demoMode = useDemoMode();
  const loginHref = demoMode ? "/login?demo=1" : "/login";

  return (
    <AuthShell demoMode={demoMode} loginHref={loginHref}>
      <section className={styles.panel} aria-labelledby="forgot-title">
        <Link className={styles.backLink} href={loginHref}>
          <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
        </Link>

        <header className={styles.heading}>
          <h1 id="forgot-title">Reset your password</h1>
          <p>We&rsquo;ll get you back into your workspace.</p>
        </header>

        <div className={loginStyles.recoveryBody}>
          {demoMode ? (
            <p>
              This is the local demo workspace. Demo sessions stay in this browser and have no
              password to reset &mdash; return to sign in and open the workspace directly.
            </p>
          ) : (
            <>
              <p>
                Self-service password reset isn&rsquo;t available on this workspace yet. Your
                Content Co-op producer can send you a fresh invite link, usually within one
                business day.
              </p>
              <p>
                Email us from the address on your account and include the project you&rsquo;re
                reviewing so we can verify it quickly.
              </p>
              <a
                className={loginStyles.recoveryAction}
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  "Co-VideoPro password help",
                )}`}
              >
                <Mail size={16} aria-hidden="true" />
                Email {SUPPORT_EMAIL}
              </a>
            </>
          )}
        </div>

        <footer className={styles.footer}>
          <span>Remembered it?</span>
          <Link href={loginHref}>Sign in to Co-VideoPro</Link>
        </footer>
      </section>
    </AuthShell>
  );
}
