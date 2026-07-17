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
  const contextLabel = demoMode ? "Local demo workspace" : hostContext.label;
  const accessReadiness = [
    {
      label: "Portal",
      value: contextLabel,
      icon: ContextIcon,
    },
    {
      label: "Session",
      value: demoMode ? "Local browser only" : "Verified session required",
      icon: ShieldCheck,
    },
    {
      label: "Return",
      value: "Local paths only",
      icon: PanelsTopLeft,
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
          aria-label="Co-VideoPro by Content Co-op sign in"
        >
          <CoProductionBrand className={styles.brandLockup} priority />
        </Link>

        <div className={styles.product}>
          <span>Video production workspace</span>
          <strong>Co-VideoPro</strong>
        </div>

        <div className={styles.securityStatus}>
          <ContextIcon size={15} aria-hidden="true" />
          <span>{contextLabel}</span>
        </div>
      </header>

      <section className={styles.workspace} aria-label="Account access">
        <div className={styles.formColumn} id="auth-content" tabIndex={-1}>
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
            {demoMode ? "Demo data stays in this browser" : "Private account access"}
          </p>
        </div>
      </section>
    </main>
  );
}
