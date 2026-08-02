"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspaceRole } from "@/components/navigation/navigation-model";
import type { IdentityMutation } from "@/lib/identity/authority";

export type IdentityTeamRole =
  | "owner"
  | "admin"
  | "producer"
  | "editor"
  | "member"
  | "reviewer"
  | "viewer";

export interface IdentityPolicy {
  teamId: string;
  mfaRequirement: "optional" | "administrators" | "everyone";
  sessionIdleMinutes: 15 | 30 | 60 | 120 | 240;
  sessionMaxDays: 1 | 7 | 14 | 30 | 90;
  passwordAuthenticationEnabled: boolean;
  adminApprovalRequired: boolean;
  ssoStatus: "not_configured" | "preview" | "verified";
  scimStatus: "not_configured" | "preview" | "verified";
  version: number;
  updatedAt?: string;
}

export interface IdentityFeatureFlag {
  id: string;
  key:
    | "identity.policy_preview"
    | "identity.audit_export"
    | "branding.version_history";
  projectId: string | null;
  enabled: boolean;
  version: number;
}

export interface IdentityBrand {
  publicationId: string;
  publicationVersion: number;
  revisionId: string;
  revisionNumber: number;
  scope: "organization" | "project";
  projectId: string | null;
  values: {
    displayName: string;
    playerLabel: string;
    primaryColor: string;
    logoAssetId: string | null;
    cornerRadius: number;
    showPoweredBy: boolean;
  };
  publishedAt: string;
}

export interface IdentityMutationResponse {
  ok?: boolean;
  requestId?: string;
  result?: unknown;
  context?: unknown;
  error?: string;
  code?: string;
}

export interface IdentityContext {
  actor: {
    id: string;
    email: string | null;
    aal: "aal1" | "aal2";
    sessionId: string | null;
  };
  profile: {
    firstName: string;
    lastName: string;
    title: string;
    locale: string;
    timeZone: string;
    weekStartsOn: "sunday" | "monday";
    highContrast: boolean;
    reviewerColor: string;
    version: number;
    updatedAt: string;
  };
  preferences: {
    activeTeamId: string | null;
    theme: "system" | "light" | "dark";
    density: "comfortable" | "compact";
    reduceMotion: boolean;
    defaultLandingPage: "projects" | "reviews" | "activity";
    version: number;
    updatedAt: string;
  };
  activeTeamId: string | null;
  memberships: Array<{
    teamId: string;
    teamName: string;
    role: IdentityTeamRole;
    delegatedCapabilities: string[];
    version: number;
  }>;
  policy: IdentityPolicy | null;
  featureFlags: IdentityFeatureFlag[];
  brand: IdentityBrand | null;
}

export function isIdentityContext(value: unknown): value is IdentityContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<IdentityContext>;
  return Boolean(
    typeof candidate.actor?.id === "string" &&
      candidate.actor.id.length > 0 &&
      candidate.profile &&
      Number.isInteger(candidate.profile.version) &&
      candidate.preferences &&
      Number.isInteger(candidate.preferences.version) &&
      Array.isArray(candidate.memberships) &&
      candidate.memberships.every(
        (membership) =>
          typeof membership?.teamId === "string" &&
          typeof membership?.role === "string" &&
          Number.isInteger(membership?.version),
      ),
  );
}

export function navigationRoleForIdentity(
  context: IdentityContext | null,
): WorkspaceRole {
  const membership = context?.memberships.find(
    (candidate) => candidate.teamId === context.activeTeamId,
  );
  const role = membership?.role;
  return role === "owner" ||
    role === "admin" ||
    role === "producer" ||
    role === "editor" ||
    role === "member" ||
    role === "reviewer" ||
    role === "viewer"
    ? role
    : "viewer";
}

export function useIdentityContext(enabled: boolean) {
  const [context, setContext] = useState<IdentityContext | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) {
      setContext(null);
      setLoading(false);
      setError(null);
      return null;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/identity/context", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok) throw new Error("identity_unavailable");
      const payload = (await response.json()) as { context?: unknown };
      if (!isIdentityContext(payload.context)) throw new Error("identity_invalid");
      setContext(payload.context);
      setError(null);
      return payload.context;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return null;
      setContext(null);
      setError("Account authority is temporarily unavailable");
      return null;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  const mutate = useCallback(async (mutation: IdentityMutation) => {
    if (!enabled) throw new Error("managed_identity_disabled");
    const expectedActorId = context?.actor.id;
    if (!expectedActorId) throw new Error("Account authority must be loaded before saving");
    const response = await fetch("/api/identity/context", {
      method: "PATCH",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mutation),
    });
    const payload = (await response.json().catch(() => ({}))) as IdentityMutationResponse;
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.error || "Identity update failed");
    }
    if (
      !isIdentityContext(payload.context) ||
      payload.context.actor.id !== expectedActorId
    ) {
      throw new Error(
        "The change could not be confirmed for this account. Reload before editing again.",
      );
    }
    setContext(payload.context);
    return payload;
  }, [context?.actor.id, enabled]);

  return {
    context,
    loading,
    error,
    reload,
    mutate,
    role: navigationRoleForIdentity(context),
  };
}
