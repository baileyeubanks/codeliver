"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseProjectShotPlanAppendReceipt,
  parseProjectShotPlanDecisionReceipt,
  parseProjectShotPlanGenerateReceipt,
  parseProjectShotPlanSnapshot,
  parseProjectShotPlanSubmitReceipt,
  type ProjectShotPlanAppendRequest,
  type ProjectShotPlanContent,
  type ProjectShotPlanDecision,
  type ProjectShotPlanDecisionRequest,
  type ProjectShotPlanGenerateRequest,
  type ProjectShotPlanSnapshot,
  type ProjectShotPlanSubmitRequest,
} from "@/lib/preproduction/shot-plan";

export interface AppendProjectShotPlanRevisionInput {
  content: ProjectShotPlanContent;
  changeSummary: string | null;
}

export interface SubmitProjectShotPlanRevisionInput {
  revisionId: string;
  note: string | null;
}

export interface DecideProjectShotPlanRevisionInput {
  revisionId: string;
  decision: ProjectShotPlanDecision;
  note: string | null;
}

export type ProjectShotPlanOperation =
  | "generate"
  | "save"
  | "submit"
  | "decision"
  | null;

interface PendingRequest<T> {
  fingerprint: string;
  request: T;
}

export interface ProjectShotPlanHookState {
  snapshot: ProjectShotPlanSnapshot | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  conflict: string | null;
  operation: ProjectShotPlanOperation;
  announcement: string;
  reload: () => Promise<void>;
  generateRevision: () => Promise<boolean>;
  appendRevision: (
    input: AppendProjectShotPlanRevisionInput,
  ) => Promise<boolean>;
  submitRevision: (
    input: SubmitProjectShotPlanRevisionInput,
  ) => Promise<boolean>;
  decideRevision: (
    input: DecideProjectShotPlanRevisionInput,
  ) => Promise<boolean>;
}

function responseMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

function isAbortError(value: unknown) {
  return value instanceof DOMException && value.name === "AbortError";
}

function requestFor<T extends { requestId: string }>(
  reference: { current: PendingRequest<T> | null },
  input: Omit<T, "requestId">,
): T {
  const fingerprint = JSON.stringify(input);
  if (reference.current?.fingerprint === fingerprint) {
    return reference.current.request;
  }
  const request = { ...input, requestId: crypto.randomUUID() } as T;
  reference.current = { fingerprint, request };
  return request;
}

