import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="exterior-state exterior-state--not-found">
      <div className="exterior-state__panel">
        <span
          role="img"
          aria-label="Co-VideoPro by Content Co-op"
          style={{
            display: "grid",
            justifyItems: "center",
            gap: "3px",
            marginBottom: "2px",
            fontFamily: "var(--cvp-font-display)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              color: "var(--cvp-blue)",
              fontSize: "26px",
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            Co-VideoPro
          </span>
          <span
            aria-hidden="true"
            style={{
              color: "var(--muted)",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            by Content Co-op
          </span>
        </span>
        <div className="exterior-state__icon" aria-hidden="true">
          <SearchX size={18} />
        </div>
        <p className="exterior-state__eyebrow">Page not found</p>
        <h1>This Co-VideoPro page isn&apos;t available.</h1>
        <p>
          The link may have expired or been replaced. Ask your Content Co-op
          contact for a new one.
        </p>
        <div className="exterior-state__actions">
          <Link className="exterior-state__primary" href="/login">
            Go to sign in
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link className="exterior-state__secondary" href="/projects">
            Go to your projects
          </Link>
        </div>
      </div>
    </div>
  );
}
