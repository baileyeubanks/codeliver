"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseProjectProductionScheduleAppendReceipt,
  parseProjectProductionScheduleDecisionReceipt,
  parseProjectProductionScheduleGenerateReceipt,
  parseProjectProductionScheduleSnapshot,
  parseProjectProductionScheduleSubmitReceipt,
  type ProjectProductionScheduleAppendRequest,
  type ProjectProductionScheduleContent,
  type ProjectProductionScheduleDecision,
  type ProjectProductionScheduleDecisionRequest,
  type ProjectProductionScheduleGenerateRequest,
  type ProjectProductionScheduleSnapshot,
  type ProjectProductionScheduleSubmitRequest,
} from "@/lib/preproduction/production-schedule";

export interface AppendProjectProductionScheduleRevisionInput {
  content: ProjectProductionScheduleContent;
  changeSummary: string | null;
}

export interface SubmitProjectProductionScheduleRevisionInput {
  revisionId: string;
  note: string | null;
}

export interface DecideProjectProductionScheduleRevisionInput {
  revisionId: string;
  decision: ProjectProductionScheduleDecision;
  note: string | null;
}

export type ProjectProductionScheduleOperation =
  | "generate"
  | "save"
  | "submit"
  | "decision"
  | null;

interface PendingRequest<T> {
  fingerprint: string;
  request: T;
}

