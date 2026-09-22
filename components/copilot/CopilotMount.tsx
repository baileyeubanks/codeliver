"use client";

import { usePathname } from "next/navigation";
import { useDemoMode } from "@/lib/demo/mode";
import CopilotPanel from "./CopilotPanel";
import { copilotProjectFromPath } from "./copilot-client";

/* Internal tooling: never on auth pages or public client review surfaces. */
const EXCLUDED_PATHS = new Set(["/login", "/signup"]);
const EXCLUDED_PREFIXES = ["/review"];

export function copilotAllowedOnPath(pathname: string): boolean {
  if (EXCLUDED_PATHS.has(pathname)) return false;
  return !EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Real Copilot is confined to the internal projects workspace. */
export default function CopilotMount() {
  const demoMode = useDemoMode();
  const pathname = usePathname() ?? "";
  if (!copilotAllowedOnPath(pathname)) return null;
  if (!demoMode && pathname !== "/projects" && !pathname.startsWith("/projects/")) return null;
  const projectId = copilotProjectFromPath(pathname);
  return <CopilotPanel key={`${demoMode}:${projectId ?? "workspace"}`} demoMode={demoMode} projectId={projectId} />;
}
