import Link from "next/link";
import { ArrowRight } from "lucide-react";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import styles from "./welcome.module.css";

/**
 * Public product door — Sapphire Light, consistent with /login and /signup.
 * Dark cinematic reel is reserved for player chrome only.
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

      <section className={styles.workspace} id="welcome-content" tabIndex={-1} aria-label="Welcome">
        <div className={styles.panel}>
          <p className={styles.eyebrow}>Content Co-op</p>
          <h1 className={styles.title}>Production and review in one workspace.</h1>
          <p className={styles.deck}>
            Plan shoots, share cuts, collect approvals, and deliver finals —
            with a clear record from brief to handoff.
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
      </section>
    </main>
  );
}