export interface ProjectProductionScheduleHookState {
  snapshot: ProjectProductionScheduleSnapshot | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  conflict: string | null;
  operation: ProjectProductionScheduleOperation;
  announcement: string;
  reload: () => Promise<void>;
  generateRevision: () => Promise<boolean>;
  appendRevision: (
    input: AppendProjectProductionScheduleRevisionInput,
  ) => Promise<boolean>;
  submitRevision: (
    input: SubmitProjectProductionScheduleRevisionInput,
  ) => Promise<boolean>;
  decideRevision: (
    input: DecideProjectProductionScheduleRevisionInput,
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

export function useProjectProductionSchedule(
  projectId: string,
  enabled: boolean,
): ProjectProductionScheduleHookState {
  const [snapshot, setSnapshot] =
    useState<ProjectProductionScheduleSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [operation, setOperation] =
    useState<ProjectProductionScheduleOperation>(null);
  const [announcement, setAnnouncement] = useState("");
  const requestVersionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const operationRef = useRef<ProjectProductionScheduleOperation>(null);
  const generateRequestRef =
    useRef<PendingRequest<ProjectProductionScheduleGenerateRequest> | null>(
      null,
    );
  const appendRequestRef =
    useRef<PendingRequest<ProjectProductionScheduleAppendRequest> | null>(null);
  const submitRequestRef =
    useRef<PendingRequest<ProjectProductionScheduleSubmitRequest> | null>(null);
  const decisionRequestRef =
    useRef<PendingRequest<ProjectProductionScheduleDecisionRequest> | null>(
      null,
    );

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
        `/api/projects/${encodeURIComponent(projectId)}/production-schedule`,
        { cache: "no-store", signal: controller.signal },
      );
      const body = await responseBody(response);
      if (!response.ok) {
        throw new Error(
          responseMessage(
            body,
            "The project production schedule could not be loaded",
          ),
        );
      }
      const nextSnapshot = parseProjectProductionScheduleSnapshot(body);
      if (!nextSnapshot || nextSnapshot.projectId !== projectId.toLowerCase()) {
        throw new Error(
          "The project production schedule returned an invalid snapshot",
        );
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
          : "The project production schedule could not be loaded",
      );
    } finally {
      if (requestVersionRef.current === requestVersion) setLoading(false);
    }
  }, [enabled, projectId]);

  const reload = useCallback(async () => {
    await load(false);
  }, [load]);

  useEffect(() => {
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

    if (!enabled || !projectId) return;
    void reload();
    return () => {
      requestVersionRef.current += 1;
      abortRef.current?.abort();
    };
  }, [enabled, projectId, reload]);

  const handleConflict = useCallback(async (body: unknown) => {
    const message = responseMessage(
      body,
      "The production schedule or its approved shot plan changed elsewhere. The latest state has been loaded; review it before retrying.",
    );
    setConflict(message);
    await load(true);
    return message;
  }, [load]);

  const beginOperation = useCallback(
    (nextOperation: Exclude<ProjectProductionScheduleOperation, null>) => {
      if (!enabled || !projectId || operationRef.current !== null) return false;
      operationRef.current = nextOperation;
      setOperation(nextOperation);
      setError(null);
      setAnnouncement("");
      return true;
    },
    [enabled, projectId],
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
    const request = requestFor<ProjectProductionScheduleGenerateRequest>(
      generateRequestRef,
      {
        expectedAuthorityVersion: snapshot.authorityVersion,
        expectedShotPlanRevisionId: source.shotPlanRevisionId,
      },
    );
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/production-schedule/generate`,
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
          : responseMessage(
              body,
              "The production schedule revision could not be generated",
            );
        throw new Error(message);
      }
      const receipt = parseProjectProductionScheduleGenerateReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId.toLowerCase() ||
        receipt.source.shotPlanRevisionId !== source.shotPlanRevisionId ||
        receipt.source.shotPlanApprovalBindingId !==
          source.shotPlanApprovalBindingId ||
        receipt.requestId !== request.requestId
      ) {
        throw new Error(
          "The production schedule generation returned an invalid receipt",
        );
      }
      generateRequestRef.current = null;
      await load(false);
      setAnnouncement(
        receipt.replayed
          ? "The governed production schedule revision was already generated"
          : "Governed production schedule revision generated",
      );
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The production schedule revision could not be generated",
      );
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, handleConflict, load, projectId, snapshot]);

  const appendRevision = useCallback(async (
    input: AppendProjectProductionScheduleRevisionInput,
  ) => {
    if (
      !snapshot?.head ||
      !snapshot.permissions.canRevise ||
      !beginOperation("save")
    ) {
      return false;
    }
    const request = requestFor<ProjectProductionScheduleAppendRequest>(
      appendRequestRef,
      {
        expectedAuthorityVersion: snapshot.authorityVersion,
        baseRevisionId: snapshot.head.revisionId,
        changeSummary: input.changeSummary,
        content: input.content,
      },
    );
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/production-schedule`,
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
          : responseMessage(
              body,
              "The production schedule revision could not be saved",
            );
        throw new Error(message);
      }
      const receipt = parseProjectProductionScheduleAppendReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId.toLowerCase() ||
        receipt.requestId !== request.requestId
      ) {
        throw new Error(
          "The production schedule revision returned an invalid receipt",
        );
      }
      appendRequestRef.current = null;
      await load(false);
      setAnnouncement(
        receipt.replayed
          ? "The production schedule revision was already saved"
          : "Production schedule revision saved",
      );
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The production schedule revision could not be saved",
      );
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, handleConflict, load, projectId, snapshot]);

  const submitRevision = useCallback(async (
    input: SubmitProjectProductionScheduleRevisionInput,
  ) => {
    if (!snapshot?.permissions.canSubmit || !beginOperation("submit")) {
      return false;
    }
    const request = requestFor<ProjectProductionScheduleSubmitRequest>(
      submitRequestRef,
      {
        expectedAuthorityVersion: snapshot.authorityVersion,
        revisionId: input.revisionId,
        note: input.note,
      },
    );
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/production-schedule/submit`,
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
          : responseMessage(
              body,
              "The production schedule revision could not be submitted",
            );
        throw new Error(message);
      }
      const receipt = parseProjectProductionScheduleSubmitReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId.toLowerCase() ||
        receipt.productionScheduleRevisionId !== input.revisionId.toLowerCase() ||
        receipt.requestId !== request.requestId
      ) {
        throw new Error(
          "The production schedule submission returned an invalid receipt",
        );
      }
      submitRequestRef.current = null;
      await load(false);
      setAnnouncement(
        receipt.replayed
          ? "The production schedule submission was already recorded"
          : "Production schedule submitted for producer review",
      );
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The production schedule revision could not be submitted",
      );
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, handleConflict, load, projectId, snapshot]);

  const decideRevision = useCallback(async (
    input: DecideProjectProductionScheduleRevisionInput,
  ) => {
    if (!snapshot?.permissions.canDecide || !beginOperation("decision")) {
      return false;
    }
    const request = requestFor<ProjectProductionScheduleDecisionRequest>(
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
        `/api/projects/${encodeURIComponent(projectId)}/production-schedule/decision`,
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
          : responseMessage(
              body,
              "The producer decision could not be recorded",
            );
        throw new Error(message);
      }
      const receipt = parseProjectProductionScheduleDecisionReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId.toLowerCase() ||
        receipt.productionScheduleRevisionId !== input.revisionId.toLowerCase() ||
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
