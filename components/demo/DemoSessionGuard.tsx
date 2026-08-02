"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  buildAuthPageHref,
  resolveDemoReturnPath,
} from "@/components/auth/auth-policy";
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
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="spinner" aria-label="Returning to sign in" />
      </div>
    );
  }

  return children;
}