async function responseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export function useProjectShotPlan(
  projectId: string,
  enabled: boolean,
): ProjectShotPlanHookState {
  const [snapshot, setSnapshot] = useState<ProjectShotPlanSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [operation, setOperation] = useState<ProjectShotPlanOperation>(null);
  const [announcement, setAnnouncement] = useState("");
  const requestVersionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const operationRef = useRef<ProjectShotPlanOperation>(null);
  const generateRequestRef =
    useRef<PendingRequest<ProjectShotPlanGenerateRequest> | null>(null);
  const appendRequestRef =
    useRef<PendingRequest<ProjectShotPlanAppendRequest> | null>(null);
  const submitRequestRef =
    useRef<PendingRequest<ProjectShotPlanSubmitRequest> | null>(null);
  const decisionRequestRef =
    useRef<PendingRequest<ProjectShotPlanDecisionRequest> | null>(null);

  const load = useCallback(async (preserveConflict: boolean) => {
    if (!enabled || !projectId) return;
    const requestVersion = ++requestVersionRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    if (!preserveConflict) setConflict(null);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/shot-plan`,
        { cache: "no-store", signal: controller.signal },
      );
      const body = await responseBody(response);
      if (!response.ok) {
        throw new Error(
          responseMessage(body, "The project shot plan could not be loaded"),
        );
      }
      const nextSnapshot = parseProjectShotPlanSnapshot(body);
      if (!nextSnapshot || nextSnapshot.projectId !== projectId) {
        throw new Error("The project shot plan returned an invalid snapshot");
      }
      if (requestVersionRef.current !== requestVersion) return;
      setSnapshot(nextSnapshot);
      setReady(true);
    } catch (caught) {
      if (isAbortError(caught) || requestVersionRef.current !== requestVersion) {
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "The project shot plan could not be loaded",
      );
    } finally {
      if (requestVersionRef.current === requestVersion) setLoading(false);
    }
  }, [enabled, projectId]);

  const reload = useCallback(async () => {
    await load(false);
  }, [load]);

  useEffect(() => {
    if (!enabled) {
      requestVersionRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      operationRef.current = null;
      generateRequestRef.current = null;
      appendRequestRef.current = null;
      submitRequestRef.current = null;
      decisionRequestRef.current = null;
      setSnapshot(null);
      setLoading(false);
      setReady(false);
      setError(null);
      setConflict(null);
      setOperation(null);
      setAnnouncement("");
      return;
    }

    requestVersionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    operationRef.current = null;
    generateRequestRef.current = null;
    appendRequestRef.current = null;
    submitRequestRef.current = null;
    decisionRequestRef.current = null;
    setSnapshot(null);
    setLoading(false);
    setReady(false);
    setError(null);
    setConflict(null);
    setOperation(null);
    setAnnouncement("");
    void reload();
    return () => {
      requestVersionRef.current += 1;
      abortRef.current?.abort();
    };
  }, [enabled, projectId, reload]);

  const handleConflict = useCallback(async (body: unknown) => {
    const message = responseMessage(
      body,
      "The shot plan or its approved sources changed elsewhere. The latest state has been loaded; review it before retrying.",
    );
    setConflict(message);
    await load(true);
    return message;
  }, [load]);

  const beginOperation = useCallback(
    (nextOperation: Exclude<ProjectShotPlanOperation, null>) => {
      if (!enabled || operationRef.current !== null) return false;
      operationRef.current = nextOperation;
      setOperation(nextOperation);
      setError(null);
      setAnnouncement("");
      return true;
    },
    [enabled],
  );

  const endOperation = useCallback(() => {
    operationRef.current = null;
    setOperation(null);
  }, []);

  const generateRevision = useCallback(async () => {
    if (
      !snapshot?.source ||
      !snapshot.permissions.canGenerate ||
      !beginOperation("generate")
    ) {
      return false;
    }
    const source = snapshot.source;
    const request = requestFor<ProjectShotPlanGenerateRequest>(
      generateRequestRef,
      {
        expectedAuthorityVersion: snapshot.authorityVersion,
        expectedScriptRevisionId: source.scriptRevisionId,
        expectedProductionPlanRevisionId: source.productionPlanRevisionId,
      },
    );
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/shot-plan/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      const body = await responseBody(response);
      if (!response.ok) {
        const message = response.status === 409
          ? await handleConflict(body)
          : responseMessage(body, "The shot plan revision could not be generated");
        throw new Error(message);
      }
      const receipt = parseProjectShotPlanGenerateReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId ||
        receipt.source.scriptRevisionId !== source.scriptRevisionId ||
        receipt.source.productionPlanRevisionId !==
          source.productionPlanRevisionId ||
        receipt.requestId !== request.requestId
      ) {
        throw new Error("The shot plan generation returned an invalid receipt");
      }
      generateRequestRef.current = null;
      await load(false);
      setAnnouncement(
        receipt.replayed
          ? "The governed shot plan revision was already generated"
          : "Governed shot plan revision generated",
      );
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The shot plan revision could not be generated",
      );
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, handleConflict, load, projectId, snapshot]);

  const appendRevision = useCallback(async (
    input: AppendProjectShotPlanRevisionInput,
  ) => {
    if (
      !snapshot?.head ||
      !snapshot.permissions.canRevise ||
      !beginOperation("save")
    ) {
      return false;
    }
    const request = requestFor<ProjectShotPlanAppendRequest>(appendRequestRef, {
      expectedAuthorityVersion: snapshot.authorityVersion,
      baseRevisionId: snapshot.head.revisionId,
      changeSummary: input.changeSummary,
      content: input.content,
    });
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/shot-plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      const body = await responseBody(response);
      if (!response.ok) {
        const message = response.status === 409
          ? await handleConflict(body)
          : responseMessage(body, "The shot plan revision could not be saved");
        throw new Error(message);
      }
      const receipt = parseProjectShotPlanAppendReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId ||
        receipt.requestId !== request.requestId
      ) {
        throw new Error("The shot plan revision returned an invalid receipt");
      }
      appendRequestRef.current = null;
      await load(false);
      setAnnouncement(
        receipt.replayed
          ? "The shot plan revision was already saved"
          : "Shot plan revision saved",
      );
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The shot plan revision could not be saved",
      );
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, handleConflict, load, projectId, snapshot]);

  const submitRevision = useCallback(async (
    input: SubmitProjectShotPlanRevisionInput,
  ) => {
    if (!snapshot?.permissions.canSubmit || !beginOperation("submit")) {
      return false;
    }
    const request = requestFor<ProjectShotPlanSubmitRequest>(submitRequestRef, {
      expectedAuthorityVersion: snapshot.authorityVersion,
      revisionId: input.revisionId,
      note: input.note,
    });
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/shot-plan/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      const body = await responseBody(response);
      if (!response.ok) {
        const message = response.status === 409
          ? await handleConflict(body)
          : responseMessage(body, "The shot plan revision could not be submitted");
        throw new Error(message);
      }
      const receipt = parseProjectShotPlanSubmitReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId ||
        receipt.shotPlanRevisionId !== input.revisionId ||
        receipt.requestId !== request.requestId
      ) {
        throw new Error("The shot plan submission returned an invalid receipt");
      }
      submitRequestRef.current = null;
      await load(false);
      setAnnouncement(
        receipt.replayed
          ? "The shot plan submission was already recorded"
          : "Shot plan submitted for producer review",
      );
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The shot plan revision could not be submitted",
      );
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, handleConflict, load, projectId, snapshot]);

  const decideRevision = useCallback(async (
    input: DecideProjectShotPlanRevisionInput,
  ) => {
    if (!snapshot?.permissions.canDecide || !beginOperation("decision")) {
      return false;
    }
    const request = requestFor<ProjectShotPlanDecisionRequest>(
      decisionRequestRef,
      {
        expectedAuthorityVersion: snapshot.authorityVersion,
        revisionId: input.revisionId,
        decision: input.decision,
        note: input.note,
      },
    );
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/shot-plan/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      const body = await responseBody(response);
      if (!response.ok) {
        const message = response.status === 409
          ? await handleConflict(body)
          : responseMessage(body, "The producer decision could not be recorded");
        throw new Error(message);
      }
      const receipt = parseProjectShotPlanDecisionReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId ||
        receipt.shotPlanRevisionId !== input.revisionId ||
        receipt.requestId !== request.requestId
      ) {
        throw new Error("The producer decision returned an invalid receipt");
      }
      decisionRequestRef.current = null;
      await load(false);
      setAnnouncement(
        receipt.replayed
          ? "The producer decision was already recorded"
          : "Producer decision recorded",
      );
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The producer decision could not be recorded",
      );
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, handleConflict, load, projectId, snapshot]);

  return {
    snapshot,
    loading,
    ready,
    error,
    conflict,
    operation,
    announcement,
    reload,
    generateRevision,
    appendRevision,
    submitRevision,
    decideRevision,
  };
}
