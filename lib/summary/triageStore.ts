/**
 * P21 — Demo persistence for the producer summary board.
 *
 * Follows the existing store patterns: a zustand store (lib/stores/*.ts) with
 * the demo workspace store's localStorage conventions (guarded window access,
 * best-effort persistence, storage-event sync). The demo workspace store
 * (lib/demo/workspace-store.ts) has no extension point for triage state and
 * sits outside this feature's lane, so triage persists under its own
 * namespaced key using the same conventions rather than a parallel mechanism.
 */
import { create } from "zustand";

import { isSummaryClassification, type SummaryClassification } from "./classify";
import {
  applyTriage,
  clearTriage,
  reviveTriageRecords,
  type TriageRecord,
  type TriageState,
} from "./triage";

export const SUMMARY_TRIAGE_STORAGE_KEY = "co-videopro.summary-triage.v1";

interface PersistedSummaryTriage {
  triage: Record<string, TriageRecord>;
  overrides: Record<string, SummaryClassification>;
}

interface SummaryTriageStore extends PersistedSummaryTriage {
  /** Record a triage decision with completer + timestamp (Frame.io model). */
  markTriaged: (commentId: string, state: TriageState, completedBy: string) => void;
  /** Return a comment to untriaged. */
  clearTriageRecord: (commentId: string) => void;
  /** Producer confirms/corrects a suggested classification. */
  setClassificationOverride: (
    commentId: string,
    classification: SummaryClassification | null,
  ) => void;
  reset: () => void;
}

function readPersisted(): PersistedSummaryTriage {
  const empty: PersistedSummaryTriage = { triage: {}, overrides: {} };
  if (typeof window === "undefined") return empty;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SUMMARY_TRIAGE_STORAGE_KEY);
  } catch {
    return empty;
  }
  if (raw === null) return empty;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
    const record = parsed as Record<string, unknown>;
    const overrides: Record<string, SummaryClassification> = {};
    if (record.overrides && typeof record.overrides === "object" && !Array.isArray(record.overrides)) {
      for (const [key, value] of Object.entries(record.overrides as Record<string, unknown>)) {
        if (isSummaryClassification(value)) overrides[key] = value;
      }
    }
    return { triage: reviveTriageRecords(record.triage), overrides };
  } catch {
    return empty;
  }
}

function persist(state: PersistedSummaryTriage) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SUMMARY_TRIAGE_STORAGE_KEY,
      JSON.stringify({ triage: state.triage, overrides: state.overrides }),
    );
  } catch {
    // The in-memory board remains usable if browser storage is unavailable.
  }
}

export const useSummaryTriageStore = create<SummaryTriageStore>((set, get) => ({
  ...readPersisted(),

  markTriaged: (commentId, state, completedBy) => {
    const completer = completedBy.trim();
    if (!commentId || !completer) return;
    const next = applyTriage(get().triage, {
      comment_id: commentId,
      state,
      completed_by: completer,
      completed_at: new Date().toISOString(),
    });
    set({ triage: next });
    persist({ triage: next, overrides: get().overrides });
  },

  clearTriageRecord: (commentId) => {
    const next = clearTriage(get().triage, commentId);
    set({ triage: next });
    persist({ triage: next, overrides: get().overrides });
  },

  setClassificationOverride: (commentId, classification) => {
    const overrides = { ...get().overrides };
    if (classification === null) delete overrides[commentId];
    else overrides[commentId] = classification;
    set({ overrides });
    persist({ triage: get().triage, overrides });
  },

  reset: () => {
    set({ triage: {}, overrides: {} });
    persist({ triage: {}, overrides: {} });
  },
}));
