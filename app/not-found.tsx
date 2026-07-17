import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";
import CoProductionBrand from "@/components/brand/CoProductionBrand";

export default function NotFound() {
  return (
    <div className="exterior-state exterior-state--not-found">
      <div className="exterior-state__panel">
        <CoProductionBrand
          variant="stacked"
          label="Co-VideoPro by Content Co-op"
          priority
        />
        <div className="exterior-state__icon" aria-hidden="true">
          <SearchX size={18} />
        </div>
        <p className="exterior-state__eyebrow">Workspace route unavailable</p>
        <h1>This Co-VideoPro surface is not available.</h1>
        <p>
          The workspace link may have moved, expired, or require a different
          project permission.
        </p>
        <div className="exterior-state__actions">
          <Link className="exterior-state__primary" href="/projects">
            Projects
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link className="exterior-state__secondary" href="/login">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
