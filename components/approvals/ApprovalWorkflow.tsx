"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Loader2,
  Pencil,
} from "lucide-react";
import type {
  ApprovalWorkflow as WorkflowType,
  WorkflowMode,
} from "@/lib/types/codeliver";
import ApprovalTimeline from "./ApprovalTimeline";

interface StepDraft {
  role_label: string;
  assignee_email: string;
}

interface ApprovalWorkflowProps {
  assetId: string;
  workflow?: WorkflowType | null;
  onUpdate?: () => void;
}

export default function ApprovalWorkflow({
  assetId,
  workflow,
  onUpdate,
}: ApprovalWorkflowProps) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<WorkflowMode>(workflow?.mode ?? "sequential");
  const [steps, setSteps] = useState<StepDraft[]>(
    workflow?.steps?.map((s) => ({
      role_label: s.role_label,
      assignee_email: s.assignee_email ?? "",
    })) ?? []
  );

  function addStep() {
    setSteps((prev) => [...prev, { role_label: "", assignee_email: "" }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateStep(index: number, field: keyof StepDraft, value: string) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  async function handleSave() {
    const valid = steps.filter(
      (s) => s.role_label.trim() && s.assignee_email.trim()
    );
    if (valid.length === 0) return;
    setSaving(true);
    try {
      const method = workflow ? "PUT" : "POST";
      const body = workflow
        ? {
            workflow_id: workflow.id,
            mode,
            steps: valid.map((s, i) => ({ ...s, step_order: i + 1 })),
          }
        : {
            asset_id: assetId,
            mode,
            steps: valid.map((s, i) => ({ ...s, step_order: i + 1 })),
          };

      const res = await fetch("/api/approvals/workflow", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save workflow");
      setCreating(false);
      setEditing(false);
      onUpdate?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!workflow) return;
    setSaving(true);
    try {
      const res = await fetch("/api/approvals/workflow", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id: workflow.id }),
      });
      if (!res.ok) throw new Error("Failed to delete workflow");
      onUpdate?.();
    } finally {
      setSaving(false);
    }
  }

  // No workflow exists — show create button
  if (!workflow && !creating) {
    return (
      <button
        onClick={() => setCreating(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--radius)] border border-dashed border-[var(--border)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors"
      >
        <Plus className="w-4 h-4" />
        Create Approval Workflow
      </button>
    );
  }

  // View mode — workflow exists and not editing
  if (workflow && !editing) {
    const currentStep =
      workflow.mode === "sequential"
        ? (workflow.steps ?? []).find((s) => s.status === "pending")
            ?.step_order
        : undefined;

    return (
      <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              Approval Workflow
            </h3>
            <span className="text-xs text-[var(--muted)] capitalize">
              {workflow.mode} mode
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditing(true);
                setMode(workflow.mode);
                setSteps(
                  workflow.steps?.map((s) => ({
                    role_label: s.role_label,
                    assignee_email: s.assignee_email ?? "",
                  })) ?? []
                );
              }}
              className="p-1.5 rounded-[var(--radius-sm)] text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="p-1.5 rounded-[var(--radius-sm)] text-[var(--muted)] hover:text-[var(--red)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <ApprovalTimeline
          steps={workflow.steps ?? []}
          mode={workflow.mode}
          currentStep={currentStep}
        />
      </div>
    );
  }

  // Create / Edit form
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-5">
      <h3 className="text-sm font-semibold text-[var(--ink)] mb-4">
        {workflow ? "Edit Workflow" : "New Approval Workflow"}
      </h3>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        {(["sequential", "parallel"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-[var(--radius-sm)] text-sm font-medium capitalize transition-colors ${
              mode === m
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-2 mb-4">
        {steps.map((step, i) => (
          <div
            key={i}
            className="flex items-center gap-2 p-3 rounded-[var(--radius-sm)] bg-[var(--bg)] border border-[var(--border)]"
          >
            <span className="text-xs text-[var(--dim)] w-5 text-center shrink-0">
              {i + 1}
            </span>
            <input
              placeholder="Role label"
              value={step.role_label}
              onChange={(e) => updateStep(i, "role_label", e.target.value)}
              className="flex-1 px-2 py-1 rounded bg-transparent border border-[var(--border)] text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:outline-none focus:border-[var(--accent)]"
            />
            <input
              placeholder="email@example.com"
              value={step.assignee_email}
              onChange={(e) => updateStep(i, "assignee_email", e.target.value)}
              className="flex-1 px-2 py-1 rounded bg-transparent border border-[var(--border)] text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="flex flex-col">
              <button
                onClick={() => moveStep(i, -1)}
                disabled={i === 0}
                className="text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-30"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => moveStep(i, 1)}
                disabled={i === steps.length - 1}
                className="text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-30"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => removeStep(i)}
              className="text-[var(--muted)] hover:text-[var(--red)] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addStep}
        className="flex items-center gap-1.5 text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] mb-4 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Step
      </button>

      <div className="flex gap-2 justify-end">
        <button
          onClick={() => {
            setCreating(false);
            setEditing(false);
          }}
          className="px-4 py-1.5 rounded-[var(--radius-sm)] text-sm text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || steps.length === 0}
          className="flex items-center gap-2 px-4 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {workflow ? "Update" : "Create"} Workflow
        </button>
      </div>
    </div>
  );
}
