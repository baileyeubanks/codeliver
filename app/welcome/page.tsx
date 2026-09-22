import Link from "next/link";
import { ArrowRight } from "lucide-react";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import styles from "./welcome.module.css";

/**
 * Public product door — one clear entry point into the same bright workspace.
 */
export default function WelcomePage() {
  return (
    <main className={styles.shell}>
      <a className={styles.skipLink} href="#welcome-content">
        Skip to welcome
      </a>

      <header className={styles.header}>
        <Link
          className={styles.brand}
          href="/login"
          aria-label="Co‑VideoPro by Content Co-op sign in"
        >
          <CoProductionBrand className={styles.brandLockup} priority />
        </Link>
        <div className={styles.product}>
          <span>Video production workspace</span>
          <strong>Co‑VideoPro</strong>
        </div>
        <nav className={styles.nav} aria-label="Account">
          <Link href="/login" className={styles.navLink}>
            Sign in
          </Link>
        </nav>
      </header>

      <section
        className={styles.workspace}
        id="welcome-content"
        tabIndex={-1}
        aria-label="Welcome"
      >
        <div className={styles.composition}>
          <div className={styles.copy}>
            <p className={styles.brandSignal}>Co‑VideoPro</p>
            <h1 className={styles.title}>
              A clear workspace for video production.
            </h1>
            <p className={styles.deck}>
              Keep projects, review, and delivery connected from the first brief to the final handoff.
            </p>
            <div className={styles.actions}>
              <Link href="/login" className={styles.primary}>
                Sign in <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link href="/signup" className={styles.secondary}>
                Request access
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
