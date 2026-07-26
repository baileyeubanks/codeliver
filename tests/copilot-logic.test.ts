import assert from "node:assert/strict";
import test from "node:test";

import {
  COPILOT_HONESTY_FOOTNOTE,
  COPILOT_MENU_ACTIONS,
  COPILOT_PANEL_MARGIN,
  COPILOT_SIZES,
  buildCopilotReply,
  clampPanelPosition,
  classifyCopilotPrompt,
  defaultPanelPosition,
  type CopilotContext,
} from "../components/copilot/copilot-logic.ts";

const VIEWPORT = { width: 1440, height: 900 };

const CONTEXT: CopilotContext = {
  projects: [
    { id: "ica", name: "ICA", stage: "review" },
    { id: "bp", name: "bp", stage: "production" },
  ],
  tasks: [
    {
      project_id: "ica",
      title: "Swap lower third",
      assignee_name: "Rae",
      due_label: "tomorrow",
      completed: false,
    },
    {
      project_id: "bp",
      title: "Export v2",
      assignee_name: "Rae",
      due_label: "Friday",
      completed: true,
    },
  ],
  approvalStages: [
    {
      project_id: "ica",
      name: "Client approval — Denie McDonald_v4",
      status: "pending",
      reviewer_names: ["Morgan", "Dana"],
      approved_reviewer_names: ["Morgan"],
    },
    {
      project_id: "bp",
      name: "Final — Rodeo Recap",
      status: "approved",
      reviewer_names: ["Rachel"],
      approved_reviewer_names: ["Rachel"],
    },
  ],
  comments: [
    { author_name: "Client Reviewer", body: "Please shorten this section.", status: "open" },
    { author_name: "Producer", body: "Fixed in v5.", status: "resolved" },
  ],
};

test("clampPanelPosition keeps the panel inside the viewport margins", () => {
  const size = COPILOT_SIZES.compact;
  assert.deepEqual(clampPanelPosition({ x: -500, y: -500 }, size, VIEWPORT), {
    x: COPILOT_PANEL_MARGIN,
    y: COPILOT_PANEL_MARGIN,
  });
  assert.deepEqual(clampPanelPosition({ x: 99999, y: 99999 }, size, VIEWPORT), {
    x: VIEWPORT.width - size.width - COPILOT_PANEL_MARGIN,
    y: VIEWPORT.height - size.height - COPILOT_PANEL_MARGIN,
  });
  // A panel larger than the viewport still clamps to the margin, never negative.
  assert.deepEqual(
    clampPanelPosition({ x: 400, y: 400 }, { width: 5000, height: 5000 }, VIEWPORT),
    { x: COPILOT_PANEL_MARGIN, y: COPILOT_PANEL_MARGIN },
  );
  // In-bounds points pass through untouched.
  assert.deepEqual(clampPanelPosition({ x: 100, y: 120 }, size, VIEWPORT), { x: 100, y: 120 });
});

test("defaultPanelPosition rests bottom-right inside the margin", () => {
  const size = COPILOT_SIZES.expanded;
  assert.deepEqual(defaultPanelPosition(size, VIEWPORT), {
    x: VIEWPORT.width - size.width - COPILOT_PANEL_MARGIN,
    y: VIEWPORT.height - size.height - COPILOT_PANEL_MARGIN,
  });
});

test("classifyCopilotPrompt routes prompts to the right canned intent", () => {
  assert.equal(classifyCopilotPrompt("Summarize project status"), "status");
  assert.equal(classifyCopilotPrompt("List pending approvals"), "approvals");
  assert.equal(classifyCopilotPrompt("Draft a client update"), "client_update");
  assert.equal(classifyCopilotPrompt("Summarize latest feedback"), "feedback");
  assert.equal(classifyCopilotPrompt("Show my pending tasks"), "tasks");
  assert.equal(classifyCopilotPrompt("what is the meaning of life"), "generic");
});

test("every canned reply carries the honesty footnote", () => {
  for (const prompt of [
    "Summarize project status",
    "List pending approvals",
    "Draft a client update",
    "Summarize latest feedback",
    "Show my pending tasks",
    "anything else",
  ]) {
    const reply = buildCopilotReply(prompt, CONTEXT);
    assert.equal(reply.footnote, COPILOT_HONESTY_FOOTNOTE);
    assert.ok(reply.text.length > 0);
  }
});

test("replies derive from the demo workspace data", () => {
  const status = buildCopilotReply("Summarize project status", CONTEXT);
  assert.match(status.text, /ICA \(review\)/);
  assert.match(status.text, /2 active projects/);

  const approvals = buildCopilotReply("List pending approvals", CONTEXT);
  assert.match(approvals.text, /1 approval pending/);
  assert.match(approvals.text, /waiting on Dana/);
  assert.doesNotMatch(approvals.text, /Rodeo Recap/);

  const tasks = buildCopilotReply("Show my pending tasks", CONTEXT);
  assert.match(tasks.text, /Swap lower third/);
  assert.doesNotMatch(tasks.text, /Export v2/);

  const feedback = buildCopilotReply("Summarize latest feedback", CONTEXT);
  assert.match(feedback.text, /1 open comment/);
  assert.match(feedback.text, /Please shorten this section/);

  const update = buildCopilotReply("Draft a client update", CONTEXT);
  assert.match(update.text, /ICA/);
  assert.match(update.text, /starting point, not a sent message/);
});

test("empty workspaces degrade gracefully", () => {
  const empty: CopilotContext = { projects: [], tasks: [], approvalStages: [], comments: [] };
  assert.match(buildCopilotReply("List pending approvals", empty).text, /Nothing is waiting/);
  assert.match(buildCopilotReply("Show my pending tasks", empty).text, /All demo tasks are complete/);
  assert.match(buildCopilotReply("Summarize latest feedback", empty).text, /No open review comments/);
  assert.match(
    buildCopilotReply("Draft a client update", empty).text,
    /No projects in the workspace/,
  );
});

test("context menu actions stay honest: prompts map to real canned intents", () => {
  const prompts = COPILOT_MENU_ACTIONS.map((a) => a.prompt);
  assert.equal(prompts.length, 4);
  assert.ok(prompts.includes(null)); // Hide Copilot posts no fake answer
  for (const prompt of prompts) {
    if (prompt === null) continue;
    assert.notEqual(classifyCopilotPrompt(prompt), "generic");
  }
});
