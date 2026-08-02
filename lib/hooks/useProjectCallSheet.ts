"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeProjectCallSheetScheduleDayId,
  parseProjectCallSheetAppendReceipt,
  parseProjectCallSheetDecisionReceipt,
  parseProjectCallSheetGenerateReceipt,
  parseProjectCallSheetSnapshot,
  parseProjectCallSheetSubmitReceipt,
  type ProjectCallSheetAppendRequest,
  type ProjectCallSheetContent,
  type ProjectCallSheetDecision,
  type ProjectCallSheetDecisionRequest,
  type ProjectCallSheetGenerateRequest,
  type ProjectCallSheetSnapshot,
  type ProjectCallSheetSubmitRequest,
} from "@/lib/preproduction/call-sheet";

export interface AppendProjectCallSheetRevisionInput {
  content: ProjectCallSheetContent;
  changeSummary: string | null;
}

export type SaveProjectCallSheetRevisionInput =
  AppendProjectCallSheetRevisionInput;

export interface SubmitProjectCallSheetRevisionInput {
  revisionId: string;
  note: string | null;
}

export interface DecideProjectCallSheetRevisionInput {
  revisionId: string;
  decision: ProjectCallSheetDecision;
  note: string | null;
}

export type ProjectCallSheetOperation =
  | "generate"
  | "save"
  | "submit"
  | "decision"
  | null;

interface PendingRequest<T> {
  fingerprint: string;
  request: T;
}

export interface ProjectCallSheetHookState {
  snapshot: ProjectCallSheetSnapshot | null;
  selectedScheduleDayId: string | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  conflict: string | null;
  operation: ProjectCallSheetOperation;
  announcement: string;
  selectDay: (scheduleDayId: string | null) => boolean;
  selectScheduleDay: (scheduleDayId: string | null) => boolean;
  reload: () => Promise<void>;
  generateRevision: () => Promise<boolean>;
  appendRevision: (
    input: AppendProjectCallSheetRevisionInput,
  ) => Promise<boolean>;
  saveRevision: (
    input: SaveProjectCallSheetRevisionInput,
  ) => Promise<boolean>;
  submitRevision: (
    input: SubmitProjectCallSheetRevisionInput,
  ) => Promise<boolean>;
  decideRevision: (
    input: DecideProjectCallSheetRevisionInput,
  ) => Promise<boolean>;
}

function responseMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
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

function initialDayId(value: string | null) {
  if (value === null) return null;
  try {
    return normalizeProjectCallSheetScheduleDayId(value);
  } catch {
    return null;
  }
}

