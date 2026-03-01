"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Pencil,
} from "lucide-react";
import type { ApprovalStep as ApprovalStepType, ApprovalDecision } from "@/lib/types/codeliver";
import ApprovalActions from "./ApprovalActions";

interface ApprovalStepProps {
  step: ApprovalStepType;
  isActive: boolean;
  isEditing?: boolean;
  onDecide?: (decision: ApprovalDecision, note?: string) => void;
  onEdit?: (updates: { role_label: string; assignee_email: string }) => void;
}

const statusConfig: Record<
  ApprovalDecision,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  pending: { label: "Pending", color: "var(--orange)", icon: Clock },
  approved: { label: "Approved", color: "var(--green)", icon: CheckCircle2 },
  approved_with_changes: {
    label: "Approved with Changes",
    color: "var(--green)",
    icon: Pencil,
  },
  changes_requested: {
    label: "Changes Requested",
    color: "var(--red)",
    icon: AlertCircle,
  },
  rejected: { label: "Rejected", color: "var(--red)", icon: XCircle },
};

export default function ApprovalStepCard({
  step,
  isActive,
  isEditing,
  onDecide,
  onEdit,
}: ApprovalStepProps) {
  const [roleLabel, setRoleLabel] = useState(step.role_label);
  const [email, setEmail] = useState(step.assignee_email ?? "");
  const [deciding, setDeciding] = useState(false);

  const config = statusConfig[step.status];
  const StatusIcon = config.icon;

  async function handleDecide(decision: ApprovalDecision, note?: string) {
    if (!onDecide) return;
    setDeciding(true);
    try {
      await onDecide(decision, note);
    } finally {
      setDeciding(false);
    }
  }

  if (isEditing && onEdit) {
    return (
      <div className="p-4 rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)]">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-[var(--muted)] mb-1 block">
              Role
            </label>
            <input
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              onBlur={() => onEdit({ role_label: roleLabel, assignee_email: email })}
              className="w-full px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--bg)] border border-[var(--border)] text-[var(--ink)] text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-[var(--muted)] mb-1 block">
              Assignee Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => onEdit({ role_label: roleLabel, assignee_email: email })}
              className="w-full px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--bg)] border border-[var(--border)] text-[var(--ink)] text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-4 rounded-[var(--radius)] bg-[var(--surface)] border transition-colors ${
        isActive
          ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
          : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${config.color}20`, color: config.color }}
          >
            <StatusIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--dim)]">
                Step {step.step_order}
              </span>
              <span className="text-sm font-medium text-[var(--ink)] truncate">
                {step.role_label}
              </span>
            </div>
            <p className="text-xs text-[var(--muted)] truncate">
              {step.assignee_email}
            </p>
          </div>
        </div>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: `${config.color}20`, color: config.color }}
        >
          {config.label}
        </span>
      </div>

      {step.decision_note && (
        <p className="mt-3 text-sm text-[var(--muted)] italic pl-11">
          &ldquo;{step.decision_note}&rdquo;
        </p>
      )}

      {step.decided_at && (
        <p className="mt-1 text-xs text-[var(--dim)] pl-11">
          {new Date(step.decided_at).toLocaleString()}
        </p>
      )}

      {isActive && step.status === "pending" && onDecide && (
        <div className="mt-4 pl-11">
          <ApprovalActions onDecide={handleDecide} loading={deciding} />
        </div>
      )}
    </div>
  );
}
