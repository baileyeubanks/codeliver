"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  BRAND_GOVERNANCE_STORAGE_KEY,
  createBrandDraft,
  createRollbackDraft,
  discardBrandDraft,
  migrateLegacyBrand,
  publishBrandRevision,
  resolveBrand,
  restoreBrandRevisions,
  type BrandContext,
  type BrandRevision,
  type BrandValues,
  type LegacyBrandValues,
} from "@contentco-op/brand";

let currentRevisions: BrandRevision[] | null = null;
let hydratedOrganizationId: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);

  function handleStorage(event: StorageEvent) {
    if (event.key !== BRAND_GOVERNANCE_STORAGE_KEY) return;
    resetBrandGovernanceDemoCache();
  }

  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function emitChange() {
  for (const listener of listeners) listener();
}

export function resetBrandGovernanceDemoCache() {
  currentRevisions = null;
  hydratedOrganizationId = null;
  emitChange();
}

function saveRevisions(next: BrandRevision[]) {
  currentRevisions = next;
  try {
    window.localStorage.setItem(BRAND_GOVERNANCE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // In-memory brand preview remains usable when browser storage is unavailable.
  }
  emitChange();
}

export function useBrandGovernanceDemo(
  enabled: boolean,
  context: BrandContext,
  legacyBrand: LegacyBrandValues,
  actorId: string,
) {
  const stableContext = useMemo(
    () => ({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
    }),
    [context.organizationId, context.workspaceId],
  );
  const fallback = useMemo(
    () => migrateLegacyBrand(legacyBrand, stableContext),
    [legacyBrand, stableContext],
  );
  const getSnapshot = useCallback(() => {
    if (!enabled) return fallback;
    if (
      currentRevisions === null ||
      hydratedOrganizationId !== stableContext.organizationId
    ) {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(BRAND_GOVERNANCE_STORAGE_KEY);
      } catch {
        // Keep the in-memory brand preview available without browser storage.
      }
      currentRevisions = restoreBrandRevisions(
        stored,
        fallback,
        stableContext,
      ).revisions;
      hydratedOrganizationId = stableContext.organizationId;
    }
    return currentRevisions;
  }, [enabled, fallback, stableContext]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  const revisions = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [previewRevisionId, setPreviewRevisionId] = useState<string | null>(null);

  const resolved = useMemo(
    () => resolveBrand(revisions, stableContext, previewRevisionId),
    [previewRevisionId, revisions, stableContext],
  );

  const saveDraft = useCallback(
    (scope: "organization" | "workspace", values: BrandValues) => {
      if (!enabled) return null;
      const next = createBrandDraft(revisions, {
        context: stableContext,
        scope,
        values,
        createdBy: actorId,
      });
      const draft = next[next.length - 1];
      saveRevisions(next);
      setPreviewRevisionId(draft.id);
      return draft;
    },
    [actorId, enabled, revisions, stableContext],
  );

  const publishDraft = useCallback(
    (revisionId: string) => {
      if (!enabled) return null;
      const next = publishBrandRevision(revisions, {
        revisionId,
        organizationId: stableContext.organizationId,
      });
      saveRevisions(next);
      setPreviewRevisionId(null);
      return resolveBrand(next, stableContext);
    },
    [enabled, revisions, stableContext],
  );

  const discardDraft = useCallback(
    (revisionId: string) => {
      if (!enabled) return false;
      const next = discardBrandDraft(revisions, {
        revisionId,
        organizationId: stableContext.organizationId,
      });
      saveRevisions(next);
      setPreviewRevisionId(null);
      return true;
    },
    [enabled, revisions, stableContext.organizationId],
  );

  const rollback = useCallback(
    (sourceRevisionId: string) => {
      if (!enabled) return null;
      const next = createRollbackDraft(revisions, {
        sourceRevisionId,
        organizationId: stableContext.organizationId,
        workspaceId: stableContext.workspaceId,
        createdBy: actorId,
      });
      const draft = next[next.length - 1];
      saveRevisions(next);
      setPreviewRevisionId(draft.id);
      return draft;
    },
    [actorId, enabled, revisions, stableContext],
  );

  const reset = useCallback(() => {
    if (!enabled) return;
    hydratedOrganizationId = stableContext.organizationId;
    saveRevisions(fallback);
    setPreviewRevisionId(null);
  }, [enabled, fallback, stableContext.organizationId]);

  return {
    revisions,
    previewRevisionId,
    setPreviewRevisionId,
    resolved,
    saveDraft,
    publishDraft,
    discardDraft,
    rollback,
    reset,
    hydrated: true,
  };
}