export function useProjectCallSheet(
  projectId: string,
  enabled: boolean,
  initialScheduleDayId: string | null = null,
): ProjectCallSheetHookState {
  const [selectedScheduleDayId, setSelectedScheduleDayId] = useState<
    string | null
  >(() => initialDayId(initialScheduleDayId));
  const [snapshot, setSnapshot] = useState<ProjectCallSheetSnapshot | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [operation, setOperation] = useState<ProjectCallSheetOperation>(null);
  const [announcement, setAnnouncement] = useState("");
  const requestVersionRef = useRef(0);
  const contextVersionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const operationRef = useRef<ProjectCallSheetOperation>(null);
  const operationContextRef = useRef<number | null>(null);
  const adoptedBootstrapDayRef = useRef<string | null>(null);
  const generateRequestRef =
    useRef<PendingRequest<ProjectCallSheetGenerateRequest> | null>(null);
  const appendRequestRef =
    useRef<PendingRequest<ProjectCallSheetAppendRequest> | null>(null);
  const submitRequestRef =
    useRef<PendingRequest<ProjectCallSheetSubmitRequest> | null>(null);
  const decisionRequestRef =
    useRef<PendingRequest<ProjectCallSheetDecisionRequest> | null>(null);

  const load = useCallback(
    async (preserveConflict: boolean) => {
      if (!enabled || !projectId) return;
      const contextVersion = contextVersionRef.current;
      const requestVersion = ++requestVersionRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      if (!preserveConflict) setConflict(null);

      try {
        const endpoint = selectedScheduleDayId
          ? `/api/projects/${encodeURIComponent(projectId)}/call-sheet?dayId=${encodeURIComponent(selectedScheduleDayId)}`
          : `/api/projects/${encodeURIComponent(projectId)}/call-sheet`;
        const response = await fetch(
          endpoint,
          { cache: "no-store", signal: controller.signal },
        );
        const body = await responseBody(response);
        if (!response.ok) {
          throw new Error(
            responseMessage(body, "The project call sheet could not be loaded"),
          );
        }
        const nextSnapshot = parseProjectCallSheetSnapshot(body);
        if (
          !nextSnapshot ||
          nextSnapshot.projectId !== projectId.toLowerCase() ||
          (selectedScheduleDayId !== null &&
            nextSnapshot.selectedScheduleDayId !== selectedScheduleDayId)
        ) {
          throw new Error("The project call sheet returned an invalid snapshot");
        }
        if (
          contextVersionRef.current !== contextVersion ||
          requestVersionRef.current !== requestVersion
        ) {
          return;
        }
        setSnapshot(nextSnapshot);
        setReady(true);
        if (
          selectedScheduleDayId === null &&
          nextSnapshot.selectedScheduleDayId !== null
        ) {
          adoptedBootstrapDayRef.current =
            nextSnapshot.selectedScheduleDayId;
          setSelectedScheduleDayId(nextSnapshot.selectedScheduleDayId);
        }
      } catch (caught) {
        if (
          isAbortError(caught) ||
          contextVersionRef.current !== contextVersion ||
          requestVersionRef.current !== requestVersion
        ) {
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "The project call sheet could not be loaded",
        );
      } finally {
        if (
          contextVersionRef.current === contextVersion &&
          requestVersionRef.current === requestVersion
        ) {
          setLoading(false);
        }
      }
    },
    [enabled, projectId, selectedScheduleDayId],
  );

  const reload = useCallback(async () => {
    await load(false);
  }, [load]);

  useEffect(() => {
    if (
      adoptedBootstrapDayRef.current !== null &&
      adoptedBootstrapDayRef.current === selectedScheduleDayId
    ) {
      adoptedBootstrapDayRef.current = null;
      return () => {
        contextVersionRef.current += 1;
        requestVersionRef.current += 1;
        abortRef.current?.abort();
      };
    }
    contextVersionRef.current += 1;
    requestVersionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    operationRef.current = null;
    operationContextRef.current = null;
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
      contextVersionRef.current += 1;
      requestVersionRef.current += 1;
      abortRef.current?.abort();
    };
  }, [enabled, projectId, reload, selectedScheduleDayId]);

  const selectDay = useCallback((scheduleDayId: string | null) => {
    if (operationRef.current !== null) return false;
    if (scheduleDayId === null) {
      setSelectedScheduleDayId(null);
      return true;
    }
    try {
      setSelectedScheduleDayId(
        normalizeProjectCallSheetScheduleDayId(scheduleDayId),
      );
      return true;
    } catch {
      setError("The selected production schedule day is invalid");
      return false;
    }
  }, []);

  const handleConflict = useCallback(
    async (body: unknown, contextVersion: number) => {
      const message = responseMessage(
        body,
        "The call sheet or its approved production schedule day changed elsewhere. The latest state has been loaded; review it before retrying.",
      );
      if (contextVersionRef.current !== contextVersion) return message;
      setConflict(message);
      await load(true);
      return message;
    },
    [load],
  );

  const beginOperation = useCallback(
    (nextOperation: Exclude<ProjectCallSheetOperation, null>) => {
      if (
        !enabled ||
        !projectId ||
        !selectedScheduleDayId ||
        operationRef.current !== null
      ) {
        return null;
      }
      const contextVersion = contextVersionRef.current;
      operationRef.current = nextOperation;
      operationContextRef.current = contextVersion;
      setOperation(nextOperation);
      setError(null);
      setAnnouncement("");
      return contextVersion;
    },
    [enabled, projectId, selectedScheduleDayId],
  );

  const endOperation = useCallback((contextVersion: number) => {
    if (operationContextRef.current !== contextVersion) return;
    operationRef.current = null;
    operationContextRef.current = null;
    setOperation(null);
  }, []);

  const generateRevision = useCallback(async () => {
    if (
      !snapshot?.source ||
      !selectedScheduleDayId ||
      snapshot.source.scheduleDayId !== selectedScheduleDayId ||
      !snapshot.permissions.canGenerate
    ) {
      return false;
    }
    const contextVersion = beginOperation("generate");
    if (contextVersion === null) return false;
    const source = snapshot.source;
    const request = requestFor<ProjectCallSheetGenerateRequest>(
      generateRequestRef,
      {
        expectedAuthorityVersion: snapshot.authorityVersion,
        expectedProductionScheduleRevisionId:
          source.productionScheduleRevisionId,
        scheduleDayId: selectedScheduleDayId,
      },
    );
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/call-sheet/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      const body = await responseBody(response);
      if (contextVersionRef.current !== contextVersion) return false;
      if (!response.ok) {
        const message =
          response.status === 409
            ? await handleConflict(body, contextVersion)
            : responseMessage(
                body,
                "The call-sheet revision could not be generated",
              );
        throw new Error(message);
      }
      const receipt = parseProjectCallSheetGenerateReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId.toLowerCase() ||
        receipt.source.productionScheduleRevisionId !==
          source.productionScheduleRevisionId ||
        receipt.source.productionScheduleApprovalBindingId !==
          source.productionScheduleApprovalBindingId ||
        receipt.source.scheduleDayId !== selectedScheduleDayId ||
        receipt.requestId !== request.requestId
      ) {
        throw new Error("Call-sheet generation returned an invalid receipt");
      }
      generateRequestRef.current = null;
      await load(false);
      if (contextVersionRef.current !== contextVersion) return false;
      setAnnouncement(
        receipt.replayed
          ? "The governed call-sheet revision was already generated"
          : "Governed call-sheet revision generated",
      );
      return true;
    } catch (caught) {
      if (contextVersionRef.current === contextVersion) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The call-sheet revision could not be generated",
        );
      }
      return false;
    } finally {
      endOperation(contextVersion);
    }
  }, [
    beginOperation,
    endOperation,
    handleConflict,
    load,
    projectId,
    selectedScheduleDayId,
    snapshot,
  ]);

  const appendRevision = useCallback(
    async (input: AppendProjectCallSheetRevisionInput) => {
      if (
        !snapshot?.head ||
        !selectedScheduleDayId ||
        input.content.scheduleDayId !== selectedScheduleDayId ||
        !snapshot.permissions.canRevise
      ) {
        return false;
      }
      const contextVersion = beginOperation("save");
      if (contextVersion === null) return false;
      const request = requestFor<ProjectCallSheetAppendRequest>(
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
          `/api/projects/${encodeURIComponent(projectId)}/call-sheet`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          },
        );
        const body = await responseBody(response);
        if (contextVersionRef.current !== contextVersion) return false;
        if (!response.ok) {
          const message =
            response.status === 409
              ? await handleConflict(body, contextVersion)
              : responseMessage(
                  body,
                  "The call-sheet revision could not be saved",
                );
          throw new Error(message);
        }
        const receipt = parseProjectCallSheetAppendReceipt(body);
        if (
          !receipt ||
          receipt.projectId !== projectId.toLowerCase() ||
          receipt.baseRevisionId !== request.baseRevisionId ||
          receipt.source.scheduleDayId !== selectedScheduleDayId ||
          receipt.requestId !== request.requestId
        ) {
          throw new Error("The call-sheet revision returned an invalid receipt");
        }
        appendRequestRef.current = null;
        await load(false);
        if (contextVersionRef.current !== contextVersion) return false;
        setAnnouncement(
          receipt.replayed
            ? "The call-sheet revision was already saved"
            : "Call-sheet revision saved",
        );
        return true;
      } catch (caught) {
        if (contextVersionRef.current === contextVersion) {
          setError(
            caught instanceof Error
              ? caught.message
              : "The call-sheet revision could not be saved",
          );
        }
        return false;
      } finally {
        endOperation(contextVersion);
      }
    },
    [
      beginOperation,
      endOperation,
      handleConflict,
      load,
      projectId,
      selectedScheduleDayId,
      snapshot,
    ],
  );

  const submitRevision = useCallback(
    async (input: SubmitProjectCallSheetRevisionInput) => {
      if (!snapshot?.permissions.canSubmit) return false;
      const contextVersion = beginOperation("submit");
      if (contextVersion === null) return false;
      const request = requestFor<ProjectCallSheetSubmitRequest>(
        submitRequestRef,
        {
          expectedAuthorityVersion: snapshot.authorityVersion,
          revisionId: input.revisionId,
          note: input.note,
        },
      );
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/call-sheet/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          },
        );
        const body = await responseBody(response);
        if (contextVersionRef.current !== contextVersion) return false;
        if (!response.ok) {
          const message =
            response.status === 409
              ? await handleConflict(body, contextVersion)
              : responseMessage(
                  body,
                  "The call-sheet revision could not be submitted",
                );
          throw new Error(message);
        }
        const receipt = parseProjectCallSheetSubmitReceipt(body);
        if (
          !receipt ||
          receipt.projectId !== projectId.toLowerCase() ||
          receipt.scheduleDayId !== selectedScheduleDayId ||
          receipt.callSheetRevisionId !== input.revisionId.toLowerCase() ||
          receipt.requestId !== request.requestId
        ) {
          throw new Error("The call-sheet submission returned an invalid receipt");
        }
        submitRequestRef.current = null;
        await load(false);
        if (contextVersionRef.current !== contextVersion) return false;
        setAnnouncement(
          receipt.replayed
            ? "The call-sheet submission was already recorded"
            : "Call sheet submitted for producer review",
        );
        return true;
      } catch (caught) {
        if (contextVersionRef.current === contextVersion) {
          setError(
            caught instanceof Error
              ? caught.message
              : "The call-sheet revision could not be submitted",
          );
        }
        return false;
      } finally {
        endOperation(contextVersion);
      }
    },
    [
      beginOperation,
      endOperation,
      handleConflict,
      load,
      projectId,
      selectedScheduleDayId,
      snapshot,
    ],
  );

  const decideRevision = useCallback(
    async (input: DecideProjectCallSheetRevisionInput) => {
      if (!snapshot?.permissions.canDecide) return false;
      const contextVersion = beginOperation("decision");
      if (contextVersion === null) return false;
      const request = requestFor<ProjectCallSheetDecisionRequest>(
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
          `/api/projects/${encodeURIComponent(projectId)}/call-sheet/decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          },
        );
        const body = await responseBody(response);
        if (contextVersionRef.current !== contextVersion) return false;
        if (!response.ok) {
          const message =
            response.status === 409
              ? await handleConflict(body, contextVersion)
              : responseMessage(
                  body,
                  "The producer decision could not be recorded",
                );
          throw new Error(message);
        }
        const receipt = parseProjectCallSheetDecisionReceipt(body);
        if (
          !receipt ||
          receipt.projectId !== projectId.toLowerCase() ||
          receipt.scheduleDayId !== selectedScheduleDayId ||
          receipt.callSheetRevisionId !== input.revisionId.toLowerCase() ||
          receipt.requestId !== request.requestId
        ) {
          throw new Error("The producer decision returned an invalid receipt");
        }
        decisionRequestRef.current = null;
        await load(false);
        if (contextVersionRef.current !== contextVersion) return false;
        setAnnouncement(
          receipt.replayed
            ? "The producer decision was already recorded"
            : "Producer decision recorded",
        );
        return true;
      } catch (caught) {
        if (contextVersionRef.current === contextVersion) {
          setError(
            caught instanceof Error
              ? caught.message
              : "The producer decision could not be recorded",
          );
        }
        return false;
      } finally {
        endOperation(contextVersion);
      }
    },
    [
      beginOperation,
      endOperation,
      handleConflict,
      load,
      projectId,
      selectedScheduleDayId,
      snapshot,
    ],
  );

  return {
    snapshot,
    selectedScheduleDayId,
    loading,
    ready,
    error,
    conflict,
    operation,
    announcement,
    selectDay,
    selectScheduleDay: selectDay,
    reload,
    generateRevision,
    appendRevision,
    saveRevision: appendRevision,
    submitRevision,
    decideRevision,
  };
}
