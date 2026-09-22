import type { ReactNode } from "react";
import Link from "next/link";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import styles from "./LegalPage.module.css";

interface LegalPageProps {
  current: "privacy" | "terms";
  title: string;
  lede: string;
  children: ReactNode;
}

export default function LegalPage({
  current,
  title,
  lede,
  children,
}: LegalPageProps) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#legal-document">
        Skip to legal document
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link
            className={styles.brand}
            href="/login"
            aria-label="Co‑VideoPro by Content Co-op sign in"
          >
            <CoProductionBrand className={styles.brandLockup} priority />
          </Link>
          <span className={styles.productLabel}>
            Video review &amp; delivery
          </span>
          <nav
            className={styles.headerNav}
            aria-label="Legal and account links"
          >
            <Link
              href="/privacy"
              aria-current={current === "privacy" ? "page" : undefined}
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              aria-current={current === "terms" ? "page" : undefined}
            >
              Terms
            </Link>
            <Link className={styles.signInLink} href="/login">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className={styles.main} id="legal-document" tabIndex={-1}>
        <article className={styles.document}>
          <header className={styles.documentHeader}>
            <p className={styles.kicker}>Content Co-op · Co‑VideoPro</p>
            <h1>{title}</h1>
            <p className={styles.lede}>{lede}</p>
            <div className={styles.documentMeta}>
              <span className={styles.draftBadge}>Draft</span>
              <span>Prepared August 23, 2026</span>
            </div>
          </header>
          <div className={styles.documentBody}>{children}</div>
        </article>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p>
            <strong>Draft — pending owner review.</strong> This working copy is
            not yet a final Content Co-op policy.
          </p>
          <nav aria-label="Legal footer">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/login">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
