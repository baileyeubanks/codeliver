import assert from "node:assert/strict";
import test from "node:test";
import { copilotHistory, copilotProjectFromPath, requestCopilotReply } from "../components/copilot/copilot-client.ts";

test("project selection follows project navigation, never public review or another route", () => {
  assert.equal(copilotProjectFromPath("/projects/project-a/whiteboard"), "project-a");
  for (const path of ["/projects", "/projects/new", "/projects/archive", "/projects/trash", "/review/project-a", "/projects/%2Fadmin", "/projects/%ZZ"]) {
    assert.equal(copilotProjectFromPath(path), null);
  }
});

test("history is bounded to the latest exchange context and excludes labels/sources", () => {
  const history = copilotHistory(Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? "copilot" as const : "user" as const, text: String(index).padEnd(3000, "x"),
  })));
  assert.equal(history.length, 8);
  assert.equal(history[0].content[0], "4");
  assert.equal(history[1].role, "assistant");
  assert.ok(history.every((entry) => entry.content.length === 2000));
});

test("request sends project and bounded conversation to the same-origin authenticated endpoint", async () => {
  const controller = new AbortController();
  const answer = { answer: "Two edits remain.", model: "configured-model", sources: [{ id: "comment-a", type: "comment", label: "Review note" }], read_only: true };
  const result = await requestCopilotReply("project-a", "  What remains?  ", [], controller.signal,
    (async (url, init) => {
      assert.equal(url, "/api/ai/copilot");
      assert.equal(init?.credentials, "same-origin");
      assert.equal(init?.signal, controller.signal);
      assert.deepEqual(JSON.parse(String(init?.body)), { project_id: "project-a", prompt: "What remains?", history: [] });
      return Response.json(answer);
    }) as typeof fetch);
  assert.deepEqual(result, answer);
});

test("configuration and access failures stay honest and do not render provider error details", async () => {
  for (const [code, expected] of [["NOT_CONFIGURED", /not connected/], ["FORBIDDEN", /no longer have access/], ["UNAUTHENTICATED", /Sign in again/], ["unexpected", /could not answer/]] as const) {
    await assert.rejects(requestCopilotReply("project-a", "Status?", [], new AbortController().signal,
      (async () => Response.json({ code, error: "PRIVATE PROVIDER DETAIL" }, { status: 503 })) as typeof fetch), expected);
  }
});

test("missing model, malformed source or non-read-only answers fail instead of becoming plausible replies", async () => {
  for (const answer of [{ answer: "OK" }, { answer: "OK", model: "m", read_only: false, sources: [] },
    { answer: "OK", model: "m", read_only: true, sources: [{ id: "a", type: "external_url", label: "x" }] }]) {
    await assert.rejects(requestCopilotReply("project-a", "Status?", [], new AbortController().signal,
      (async () => Response.json(answer)) as typeof fetch), /could not answer/);
  }
});

test("invalid requests never reach transport and cancellation propagates to fetch", async () => {
  let calls = 0;
  const transport = (async () => { calls++; return Response.json({}); }) as typeof fetch;
  for (const [project, prompt] of [["", "Status?"], ["project-a", " "], ["project-a", "x".repeat(4001)]]) {
    await assert.rejects(requestCopilotReply(project, prompt, [], new AbortController().signal, transport));
  }
  assert.equal(calls, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requestCopilotReply("project-a", "Status?", [], controller.signal,
    (async (_url, init) => { init?.signal?.throwIfAborted(); return Response.json({}); }) as typeof fetch), { name: "AbortError" });
});
