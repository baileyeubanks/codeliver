import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { register, registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

register("./typescript-resolver.mjs", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

import {
  DISCOVERY_QUESTIONS,
  nextDiscoveryQuestion,
  normalizeDiscovery,
} from "../lib/covideopro/discovery.ts";

type DemoStore = typeof import("../lib/demo/workspace-store.ts");
let demoStore: DemoStore | null = null;
async function store(): Promise<DemoStore> {
  if (!demoStore) demoStore = await import("../lib/demo/workspace-store.ts");
  return demoStore;
}

test.beforeEach(async () => {
  (await store()).resetDemoWorkspace();
});

test("seed session resumes at the third question with why-it-matters attached", async () => {
  const { getDiscoveryForInquiry } = await store();
  const discovery = getDiscoveryForInquiry("inq-wendys-finalfour");
  assert.ok(discovery);
  assert.equal(discovery.answers.length, 2);
  assert.equal(discovery.next?.id, "deliverables");
  assert.match(discovery.next?.why ?? "", /estimate/i);
  assert.equal(discovery.normalized.completeness, 0.25);
  assert.ok(discovery.normalized.missingFields.includes("budget"));
});

test("normalization: usable answers only, unknowns/conflicts become missing fields", () => {
  const answers = [
    { id: "a1", session_id: "s", question_id: "goal", raw_text: "Sell the program.", status: "answered" as const, confidence: "high" as const, stakeholder: null, created_at: "", updated_at: "", created_by: "u" },
    { id: "a2", session_id: "s", question_id: "audience", raw_text: "", status: "unknown" as const, confidence: "medium" as const, stakeholder: null, created_at: "", updated_at: "", created_by: "u" },
    { id: "a3", session_id: "s", question_id: "budget", raw_text: "   ", status: "answered" as const, confidence: "low" as const, stakeholder: null, created_at: "", updated_at: "", created_by: "u" },
    { id: "a4", session_id: "s", question_id: "references", raw_text: "Film A\nFilm B\n\nFilm C", status: "answered" as const, confidence: "high" as const, stakeholder: null, created_at: "", updated_at: "", created_by: "u" },
  ];
  const normalized = normalizeDiscovery(DISCOVERY_QUESTIONS, answers);
  assert.equal(normalized.objectives, "Sell the program.");
  assert.deepEqual(normalized.references, ["Film A", "Film B", "Film C"]);
  assert.ok(normalized.missingFields.includes("audience"));
  assert.ok(normalized.missingFields.includes("budget"), "blank answer is missing, not empty truth");
  assert.equal(nextDiscoveryQuestion(DISCOVERY_QUESTIONS, answers)?.id, "deliverables", "unknown closes the question; it stays visible as a gap, not a nag");
});

test("store flow: start, answer, unknown, complete, brief seeded on conversion", async () => {
  const {
    addInquiry,
    startDiscovery,
    answerDiscoveryQuestion,
    completeDiscovery,
    setInquiryStatus,
    convertInquiryToProject,
    getDemoWorkspaceSnapshot,
  } = await store();

  const inquiry = addInquiry({ summary: "Docuseries pilot about grid storage.", source: "referral", organizationName: "Volt Peak Energy", contactEmail: "dana@voltpeak.example", contactName: "Dana Ives" });
  assert.equal(inquiry.ok, true);

  const started = startDiscovery(inquiry.id);
  assert.equal(started.ok, true);
  const sessionId = started.id;

  assert.equal(answerDiscoveryQuestion({ sessionId, questionId: "goal", rawText: "Make grid storage feel inevitable, not experimental.", status: "answered", confidence: "high" }).ok, true);
  assert.equal(answerDiscoveryQuestion({ sessionId, questionId: "audience", rawText: "Utility CFOs and state energy offices.", status: "answered", confidence: "medium" }).ok, true);
  assert.equal(answerDiscoveryQuestion({ sessionId, questionId: "deliverables", rawText: "One 6-minute pilot + three 45-second cutdowns.", status: "answered", confidence: "high" }).ok, true);
  assert.equal(answerDiscoveryQuestion({ sessionId, questionId: "timeline", status: "unknown" }).ok, true);

  const invalid = answerDiscoveryQuestion({ sessionId, questionId: "budget", rawText: " ", status: "answered" });
  assert.equal(invalid.ok, false, "blank answer rejected — unknown is the honest path");

  for (const questionId of ["budget", "references", "stakeholders", "risks"]) {
    assert.equal(answerDiscoveryQuestion({ sessionId, questionId, status: "unknown" }).ok, true);
  }

  assert.equal(setInquiryStatus(inquiry.id, "triaged").ok, true);
  assert.equal(setInquiryStatus(inquiry.id, "qualified").ok, true);
  const converted = convertInquiryToProject(inquiry.id, "Volt Peak — Docuseries Pilot");
  assert.equal(converted.ok, true);

  assert.equal(completeDiscovery(sessionId).ok, true);

  const workspace = getDemoWorkspaceSnapshot();
  const brief = workspace.briefs.find((candidate) => candidate.project_id === converted.id);
  assert.ok(brief, "conversion + completed discovery seeds the brief");
  assert.match(brief?.objectives ?? "", /grid storage feel inevitable/);
  assert.match(brief?.audience ?? "", /Utility CFOs/);
  assert.equal(
    workspace.discoverySessions.find((candidate) => candidate.id === sessionId)?.status,
    "complete",
  );
});

test("answered questions cannot be re-asked; unknown is recorded visibly", async () => {
  const { startDiscovery, answerDiscoveryQuestion, getDiscoveryForInquiry, addInquiry } = await store();
  const inquiry = addInquiry({ summary: "Quick social package.", source: "website" });
  const started = startDiscovery(inquiry.id);
  answerDiscoveryQuestion({ sessionId: started.id, questionId: "goal", rawText: "Drive signups.", status: "answered" });
  answerDiscoveryQuestion({ sessionId: started.id, questionId: "audience", status: "unknown" });

  const discovery = getDiscoveryForInquiry(inquiry.id);
  assert.equal(discovery?.next?.id, "deliverables");
  assert.ok(discovery?.normalized.missingFields.includes("audience"));
});
