"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseProductionPlanReceipt,
  parseProductionPlanSnapshot,
  parseProductionTaskMutationReceipt,
  type ProductionPlanInitialization,
  type ProductionPlanSnapshot,
  type ProductionTaskStatus,
} from "@/lib/preproduction/production-plan";

interface ProjectProductionPlanState {
  snapshot: ProductionPlanSnapshot | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  initializing: boolean;
  pendingTaskIds: ReadonlySet<string>;
  announcement: string;
  reload: () => Promise<void>;
  initializePlan: (plan: ProductionPlanInitialization) => Promise<boolean>;
  setTaskStatus: (taskId: string, status: ProductionTaskStatus) => Promise<boolean>;
}

function responseMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

export function useProjectProductionPlan(
  projectId: string,
  enabled: boolean,
): ProjectProductionPlanState {
  const [snapshot, setSnapshot] = useState<ProductionPlanSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  const requestVersionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const initializationPendingRef = useRef(false);

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
        `/api/projects/${encodeURIComponent(projectId)}/production-plan`,
        { cache: "no-store", signal: controller.signal },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseMessage(body, "Production tasks could not be loaded"));
      }
      const nextSnapshot = parseProductionPlanSnapshot(body);
      if (!nextSnapshot || nextSnapshot.projectId !== projectId) {
        throw new Error("Production tasks returned an invalid snapshot");
      }
      if (requestVersionRef.current !== requestVersion) return;
      setSnapshot(nextSnapshot);
      setReady(true);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      if (requestVersionRef.current !== requestVersion) return;
      setError(caught instanceof Error ? caught.message : "Production tasks could not be loaded");
    } finally {
      if (requestVersionRef.current === requestVersion) setLoading(false);
    }
  }, [enabled, projectId]);

  useEffect(() => {
    if (!enabled) {
      requestVersionRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setSnapshot(null);
      setLoading(false);
      setReady(false);
      setError(null);
      setInitializing(false);
      setPendingTaskIds(new Set());
      return;
    }
    void reload();
    return () => {
      requestVersionRef.current += 1;
      abortRef.current?.abort();
    };
  }, [enabled, projectId, reload]);

  const initializePlan = useCallback(async (plan: ProductionPlanInitialization) => {
    const expectedRevision = snapshot?.plan?.revisionNumber ?? 0;
    if (
      !enabled ||
      !snapshot ||
      snapshot.plan ||
      !snapshot.canInitialize ||
      initializationPendingRef.current ||
      initializing
    ) {
      return false;
    }
    if (plan.expectedPlanRevision !== expectedRevision) {
      setError("The production plan changed elsewhere. Reload before trying again.");
      return false;
    }

    initializationPendingRef.current = true;
    setInitializing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/production-plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(plan),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = responseMessage(body, "The production plan could not be initialized");
        if (response.status === 409) await reload();
        throw new Error(message);
      }
      const receipt = parseProductionPlanReceipt(body);
      if (
        !receipt ||
        receipt.projectId !== projectId ||
        receipt.requestId !== plan.requestId
      ) {
        throw new Error("The production plan returned an invalid receipt");
      }
      await reload();
      setAnnouncement(receipt.replayed ? "Production plan was already initialized" : "Production plan initialized");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The production plan could not be initialized");
      return false;
    } finally {
      initializationPendingRef.current = false;
      setInitializing(false);
    }
  }, [enabled, initializing, projectId, reload, snapshot]);

  const setTaskStatus = useCallback(async (
    taskId: string,
    status: ProductionTaskStatus,
  ) => {
    const task = snapshot?.tasks.find((candidate) => candidate.id === taskId);
    if (!task || pendingTaskIds.has(taskId)) return false;
    setPendingTaskIds((current) => new Set(current).add(taskId));
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/production-tasks/${encodeURIComponent(taskId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: task.authorityVersion,
            requestId: crypto.randomUUID(),
            patch: { status },
          }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = responseMessage(body, "The task could not be updated");
        if (response.status === 409) await reload();
        throw new Error(message);
      }
      const receipt = parseProductionTaskMutationReceipt(body);
      if (!receipt || receipt.taskId !== taskId || receipt.projectId !== projectId) {
        throw new Error("The task update returned an invalid receipt");
      }
      setSnapshot((current) => current ? {
        ...current,
        authorityVersion: receipt.authorityVersion,
        tasks: current.tasks.map((candidate) => candidate.id === taskId
          ? {
              ...candidate,
              status: receipt.status,
              authorityVersion: receipt.taskAuthorityVersion,
              updatedAt: new Date().toISOString(),
            }
          : candidate),
      } : current);
      setAnnouncement(status === "completed" ? "Task completed" : "Task reopened");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The task could not be updated");
      return false;
    } finally {
      setPendingTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }, [pendingTaskIds, projectId, reload, snapshot]);

  return {
    snapshot,
    loading,
    ready,
    error,
    initializing,
    pendingTaskIds,
    announcement,
    reload,
    initializePlan,
    setTaskStatus,
  };
}
