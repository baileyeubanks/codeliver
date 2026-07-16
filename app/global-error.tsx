"use client";

import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import CoProductionBrand from "@/components/brand/CoProductionBrand";

export default function GlobalError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="exterior-state exterior-state--error" role="alert">
          <div className="exterior-state__panel">
            <CoProductionBrand
              variant="stacked"
              label="Co-Production Pro by Content Co-op"
              priority
            />
            <div className="exterior-state__icon" aria-hidden="true">
              <AlertTriangle size={18} />
            </div>
            <p className="exterior-state__eyebrow">Workspace recovery</p>
            <h1>Co-Production Pro needs a quick refresh.</h1>
            <p>
              The workspace hit a recoverable error before projects, media,
              comments, and approvals could finish loading.
            </p>
            <div className="exterior-state__actions">
              <button
                className="exterior-state__primary"
                type="button"
                onClick={reset}
              >
                <RefreshCw size={15} aria-hidden="true" />
                Try again
              </button>
              <a className="exterior-state__secondary" href="/projects">
                Projects
                <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
