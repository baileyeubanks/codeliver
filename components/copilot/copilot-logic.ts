/**
 * P14 — AI Copilot floating panel: pure logic.
 * Geometry (viewport clamping), canned-response selection, and the honesty
 * contract. Demo-mock answers ONLY — every reply carries
 * COPILOT_HONESTY_FOOTNOTE so nothing here ever claims to be a real AI.
 */

export const COPILOT_HONESTY_FOOTNOTE =
  "Local preview — Copilot answers are illustrative";

export interface CopilotViewport {
  width: number;
  height: number;
}

export interface CopilotSize {
  width: number;
  height: number;
}

export interface CopilotPoint {
  x: number;
  y: number;
}

export const COPILOT_PANEL_MARGIN = 16;

export const COPILOT_SIZES: Record<"compact" | "expanded", CopilotSize> = {
  compact: { width: 360, height: 440 },
  expanded: { width: 540, height: 620 },
};

export type CopilotSizeKind = keyof typeof COPILOT_SIZES;

/** Keep the whole panel inside the viewport with a uniform margin. */
export function clampPanelPosition(
  point: CopilotPoint,
  size: CopilotSize,
  viewport: CopilotViewport,
  margin: number = COPILOT_PANEL_MARGIN,
): CopilotPoint {
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const maxY = Math.max(margin, viewport.height - size.height - margin);
  return {
    x: Math.min(Math.max(point.x, margin), maxX),
    y: Math.min(Math.max(point.y, margin), maxY),
  };
}

/** Resting spot: bottom-right of the viewport, inside the margin. */
export function defaultPanelPosition(
  size: CopilotSize,
  viewport: CopilotViewport,
  margin: number = COPILOT_PANEL_MARGIN,
): CopilotPoint {
  return clampPanelPosition(
    { x: viewport.width - size.width - margin, y: viewport.height - size.height - margin },
    size,
    viewport,
    margin,
  );
}

/* ── Canned responses ── */

/** Structural slice of the demo workspace the copilot may read. */
export interface CopilotContext {
  projects: Array<{ id: string; name: string; stage?: string }>;
  tasks: Array<{
    project_id: string;
    title: string;
    assignee_name: string;
    due_label: string;
    completed: boolean;
  }>;
  approvalStages: Array<{
    project_id: string;
    name: string;
    status: "pending" | "in_progress" | "approved";
    reviewer_names: string[];
    approved_reviewer_names: string[];
  }>;
  comments: Array<{ author_name: string; body: string; status: "open" | "resolved" }>;
}

export type CopilotIntent =
  | "status"
  | "approvals"
  | "client_update"
  | "feedback"
  | "tasks"
  | "generic";

export function classifyCopilotPrompt(prompt: string): CopilotIntent {
  const text = prompt.toLowerCase();
  if (/approv/.test(text)) return "approvals";
  if (/client update|draft|recap email|update email/.test(text)) return "client_update";
  if (/feedback|comment|note/.test(text)) return "feedback";
  if (/task|to-?do|pending work/.test(text)) return "tasks";
  if (/status|summar|project|progress|where are we/.test(text)) return "status";
  return "generic";
}

function projectName(context: CopilotContext, projectId: string): string {
  return context.projects.find((p) => p.id === projectId)?.name ?? projectId;
}

function statusReply(context: CopilotContext): string {
  const total = context.projects.length;
  const stages = context.projects
    .map((p) => `${p.name} (${p.stage ?? "unstaged"})`)
    .join(", ");
  const pendingApprovals = context.approvalStages.filter((s) => s.status !== "approved").length;
  const openTasks = context.tasks.filter((t) => !t.completed).length;
  return (
    `You have ${total} active projects: ${stages}. ` +
    `${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} still open and ` +
    `${openTasks} unfinished task${openTasks === 1 ? "" : "s"} across the workspace.`
  );
}

function approvalsReply(context: CopilotContext): string {
  const open = context.approvalStages.filter((s) => s.status !== "approved");
  if (open.length === 0) return "Nothing is waiting on approval right now — every stage is approved.";
  const lines = open.map((s) => {
    const waitingOn = s.reviewer_names.filter((n) => !s.approved_reviewer_names.includes(n));
    const who = waitingOn.length > 0 ? ` — waiting on ${waitingOn.join(", ")}` : "";
    return `${s.name} (${projectName(context, s.project_id)}, ${s.status.replace("_", " ")})${who}`;
  });
  return `${open.length} approval${open.length === 1 ? "" : "s"} pending: ${lines.join("; ")}.`;
}

function tasksReply(context: CopilotContext): string {
  const open = context.tasks.filter((t) => !t.completed);
  if (open.length === 0) return "All demo tasks are complete. Nice and tidy.";
  const lines = open.map(
    (t) => `${t.title} (${projectName(context, t.project_id)}, ${t.assignee_name}, due ${t.due_label})`,
  );
  return `${open.length} open task${open.length === 1 ? "" : "s"}: ${lines.join("; ")}.`;
}

function feedbackReply(context: CopilotContext): string {
  const open = context.comments.filter((c) => c.status === "open");
  if (open.length === 0) return "No open review comments in the demo workspace.";
  const latest = open.slice(-3).map((c) => `${c.author_name}: “${c.body}”`);
  return (
    `${open.length} open comment${open.length === 1 ? "" : "s"} across review links. ` +
    `Most recent: ${latest.join(" · ")}`
  );
}

function clientUpdateReply(context: CopilotContext): string {
  const project = context.projects[0];
  const pendingApprovals = context.approvalStages.filter((s) => s.status !== "approved").length;
  if (!project) return "No projects in the workspace to draft an update for.";
  return (
    `Draft — “Hi, quick update on ${project.name}: the project is in the ` +
    `${project.stage ?? "current"} phase with ${pendingApprovals} item${pendingApprovals === 1 ? "" : "s"} ` +
    `in the approval queue. We'll share the next review link as soon as the current cut is ready.” ` +
    `Edit before sending — this is a starting point, not a sent message.`
  );
}

function genericReply(context: CopilotContext): string {
  return (
    `I'm a local preview copilot — I can summarize project status, list pending approvals, ` +
    `draft a client update, or recap feedback and tasks across your ${context.projects.length} demo projects. ` +
    `Try one of the suggestions above.`
  );
}

export interface CopilotReply {
  intent: CopilotIntent;
  text: string;
  footnote: string;
}

/** Select and render a canned, demo-labeled answer. Never claims real AI. */
export function buildCopilotReply(prompt: string, context: CopilotContext): CopilotReply {
  const intent = classifyCopilotPrompt(prompt);
  const text =
    intent === "status"
      ? statusReply(context)
      : intent === "approvals"
        ? approvalsReply(context)
        : intent === "tasks"
          ? tasksReply(context)
          : intent === "feedback"
            ? feedbackReply(context)
            : intent === "client_update"
              ? clientUpdateReply(context)
              : genericReply(context);
  return { intent, text, footnote: COPILOT_HONESTY_FOOTNOTE };
}

/* ── Static UI copy ── */

export const COPILOT_SUGGESTIONS = [
  "Summarize latest feedback",
  "Show my pending tasks",
  "Summarize project status",
] as const;

export const COPILOT_MENU_ACTIONS = [
  { id: "status", label: "Summarize project status", prompt: "Summarize project status" },
  { id: "approvals", label: "List pending approvals", prompt: "List pending approvals" },
  { id: "client-update", label: "Draft client update", prompt: "Draft a client update" },
  { id: "hide", label: "Hide Copilot", prompt: null },
] as const;

export type CopilotMenuAction = (typeof COPILOT_MENU_ACTIONS)[number];
