"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./AuthShell.module.css";
import useAuthHostContext from "./useAuthHostContext";
import CoProductionBrand from "@/components/brand/CoProductionBrand";

interface AuthShellProps {
  children: ReactNode;
  demoMode: boolean;
  loginHref?: string;
}

export { styles as authStyles };

export default function AuthShell({ children, demoMode, loginHref }: AuthShellProps) {
  const hostContext = useAuthHostContext();

  return (
    <main
      className={styles.shell}
      data-demo={demoMode ? "true" : "false"}
      data-host-context={hostContext.kind}
    >
      <a className={styles.skipLink} href="#auth-content">
        Skip to account access
      </a>

      <div className={styles.stage}>
        <section className={styles.authColumn} aria-label="Account access">
          <div className={styles.authPane}>
            <Link
              className={styles.brand}
              href={loginHref ?? (demoMode ? "/login?demo=1" : "/login")}
              aria-label="Co‑VideoPro by Content Co-op sign in"
            >
              <CoProductionBrand
                variant="compact-mark"
                className={styles.brandLockup}
                label="Co‑VideoPro"
                priority
              />
              <span className={styles.brandWord}>Co‑VideoPro</span>
            </Link>

            <div className={styles.formColumn} id="auth-content" tabIndex={-1}>
              {children}
            </div>
          </div>
        </section>

        <aside className={styles.brandRail} aria-label="Co‑VideoPro">
          <div className={styles.brandStory}>
            <strong>Co‑VideoPro</strong>
            <p>The version, the comment, and the decision stay on the cut.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
