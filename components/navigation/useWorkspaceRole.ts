"use client";

import { useEffect, useState } from "react";
import { useDemoMode } from "@/lib/demo/mode";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import type { WorkspaceRole } from "./navigation-model";

const WORKSPACE_ROLES: readonly WorkspaceRole[] = [
  "owner",
  "producer",
  "editor",
  "reviewer",
  "viewer",
];

function asWorkspaceRole(value: unknown): WorkspaceRole {
  return WORKSPACE_ROLES.includes(value as WorkspaceRole)
    ? (value as WorkspaceRole)
    : "viewer";
}

/**
 * VA-044: one role source for CTA honesty outside the shell. Demo sessions
 * read the local workspace role; live sessions resolve `/api/auth/session`
 * and stay fail-closed at viewer until the role is known.
 */
export function useWorkspaceRole(): WorkspaceRole {
  const demoMode = useDemoMode();
  const demoWorkspace = useDemoWorkspace();
  const [remoteRole, setRemoteRole] = useState<WorkspaceRole>("viewer");

  useEffect(() => {
    if (demoMode) return;
    const controller = new AbortController();
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.authenticated) {
          setRemoteRole(asWorkspaceRole(payload.workspace_role));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [demoMode]);

  return demoMode
    ? (demoWorkspace.session.role ?? "owner")
    : remoteRole;
}
