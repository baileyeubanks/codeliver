"use client";

import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import { signOutDemoSession } from "@/lib/demo/workspace-store";
import styles from "./Portal.module.css";

export interface PortalShellProps {
  clientName: string;
  userName: string;
  userEmail?: string | null;
  children: ReactNode;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Branded client shell — deliberately simpler than the internal cockpit:
 * logo, client company name, user menu. Nothing else competes for attention.
 */
export default function PortalShell({
  clientName,
  userName,
  userEmail,
  children,
}: PortalShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <CoProductionBrand
          variant="horizontal"
          label="Co-ProVideo client portal by Content Co-op"
          priority
        />
        <p className={styles.headerClient}>{clientName}</p>
        <span className={styles.headerSpacer} aria-hidden="true" />
        <details className={styles.userMenu}>
          <summary
            className={styles.userMenuSummary}
            aria-label={`Account menu for ${userName}`}
          >
            <span className={styles.avatar} aria-hidden="true">
              {initials(userName)}
            </span>
            {userName}
          </summary>
          <div className={styles.userMenuPanel}>
            <p className={styles.userMenuIdentity}>
              <strong>{userName}</strong>
              {userEmail ? <span>{userEmail}</span> : null}
            </p>
            <button
              type="button"
              className={styles.signOut}
              onClick={() => signOutDemoSession()}
            >
              <LogOut size={15} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </details>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
