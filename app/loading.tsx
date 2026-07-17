import { LoaderCircle } from "lucide-react";
import CoProductionBrand from "@/components/brand/CoProductionBrand";

export default function Loading() {
  return (
    <div className="exterior-state exterior-state--loading" aria-busy="true">
      <div className="exterior-state__panel">
        <CoProductionBrand
          variant="stacked"
          label="Webster by co-videopro"
          priority
        />
        <div className="exterior-state__icon" aria-hidden="true">
          <LoaderCircle size={18} />
        </div>
        <p className="exterior-state__eyebrow">Restoring workspace</p>
        <h1>Loading Webster workspace.</h1>
        <p>Preparing projects, media, comments, approvals, and review state.</p>
        <div className="exterior-state__meter" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
