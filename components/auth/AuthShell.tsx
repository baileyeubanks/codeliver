"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Building2,
  Handshake,
  LockKeyhole,
  PanelsTopLeft,
  ShieldCheck,
} from "lucide-react";
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
  const ContextIcon = demoMode
    ? LockKeyhole
    : hostContext.kind === "admin"
      ? Building2
      : hostContext.kind === "client"
        ? Handshake
        : PanelsTopLeft;
  const accessReadiness = [
    {
      label: "REVIEW",
      value: "Approve the cut in one place",
      icon: PanelsTopLeft,
    },
    {
      label: "HANDOFF",
      value: "Brief to delivery, same room",
      icon: Handshake,
    },
    {
      label: "SECURE",
      value: "Sign-in required · stays on this site",
      icon: ShieldCheck,
    },
  ];

  return (
    <main
      className={styles.shell}
      data-demo={demoMode ? "true" : "false"}
      data-host-context={hostContext.kind}
    >
      <a className={styles.skipLink} href="#auth-content">
        Skip to account access
      </a>

      <header className={styles.header}>
        <Link
          className={styles.brand}
          href={loginHref ?? (demoMode ? "/login?demo=1" : "/login")}
          aria-label="Co‑VideoPro by Content Co-op sign in"
        >
          <CoProductionBrand className={styles.brandLockup} priority />
        </Link>

        <div className={styles.product}>
          <span>Video production workspace</span>
          <strong>Co‑VideoPro</strong>
        </div>

        <div className={styles.securityStatus}>
          <ContextIcon size={15} aria-hidden="true" />
          <span>Content Co-op clients</span>
        </div>
      </header>

      <section className={styles.workspace} aria-label="Workspace access">
        <div className={styles.formColumn} id="auth-content" tabIndex={-1}>
          <div className={styles.brandHero}>
            <CoProductionBrand variant="compact-mark" label="Co‑VideoPro" priority />
            <p className={styles.tagline}>
              Brief
              <span className={styles.taglineDot} aria-hidden="true"> → </span>
              cut
              <span className={styles.taglineDot} aria-hidden="true"> → </span>
              review
              <span className={styles.taglineDot} aria-hidden="true"> → </span>
              handoff
            </p>
          </div>
          {children}
          <section className={styles.accessStrip} aria-label="Access readiness">
            {accessReadiness.map((item) => {
              const Icon = item.icon;
              return (
                <div className={styles.accessItem} key={item.label}>
                  <span className={styles.accessIcon} aria-hidden="true">
                    <Icon size={15} />
                  </span>
                  <span className={styles.accessCopy}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </span>
                </div>
              );
            })}
          </section>
          <p className={styles.assurance}>
            <ShieldCheck size={14} aria-hidden="true" />
            Private workspace · Content Co-op clients
          </p>
        </div>
      </section>
    </main>
  );
}
