"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useDemoMode } from "@/lib/demo/mode";
import CopilotPanel from "./CopilotPanel";
import { copilotAllowedOnPath, copilotProjectFromPath } from "./copilot-client";

/** Real Copilot is confined to the internal projects workspace. */
export default function CopilotMount() {
  const demoMode = useDemoMode();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  if (!copilotAllowedOnPath(pathname, searchParams.toString())) return null;
  if (!demoMode && pathname !== "/projects" && !pathname.startsWith("/projects/")) return null;
  const projectId = copilotProjectFromPath(pathname);
  return <CopilotPanel key={`${demoMode}:${projectId ?? "workspace"}`} demoMode={demoMode} projectId={projectId} />;
}
