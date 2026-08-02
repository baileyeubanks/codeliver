"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import {
  buildAuthPageHref,
  resolveDemoReturnPath,
} from "@/components/auth/auth-policy";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import { useDemoMode } from "@/lib/demo/mode";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";

export default function DemoSessionGuard({ children }: { children: ReactNode }) {
  const demoMode = useDemoMode();
  const workspace = useDemoWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const signedOut = demoMode && !workspace.session.authenticated;

  useEffect(() => {
    if (!signedOut) return;
    const returnPath = resolveDemoReturnPath(
      pathname,
      window.location.search,
      window.location.hash,
    );
    router.replace(buildAuthPageHref("/login", returnPath, true));
  }, [pathname, router, signedOut]);

  if (signedOut) {
    return (
      <div className="exterior-state exterior-state--loading" aria-busy="true">
        <div className="exterior-state__panel">
          <CoProductionBrand
            variant="stacked"
            label="Co‑VideoPro by Content Co-op"
            priority
          />
          <div className="exterior-state__icon" aria-hidden="true">
            <LoaderCircle size={18} />
          </div>
          <p className="exterior-state__eyebrow">Session required</p>
          <h1>Returning to Co‑VideoPro sign in.</h1>
          <p>Restoring a verified demo session before reopening the production cockpit.</p>
          <div className="exterior-state__meter" aria-hidden="true">
            <span />
          </div>
          <span className="sr-only">Returning to sign in</span>
        </div>
      </div>
    );
  }

  return children;
}
