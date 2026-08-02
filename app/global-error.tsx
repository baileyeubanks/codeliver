"use client";

import "./globals.css";
import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="exterior-state exterior-state--error">
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
              <AlertTriangle size={18} />
            </div>
            <p className="exterior-state__eyebrow">Something went wrong</p>
            <h1>Co-VideoPro needs a quick refresh.</h1>
            <p>
              Something went wrong while loading your workspace. Try again —
              your work is saved. If it keeps happening, contact Content Co-op.
            </p>
            {error?.digest ? (
              <p style={{ color: "var(--muted)", fontSize: "11px" }}>
                Reference: {error.digest}
              </p>
            ) : null}
            <div className="exterior-state__actions">
              <button
                className="exterior-state__primary"
                type="button"
                onClick={reset}
              >
                <RefreshCw size={15} aria-hidden="true" />
                Try again
              </button>
              <Link className="exterior-state__secondary" href="/projects">
                Go to your projects
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
