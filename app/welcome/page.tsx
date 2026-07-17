import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Captions,
  Clapperboard,
  PackageCheck,
} from "lucide-react";

/**
 * Public front door — built from Bailey's Canva hero concepts
 * (Enhance and Vector Artwork). The composition is his; the copy is the
 * product's truth (it's an operating system, not an agency).
 */
const PILLARS = [
  {
    icon: CalendarClock,
    title: "Production planning",
    body: "Call sheets, locations, releases — and the chase list that tells you who films tomorrow unsigned.",
  },
  {
    icon: Captions,
    title: "Media & transcript",
    body: "Resumable ingest, transcripts, sound-bite selects, captions — every frame searchable.",
  },
  {
    icon: Clapperboard,
    title: "Edit & review",
    body: "A real sequence model, timeline, radio cuts from transcripts, and consolidated revision rounds.",
  },
  {
    icon: PackageCheck,
    title: "Delivery & payments",
    body: "QC-gated deliverables, proposals with estimates, and payment milestones — in one record.",
  },
] as const;

export default function WelcomePage() {
  return (
    <main className="cv-hero">
      <header className="cv-hero__top">
        <Image src="/brand/cvp-long.png" alt="Co-VideoPro by Content Co-op" width={146} height={37} priority unoptimized />
        <nav className="cv-hero__nav" aria-label="Welcome">
          <Link href="/login">Sign in</Link>
          <Link href="/login?demo=1" className="cv-hero__cta">
            Open the workspace <ArrowRight size={15} />
          </Link>
        </nav>
      </header>

      <section className="cv-hero__stage">
        <div className="cv-hero__copy">
          <h1>
            We turn <em>ideas</em> into <em>impact</em>.
          </h1>
          <p className="cv-hero__sub">
            The AI-native operating system for professional video production —
            from first inquiry to final delivery, in one connected record.
          </p>
          <ul className="cv-hero__badges" aria-label="Principles">
            <li>Media center stage</li>
            <li>Agents take the forms</li>
            <li>You keep the craft</li>
            <li>Self-hosted, always</li>
          </ul>
          <p className="cv-hero__site">co-videopro.com</p>
        </div>

        <div className="cv-hero__art" aria-hidden="true">
          <Image
            src="/brand/cvp-stacked.png"
            alt=""
            width={440}
            height={234}
            priority
            unoptimized
            className="cv-hero__mark"
          />
          <div className="cv-hero__cards">
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="cv-hero__card">
                <pillar.icon size={18} />
                <strong>{pillar.title}</strong>
                <small>{pillar.body}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="cv-hero__foot">
        <span>CREATE · CONNECT · CONVERT</span>
        <span>Inquiry → Brief → Proposal → Production → Edit → Review → Delivery</span>
      </footer>
    </main>
  );
}
