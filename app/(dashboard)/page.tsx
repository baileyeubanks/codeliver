"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import CoProductionBrand from "@/components/brand/CoProductionBrand";

export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/projects${window.location.search}`);
  }, [router]);

  return (
    <div className="exterior-state exterior-state--loading" aria-busy="true">
      <div className="exterior-state__panel">
        <CoProductionBrand
          variant="stacked"
          label="Co-Production Pro by Content Co-op"
          priority
        />
        <div className="exterior-state__icon" aria-hidden="true">
          <LoaderCircle size={18} />
        </div>
        <p className="exterior-state__eyebrow">Opening cockpit</p>
        <h1>Loading Co-Production Pro projects.</h1>
        <p>Routing to the project workspace with media, review, and approval state.</p>
        <div className="exterior-state__meter" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
