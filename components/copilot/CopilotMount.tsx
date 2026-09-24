"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useDemoMode } from "@/lib/demo/mode";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import { roleCan, type WorkspaceRole } from "@/components/navigation/navigation-model";
import CopilotPanel from "./CopilotPanel";
import { copilotProjectFromPath } from "./copilot-client";

/* Internal tooling: never on auth pages, public review, or a signed-in client's film. */
const EXCLUDED_PATHS = new Set(["/login", "/signup"]);
const EXCLUDED_PREFIXES = ["/review"];
const PROJECT_FILM_PATH = /^\/projects\/(?!new$|archive$|trash$)[^/]+\/?$/;
const WORKSPACE_ROLES: readonly WorkspaceRole[] = ["owner", "producer", "editor", "reviewer", "viewer"];

export function copilotAllowedOnPath(pathname: string, role?: WorkspaceRole | null): boolean {
  if (EXCLUDED_PATHS.has(pathname)) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
  if (role && !roleCan(role, "media:write") && PROJECT_FILM_PATH.test(pathname)) return false;
  return true;
}

function asWorkspaceRole(value: unknown): WorkspaceRole | null {
  return WORKSPACE_ROLES.includes(value as WorkspaceRole) ? (value as WorkspaceRole) : null;
}

/** Real Copilot is confined to the internal projects workspace. */
export default function CopilotMount() {
  const demoMode = useDemoMode();
  const demoWorkspace = useDemoWorkspace();
  const pathname = usePathname() ?? "";
  const [remoteRole, setRemoteRole] = useState<WorkspaceRole | null>(null);
  useEffect(() => {
    if (demoMode) return;
    const controller = new AbortController();
    void fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        setRemoteRole(asWorkspaceRole(payload?.workspace_role));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [demoMode]);
  const role = demoMode ? (demoWorkspace.session.role ?? "owner") : remoteRole;
  if (!copilotAllowedOnPath(pathname, role)) return null;
  if (!demoMode && pathname !== "/projects" && !pathname.startsWith("/projects/")) return null;
  const projectId = copilotProjectFromPath(pathname);
  return <CopilotPanel key={`${demoMode}:${projectId ?? "workspace"}`} demoMode={demoMode} projectId={projectId} />;
}
