import assert from "node:assert/strict";
import test from "node:test";
import { projectPipeline, projectPhaseIndex, type PipelineInput } from "../lib/covideopro/pipeline.ts";
import type { Brief, Deliverable, ProductionDay, Proposal, Release, Shot } from "../lib/covideopro/record.ts";

function base(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    stage: "development",
    briefs: [],
    proposals: [],
    productionDays: [],
    releases: [],
    shots: [],
    sequences: [],
    deliverables: [],
    assets: [],
    ...overrides,
  };
}

const brief = (status: Brief["status"]): Brief => ({ id: "b1", project_id: "p", version: 1, status, objective: "", audience: "", message: "", references: [], created_at: "", updated_at: "", created_by: "u" });
const proposal = (status: Proposal["status"]): Proposal => ({ id: "pr1", project_id: "p", version: 1, status, title: "", narrative: "", estimate_lines: [], valid_until: null, approved_by: null, approved_at: null, created_at: "", updated_at: "", created_by: "u" });
const day = (id: string, status: ProductionDay["status"], type: ProductionDay["type"] = "principal"): ProductionDay => ({ id, project_id: "p", date: "2026-08-18", call: null, wrap: null, type, status, notes: "", created_at: "", updated_at: "", created_by: "u" });
const shot = (dayId: string, status: Shot["status"] = "planned"): Shot => ({ id: `s-${dayId}`, project_id: "p", production_day_id: dayId, scene: "", description: "", size: "wide", priority: "must", status, notes: "", created_at: "", updated_at: "", created_by: "u" });
const release = (status: Release["status"]): Release => ({ id: "r1", project_id: "p", person_name: "A", type: "appearance", status, signed_at: null, file_url: null, language: "en", production_day_ids: ["d1"], created_at: "", updated_at: "", created_by: "u" });
const deliverable = (id: string, status: Deliverable["status"]): Deliverable => ({ id, project_id: "p", name: id, spec: { resolution: "4K", codec: "ProRes", aspect: "16:9", captions: true, audio: "stereo", watermark: false }, source_version_id: "v", status, qc_notes: "", delivered_at: null, created_at: "", updated_at: "", created_by: "u" });

test("phase mapping collapses the nine project stages into four phases", () => {
  assert.equal(projectPhaseIndex("inquiry"), 0);
  assert.equal(projectPhaseIndex("preproduction"), 0);
  assert.equal(projectPhaseIndex("production"), 1);
  assert.equal(projectPhaseIndex("review"), 2);
  assert.equal(projectPhaseIndex("archived"), 3);
});

test("el-paso-shaped record: pre-production active with honest partial progress", () => {
  const stages = projectPipeline(base({
    stage: "preproduction",
    productionDays: [day("d1"), day("d2"), day("d3")],
    shots: [shot("d1"), shot("d2"), shot("d3")],
    releases: [release("sent")],
  }));
  const pre = stages[0];
  assert.equal(pre.state, "active");
  assert.equal(pre.progress, 30, "days scheduled (10) + all listed (20); no brief/proposal/signed releases");
  assert.equal(pre.nextAction, "Lock the brief");
  assert.equal(stages[1].state, "upcoming");
  assert.equal(stages[3].state, "upcoming");
});

test("review-stage project: earlier phases complete at 100, post active from record detail", () => {
  const stages = projectPipeline(base({
    stage: "review",
    briefs: [brief("approved")],
    proposals: [proposal("approved")],
    sequences: [{ id: "seq1", project_id: "p", name: "Cut", version: 1, status: "draft", fps: 24, created_from: "manual", created_at: "", updated_at: "", created_by: "u" }],
    assets: [{ status: "in_review" }, { status: "approved" }, { status: "draft" }],
    deliverables: [deliverable("d1", "delivered"), deliverable("d2", "qc")],
  }));
  assert.equal(stages[0].state, "complete");
  assert.equal(stages[0].progress, 100);
  assert.equal(stages[1].state, "complete");
  const post = stages[2];
  assert.equal(post.state, "active");
  assert.equal(post.progress, Math.round((2 / 3) * 70) + 30);
  const delivery = stages[3];
  assert.equal(delivery.state, "upcoming");
  assert.equal(delivery.progress, 50, "one of two deliverables shipped, truthfully early");
  assert.equal(delivery.nextAction, "Finish QC on d2");
});

test("production stage tracks wrapped days and names the next day", () => {
  const stages = projectPipeline(base({
    stage: "production",
    productionDays: [day("d1", "wrapped"), day("d2", "in_progress"), day("d3", "scheduled")],
  }));
  const production = stages[1];
  assert.equal(production.state, "active");
  assert.equal(production.progress, 33);
  assert.equal(production.nextAction, "Wrap 2026-08-18");
});

test("archived project reads complete everywhere", () => {
  const stages = projectPipeline(base({ stage: "archived" }));
  assert.ok(stages.every((stage) => stage.state === "complete"));
  assert.ok(stages.every((stage) => stage.progress === 100));
});

test("every stage carries an owner and a cockpit doorway", () => {
  const stages = projectPipeline(base());
  for (const stage of stages) {
    assert.ok(stage.owner.length > 0);
    assert.ok(stage.nextAction.length > 0);
    assert.ok(["creative", "plan", "sequences", "delivery"].includes(stage.surface));
  }
});
