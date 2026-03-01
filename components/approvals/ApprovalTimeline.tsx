"use client";

import type { ApprovalStep, WorkflowMode } from "@/lib/types/codeliver";

interface ApprovalTimelineProps {
  steps: ApprovalStep[];
  mode: WorkflowMode;
  currentStep?: number;
}

function dotColor(step: ApprovalStep, isCurrent: boolean): string {
  if (
    step.status === "approved" ||
    step.status === "approved_with_changes"
  ) {
    return "var(--green)";
  }
  if (step.status === "changes_requested" || step.status === "rejected") {
    return "var(--red)";
  }
  if (isCurrent) return "var(--accent)";
  return "var(--dim)";
}

function lineColor(step: ApprovalStep): string {
  if (
    step.status === "approved" ||
    step.status === "approved_with_changes"
  ) {
    return "var(--green)";
  }
  return "var(--border)";
}

function SequentialTimeline({
  steps,
  currentStep,
}: {
  steps: ApprovalStep[];
  currentStep?: number;
}) {
  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const isCurrent = currentStep === step.step_order;
        const color = dotColor(step, isCurrent);
        const isLast = i === steps.length - 1;

        return (
          <div key={step.id} className="flex gap-4">
            {/* Dot + Line */}
            <div className="flex flex-col items-center">
              <div
                className={`w-3.5 h-3.5 rounded-full shrink-0 border-2 ${
                  isCurrent ? "animate-pulse" : ""
                }`}
                style={{
                  borderColor: color,
                  backgroundColor:
                    step.status !== "pending" || isCurrent
                      ? color
                      : "transparent",
                }}
              />
              {!isLast && (
                <div
                  className="w-0.5 flex-1 min-h-[32px]"
                  style={{ backgroundColor: lineColor(step) }}
                />
              )}
            </div>

            {/* Label */}
            <div className="pb-6 -mt-0.5">
              <p className="text-sm font-medium text-[var(--ink)]">
                {step.role_label}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {step.assignee_email}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ParallelTimeline({
  steps,
  currentStep,
}: {
  steps: ApprovalStep[];
  currentStep?: number;
}) {
  return (
    <div className="flex flex-col items-center">
      {/* Origin dot */}
      <div
        className="w-3.5 h-3.5 rounded-full bg-[var(--accent)]"
      />
      {/* Branch lines */}
      <div className="flex gap-6 mt-1">
        {steps.map((step) => {
          const isCurrent = currentStep === step.step_order;
          const color = dotColor(step, isCurrent);

          return (
            <div key={step.id} className="flex flex-col items-center">
              <div
                className="w-0.5 h-6"
                style={{ backgroundColor: lineColor(step) }}
              />
              <div
                className={`w-3 h-3 rounded-full shrink-0 ${
                  isCurrent ? "animate-pulse" : ""
                }`}
                style={{ backgroundColor: color }}
              />
              <div className="mt-2 text-center">
                <p className="text-xs font-medium text-[var(--ink)]">
                  {step.role_label}
                </p>
                <p className="text-[10px] text-[var(--muted)]">
                  {step.assignee_email}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ApprovalTimeline({
  steps,
  mode,
  currentStep,
}: ApprovalTimelineProps) {
  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-[var(--dim)]">No approval steps defined.</p>
    );
  }

  return mode === "parallel" ? (
    <ParallelTimeline steps={sorted} currentStep={currentStep} />
  ) : (
    <SequentialTimeline steps={sorted} currentStep={currentStep} />
  );
}
