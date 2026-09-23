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
        Skip to sign in
      </a>

      <div className={styles.column}>
        <Link
          className={styles.brand}
          href={loginHref ?? (demoMode ? "/login?demo=1" : "/login")}
          aria-label="Co‑VideoPro by Content Co-op sign in"
        >
          <CoProductionBrand className={styles.brandLockup} priority />
        </Link>

        <div className={styles.formColumn} id="auth-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </main>
  );
}
