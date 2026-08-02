"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseProjectScriptAppendReceipt,
  parseProjectScriptDecisionReceipt,
  parseProjectScriptSnapshot,
  parseProjectScriptSubmitReceipt,
  type ProjectScriptAppendReceipt,
  type ProjectScriptAppendRequest,
  type ProjectScriptDecisionReceipt,
  type ProjectScriptDecisionRequest,
  type ProjectScriptSnapshot,
  type ProjectScriptSubmitReceipt,
  type ProjectScriptSubmitRequest,
} from "@/lib/preproduction/project-script";

export type AppendProjectScriptRevisionInput = Omit<
  ProjectScriptAppendRequest,
  "requestId"
>;
export type SubmitProjectScriptRevisionInput = Omit<
  ProjectScriptSubmitRequest,
  "requestId"
>;
export type DecideProjectScriptRevisionInput = Omit<
  ProjectScriptDecisionRequest,
  "requestId"
>;

export type ProjectScriptOperation = "save" | "submit" | "decision" | null;

interface PendingRequest<T> {
  fingerprint: string;
  request: T;
}

export interface ProjectScriptHookState {
  snapshot: ProjectScriptSnapshot | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  conflict: string | null;
  operation: ProjectScriptOperation;
  announcement: string;
  reload: () => Promise<void>;
  appendRevision: (input: AppendProjectScriptRevisionInput) => Promise<boolean>;
  submitRevision: (input: SubmitProjectScriptRevisionInput) => Promise<boolean>;
  decideRevision: (input: DecideProjectScriptRevisionInput) => Promise<boolean>;
}

function responseMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

function isAbortError(value: unknown) {
  return value instanceof DOMException && value.name === "AbortError";
}

function fingerprint(value: unknown) {
  return JSON.stringify(value);
}

function requestFor<T extends { requestId: string }>(
  reference: { current: PendingRequest<T> | null },
  input: Omit<T, "requestId">,
): T {
  const nextFingerprint = fingerprint(input);
  if (reference.current?.fingerprint === nextFingerprint) {
    return reference.current.request;
  }
  const request = { ...input, requestId: crypto.randomUUID() } as T;
  reference.current = { fingerprint: nextFingerprint, request };
  return request;
}

async function responseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export function useProjectScript(
  projectId: string,
  enabled: boolean,
): ProjectScriptHookState {
  const [snapshot, setSnapshot] = useState<ProjectScriptSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [operation, setOperation] = useState<ProjectScriptOperation>(null);
  const [announcement, setAnnouncement] = useState("");
  const requestVersionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const operationRef = useRef<ProjectScriptOperation>(null);
  const appendRequestRef = useRef<PendingRequest<ProjectScriptAppendRequest> | null>(null);
  const submitRequestRef = useRef<PendingRequest<ProjectScriptSubmitRequest> | null>(null);
  const decisionRequestRef = useRef<PendingRequest<ProjectScriptDecisionRequest> | null>(null);

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
        `/api/projects/${encodeURIComponent(projectId)}/script`,
        { cache: "no-store", signal: controller.signal },
      );
      const body = await responseBody(response);
      if (!response.ok) {
        throw new Error(responseMessage(body, "The project script could not be loaded"));
      }
      const nextSnapshot = parseProjectScriptSnapshot(body);
      if (!nextSnapshot || nextSnapshot.projectId !== projectId) {
        throw new Error("The project script returned an invalid snapshot");
      }
      if (requestVersionRef.current !== requestVersion) return;
      setSnapshot(nextSnapshot);
      setReady(true);
    } catch (caught) {
      if (isAbortError(caught) || requestVersionRef.current !== requestVersion) return;
      setError(caught instanceof Error ? caught.message : "The project script could not be loaded");
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
    appendRequestRef.current = null;
    submitRequestRef.current = null;
    decisionRequestRef.current = null;
    setSnapshot(null);
    setLoading(false);
    setReady(false);
    setError(null);
    setConflict(null);
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
      "The script changed elsewhere. The latest revision has been loaded; review it before retrying.",
    );
    setConflict(message);
    await load(true);
    return message;
  }, [load]);

  const beginOperation = useCallback((nextOperation: Exclude<ProjectScriptOperation, null>) => {
    if (!enabled || operationRef.current !== null) return false;
    operationRef.current = nextOperation;
    setOperation(nextOperation);
    setError(null);
    setAnnouncement("");
    return true;
  }, [enabled]);

  const endOperation = useCallback(() => {
    operationRef.current = null;
    setOperation(null);
  }, []);

  const appendRevision = useCallback(async (input: AppendProjectScriptRevisionInput) => {
    if (!beginOperation("save")) return false;
    const request = requestFor<ProjectScriptAppendRequest>(appendRequestRef, input);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/script`,
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
          : responseMessage(body, "The script revision could not be saved");
        throw new Error(message);
      }
      const receipt: ProjectScriptAppendReceipt | null =
        parseProjectScriptAppendReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId ||
        receipt.requestId !== request.requestId
      ) {
        throw new Error("The script revision returned an invalid receipt");
      }
      appendRequestRef.current = null;
      await load(false);
      setAnnouncement(receipt.replayed ? "Script revision was already saved" : "Script revision saved");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The script revision could not be saved");
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, handleConflict, load, projectId]);

  const submitRevision = useCallback(async (input: SubmitProjectScriptRevisionInput) => {
    if (!beginOperation("submit")) return false;
    const request = requestFor<ProjectScriptSubmitRequest>(submitRequestRef, input);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/script/submit`,
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
          : responseMessage(body, "The script revision could not be submitted");
        throw new Error(message);
      }
      const receipt: ProjectScriptSubmitReceipt | null = parseProjectScriptSubmitReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId ||
        receipt.revisionId !== request.revisionId ||
        receipt.requestId !== request.requestId
      ) {
        throw new Error("The script submission returned an invalid receipt");
      }
      submitRequestRef.current = null;
      await load(false);
      setAnnouncement(receipt.replayed ? "Script submission was already recorded" : "Script submitted for review");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The script revision could not be submitted");
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, handleConflict, load, projectId]);

  const decideRevision = useCallback(async (input: DecideProjectScriptRevisionInput) => {
    if (!beginOperation("decision")) return false;
    const request = requestFor<ProjectScriptDecisionRequest>(decisionRequestRef, input);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/script/decision`,
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
      const receipt: ProjectScriptDecisionReceipt | null = parseProjectScriptDecisionReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId ||
        receipt.revisionId !== request.revisionId ||
        receipt.requestId !== request.requestId
      ) {
        throw new Error("The producer decision returned an invalid receipt");
      }
      decisionRequestRef.current = null;
      await load(false);
      setAnnouncement(receipt.replayed ? "Producer decision was already recorded" : "Producer decision recorded");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The producer decision could not be recorded");
      return false;
    } finally {
      endOperation();
    }
  }, [beginOperation, endOperation, handleConflict, load, projectId]);

  return {
    snapshot,
    loading,
    ready,
    error,
    conflict,
    operation,
    announcement,
    reload,
    appendRevision,
    submitRevision,
    decideRevision,
  };
}
