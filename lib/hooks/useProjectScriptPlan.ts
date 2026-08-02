"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  parseProjectScriptPlanApprovalReceipt,
  parseProjectScriptPlanDraftReceipt,
  parseProjectScriptPlanProposal,
  type ProjectScriptPlanProposal,
} from "@/lib/preproduction/script-plan";

type ScriptPlanOperation = "generate" | "approve" | null;

interface ProjectScriptPlanState {
  proposal: ProjectScriptPlanProposal | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  operation: ScriptPlanOperation;
  announcement: string;
  reload: () => Promise<void>;
  generateDraft: () => Promise<boolean>;
  approveDraft: (note: string) => Promise<boolean>;
}

function responseMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

function stableRequestId(
  holder: MutableRefObject<{ key: string; id: string } | null>,
  key: string,
) {
  if (holder.current?.key !== key) {
    holder.current = { key, id: crypto.randomUUID() };
  }
  return holder.current.id;
}

export function useProjectScriptPlan(
  projectId: string,
  enabled: boolean,
): ProjectScriptPlanState {
  const [proposal, setProposal] = useState<ProjectScriptPlanProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<ScriptPlanOperation>(null);
  const [announcement, setAnnouncement] = useState("");
  const requestVersionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const operationRef = useRef<ScriptPlanOperation>(null);
  const generateRequestRef = useRef<{ key: string; id: string } | null>(null);
  const approvalRequestRef = useRef<{ key: string; id: string } | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !projectId) return;
    const requestVersion = ++requestVersionRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/script/plan`,
        { cache: "no-store", signal: controller.signal },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseMessage(body, "Script production planning could not be loaded"));
      }
      const nextProposal = parseProjectScriptPlanProposal(body);
      if (!nextProposal || nextProposal.projectId !== projectId) {
        throw new Error("Script production planning returned an invalid proposal");
      }
      if (requestVersionRef.current !== requestVersion) return;
      setProposal(nextProposal);
      setReady(true);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      if (requestVersionRef.current !== requestVersion) return;
      setError(caught instanceof Error
        ? caught.message
        : "Script production planning could not be loaded");
    } finally {
      if (requestVersionRef.current === requestVersion) setLoading(false);
    }
  }, [enabled, projectId]);

  useEffect(() => {
    if (!enabled) {
      requestVersionRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      operationRef.current = null;
      generateRequestRef.current = null;
      approvalRequestRef.current = null;
      setProposal(null);
      setLoading(false);
      setReady(false);
      setError(null);
      setOperation(null);
      return;
    }
    void reload();
    return () => {
      requestVersionRef.current += 1;
      abortRef.current?.abort();
    };
  }, [enabled, projectId, reload]);

  const generateDraft = useCallback(async () => {
    if (
      !enabled
      || !proposal?.available
      || !proposal.scriptRevisionId
      || proposal.draft
      || !proposal.permissions.canGenerate
      || operationRef.current
    ) return false;
    operationRef.current = "generate";
    setOperation("generate");
    setError(null);
    const key = `${proposal.authorityVersion}:${proposal.scriptRevisionId}`;
    const requestId = stableRequestId(generateRequestRef, key);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/script/plan/draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedAuthorityVersion: proposal.authorityVersion,
            expectedScriptRevisionId: proposal.scriptRevisionId,
            requestId,
          }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) await reload();
        throw new Error(responseMessage(body, "The governed plan draft could not be generated"));
      }
      const receipt = parseProjectScriptPlanDraftReceipt(body);
      if (
        !receipt
        || receipt.projectId !== projectId
        || receipt.scriptRevisionId !== proposal.scriptRevisionId
        || receipt.requestId !== requestId
      ) throw new Error("The governed plan draft returned an invalid receipt");
      generateRequestRef.current = null;
      await reload();
      setAnnouncement(receipt.replayed
        ? "The governed plan draft was already generated"
        : "Governed production plan draft generated");
      return true;
    } catch (caught) {
      setError(caught instanceof Error
        ? caught.message
        : "The governed plan draft could not be generated");
      return false;
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  }, [enabled, projectId, proposal, reload]);

  const approveDraft = useCallback(async (rawNote: string) => {
    const note = rawNote.normalize("NFC").replace(/\r\n?/g, "\n").trim();
    if (
      !enabled
      || !proposal?.available
      || !proposal.draft
      || proposal.alreadyMaterialized
      || !proposal.permissions.canApprove
      || !note
      || Array.from(note).length > 4_000
      || operationRef.current
    ) return false;
    operationRef.current = "approve";
    setOperation("approve");
    setError(null);
    const key = `${proposal.draft.id}:${proposal.currentPlanRevision}:${note}`;
    const requestId = stableRequestId(approvalRequestRef, key);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/script/plan/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draftId: proposal.draft.id,
            expectedPlanRevision: proposal.currentPlanRevision,
            requestId,
            note,
          }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) await reload();
        throw new Error(responseMessage(body, "The governed plan draft could not be approved"));
      }
      const receipt = parseProjectScriptPlanApprovalReceipt(body);
      if (
        !receipt
        || receipt.projectId !== projectId
        || receipt.draftId !== proposal.draft.id
        || receipt.requestId !== requestId
      ) throw new Error("The plan approval returned an invalid receipt");
      approvalRequestRef.current = null;
      await reload();
      setAnnouncement(receipt.replayed
        ? "This governed plan was already active"
        : `Production plan revision ${receipt.revisionNumber} activated`);
      return true;
    } catch (caught) {
      setError(caught instanceof Error
        ? caught.message
        : "The governed plan draft could not be approved");
      return false;
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  }, [enabled, projectId, proposal, reload]);

  return {
    proposal,
    loading,
    ready,
    error,
    operation,
    announcement,
    reload,
    generateDraft,
    approveDraft,
  };
}
