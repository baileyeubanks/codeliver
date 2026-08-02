import Link from "next/link";
import { ArrowRight } from "lucide-react";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import { ShowreelStage, type ShowreelClip } from "@/components/brand/ShowreelStage";

/**
 * Studio Home — the public front door of Co-VideoPro.
 *
 * A moving editorial introduction: full-bleed selected film imagery, slow
 * crop drift, low film grain, a deep overlay, monumental white type in
 * deliberate negative space, a single clear invitation, and a discreet
 * client sign-in.
 */
const REEL: readonly ShowreelClip[] = [
  {
    src: "/demo/ambient-products.mp4",
    poster: "/demo/refinery-sunset.jpg",
    label: "REEL 01 — THE ATMOSPHERE",
  },
  {
    poster: "/demo/crew-field-shoot.jpg",
    label: "REEL 02 — THE FIELD",
  },
  {
    src: "/demo/ica-ceo-preview.mp4",
    poster: "/demo/ceraweek-speaker.jpg",
    label: "REEL 03 — THE VOICE",
  },
];

export default function WelcomePage() {
  return (
    <main className="cpv-reel cpv-vignette">
      <div className="cpv-reel__shade" aria-hidden="true" />
      <div className="cpv-reel__grain" aria-hidden="true" />
      <div className="cpv-leak" aria-hidden="true" />

      <header className="cpv-reel__chrome">
        <span style={{ color: "var(--cvp-surface)" }}>
          <CoProductionBrand priority />
        </span>
        <nav aria-label="Studio">
          <Link href="/login" className="cpv-reel__client">
            Client sign in
          </Link>
        </nav>
      </header>

      <section className="cpv-reel__copy">
        <p className="cpv-eyebrow cpv-reveal">A Content Co-op studio · Built for the work</p>
        <h1 className="cpv-display cpv-reveal cpv-reveal--1">
          The cinematic operating world for modern brand storytelling.
        </h1>
        <p className="cpv-deck cpv-reveal cpv-reveal--2">
          Part independent film journal, part private client screening room,
          part studio command center — beautiful work, clear creative
          direction, and calm client confidence in one connected record.
        </p>
        <div className="cpv-reel__actions cpv-reveal cpv-reveal--3">
          <Link href="/signup" className="cpv-btn cpv-btn--ivory">
            Start a project <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/login" className="cpv-btn cpv-btn--glass">
            Enter the studio
          </Link>
        </div>
      </section>

      <ShowreelStage clips={REEL} />

      <footer className="cpv-reel__foot">
        <span>Create · Connect · Convert</span>
        <span>From first brief to final delivery — one connected record</span>
      </footer>
    </main>
  );
}
