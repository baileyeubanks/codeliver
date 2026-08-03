import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import styles from "./welcome.module.css";

/**
 * Public product door — Sapphire Light chrome; dark reserved for the player well.
 * Real CCO review media is the face (not a centered auth card).
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
              Production and review in one workspace.
            </h1>
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

          <aside className={styles.player} aria-label="Review player preview">
            <div className={styles.playerChrome}>
              <span className={styles.playerDot} aria-hidden="true" />
              <span className={styles.playerLabel}>Review</span>
              <span className={styles.playerTitle}>ICA CEO · cut v3</span>
            </div>
            <div className={styles.playerStage}>
              <video
                className={styles.playerVideo}
                src="/demo/ica-ceo-preview.mp4"
                muted
                playsInline
                loop
                autoPlay
                preload="metadata"
                aria-label="Sample review cut from a Content Co-op project"
              />
            </div>
            <div className={styles.filmstripWrap}>
              <Image
                className={styles.filmstrip}
                src="/demo/ica-review-filmstrip.jpg"
                alt="Frame strip from the ICA CEO review cut"
                width={1600}
                height={180}
                priority
                unoptimized
              />
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
