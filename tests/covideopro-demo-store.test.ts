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

type DemoStore = typeof import("../lib/demo/workspace-store.ts");
let demoStore: DemoStore | null = null;

async function store(): Promise<DemoStore> {
  if (!demoStore) demoStore = await import("../lib/demo/workspace-store.ts");
  return demoStore;
}

test.beforeEach(async () => {
  const { resetDemoWorkspace } = await store();
  resetDemoWorkspace();
});

test("seed v2 carries the Project Operating Record and zero ACS contamination", async () => {
  const { createInitialDemoWorkspace } = await store();
  const workspace = createInitialDemoWorkspace();
  assert.equal(workspace.schemaVersion, 2);
  assert.equal(workspace.organizations.length >= 5, true);
  assert.equal(workspace.inquiries.length, 2);
  assert.equal(workspace.briefs.length, 3);
  assert.equal(workspace.proposals.length, 2);
  assert.equal(workspace.planItems.length, 6);
  assert.equal(workspace.sequences.length, 1);
  assert.equal(workspace.sequenceClips.length, 3);
  assert.equal(workspace.revisionRequests.length, 1);
  assert.equal(workspace.deliverables.length, 2);

  const serialized = JSON.stringify(workspace);
  assert.match(serialized, /conexon/);
  assert.equal(serialized.includes("Astro Cleaning"), false);
  assert.equal(serialized.includes("astrocleanings"), false);
  assert.equal(workspace.projects.some((project) => project.id === "acs"), false);
  assert.equal(workspace.assets.some((asset) => asset.project_id === "acs"), false);

  const stages = Object.fromEntries(workspace.projects.map((project) => [project.id, project.stage]));
  assert.deepEqual(stages, {
    ica: "review",
    "schneider-epc": "post",
    bp: "production",
    conexon: "development",
  });
});

test("v1 payload migrates: acs stripped, conexon + record collections attached", async () => {
  const { restoreDemoWorkspace } = await store();
  const legacy = {
    schemaVersion: 1,
    projects: [
      { id: "ica", name: "ICA Renamed Locally" },
      { id: "acs", name: "Astro Cleaning Services" },
    ],
    folders: [
      { id: "ica", name: "ICA", children: [] },
      { id: "acs", name: "Astro Cleaning Services", children: [] },
    ],
    assets: [
      { id: "a1", project_id: "ica", title: "Kept" },
      { id: "a2", project_id: "acs", title: "Dropped" },
    ],
    shareLinks: [],
    activity: [],
  };

  const migrated = restoreDemoWorkspace(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.projects.some((project) => project.id === "acs"), false);
  assert.equal(migrated.projects.some((project) => project.id === "conexon"), true);
  assert.equal(migrated.assets.some((asset) => asset.project_id === "acs"), false);
  assert.equal(migrated.assets.some((asset) => asset.id === "a1"), true);
  const ica = migrated.projects.find((project) => project.id === "ica");
  assert.equal(ica?.name, "ICA Renamed Locally");
  assert.equal(ica?.stage, "review");
  assert.equal(migrated.briefs.length > 0, true);
});

test("inquiry lifecycle: intake guards, conversion creates an intake-stage project", async () => {
  const { addInquiry, setInquiryStatus, convertInquiryToProject, getDemoWorkspaceSnapshot } = await store();

  const added = addInquiry({
    summary: "Recap film for the autumn conference.",
    source: "referral",
    organizationName: "Gulf Coast Fabricators",
    contactName: "Lee Sandoval",
    contactEmail: "lee@gcf.example",
  });
  assert.equal(added.ok, true);

  assert.equal(setInquiryStatus(added.id, "qualified").ok, false, "new → qualified is rejected");
  assert.equal(setInquiryStatus(added.id, "triaged").ok, true);
  assert.equal(setInquiryStatus(added.id, "qualified").ok, true, "org + contact were created inline");

  const converted = convertInquiryToProject(added.id, "GCF Conference Recap");
  assert.equal(converted.ok, true);

  const workspace = getDemoWorkspaceSnapshot();
  const project = workspace.projects.find((candidate) => candidate.id === converted.id);
  assert.equal(project?.stage, "intake");
  assert.equal(typeof project?.organization_id, "string");
  const inquiry = workspace.inquiries.find((candidate) => candidate.id === added.id);
  assert.equal(inquiry?.status, "converted");
  assert.equal(inquiry?.project_id, converted.id);
  assert.equal(workspace.activity[0]?.action, "converted_inquiry");
});

test("brief + proposal flow: guards, versioning, approval gate for stage advance", async () => {
  const {
    saveBrief,
    setBriefStatus,
    setProposalStatus,
    advanceProjectStage,
    getDemoWorkspaceSnapshot,
  } = await store();

  const briefResult = saveBrief({
    projectId: "conexon",
    objectives: "",
    audience: "Co-op boards",
    message: "Broadband keeps towns alive",
  });
  assert.equal(briefResult.ok, true);
  assert.equal(setBriefStatus(briefResult.id, "in_review").ok, false, "objectives required");

  // Seed prop-conexon-v1 is already SENT (awaiting client approval).
  assert.equal(setProposalStatus("prop-conexon-v1", "approved").ok, false, "approver identity required");
  assert.equal(setProposalStatus("prop-conexon-v1", "approved", "sam@conexon.example").ok, true);

  const proposal = getDemoWorkspaceSnapshot().proposals.find((candidate) => candidate.id === "prop-conexon-v1");
  assert.equal(proposal?.status, "approved");
  assert.equal(proposal?.approved_by, "sam@conexon.example");

  const advanced = advanceProjectStage("conexon");
  assert.equal(advanced.ok, true);
  assert.equal(
    getDemoWorkspaceSnapshot().projects.find((project) => project.id === "conexon")?.stage,
    "preproduction",
  );

  // Full chain on a fresh proposal: draft must pass review before it can be sent.
  const { saveProposal } = await store();
  const created = saveProposal({
    projectId: "bp",
    title: "bp Rodeo Recap — Post Package",
    narrative: "Edit, mix, color, and delivery for the rodeo recap.",
    estimateLines: [
      { id: "el-bp-1", category: "post", description: "Edit + finish", quantity: 1, unit_rate: 2800, markup_pct: 15, optional: false },
    ],
  });
  assert.equal(created.ok, true);
  assert.equal(setProposalStatus(created.id, "sent").ok, false, "draft cannot be sent directly");
  assert.equal(setProposalStatus(created.id, "approved", "rachel@bp.example").ok, false);
  assert.equal(setProposalStatus(created.id, "in_review").ok, true);
  assert.equal(setProposalStatus(created.id, "sent").ok, true);
  assert.equal(setProposalStatus(created.id, "approved", "rachel@bp.example").ok, true);
});

test("revision rounds consolidate comments and guard verification", async () => {
  const { addRevisionRequest, setRevisionRequestStatus, addDecision, getDemoWorkspaceSnapshot } = await store();

  const first = addRevisionRequest({
    projectId: "ica",
    assetId: "charles-drummond-v5",
    summary: "Round 3 test",
    commentIds: ["comment-charles-1", "comment-charles-2"],
  });
  assert.equal(first.ok, true);

  const round = getDemoWorkspaceSnapshot().revisionRequests.find((candidate) => candidate.id === first.id)?.round;
  assert.equal(round, 3, "seed already has round 2 for this asset");

  assert.equal(setRevisionRequestStatus(first.id, "in_progress").ok, true);
  assert.equal(setRevisionRequestStatus(first.id, "addressed").ok, true);
  assert.equal(setRevisionRequestStatus(first.id, "verified").ok, false, "2 comments still open");
  assert.equal(setRevisionRequestStatus(first.id, "verified", { waiveUnresolved: true }).ok, true);

  const decision = addDecision({
    projectId: "ica",
    subject: "Round 3 accepted with waivers",
    body: "Remaining nits deferred to the roadshow re-version.",
    decidedBy: "morgan@ica.example",
    source: "review",
  });
  assert.equal(decision.ok, true);
});

test("sequence assembly + deliverable QC guard", async () => {
  const { createSequenceFromSelects, saveDeliverable, setDeliverableStatus, getDemoWorkspaceSnapshot } = await store();

  const assembled = createSequenceFromSelects({
    projectId: "schneider-epc",
    name: "Podcast teaser cut",
    selectIds: ["sel-pod-1", "sel-pod-3"],
  });
  assert.equal(assembled.ok, true);

  const clips = getDemoWorkspaceSnapshot().sequenceClips.filter((clip) => clip.sequence_id === assembled.id);
  assert.equal(clips.length, 2);
  assert.deepEqual(
    clips.map((clip) => [clip.timeline_in_seconds, clip.timeline_out_seconds]),
    [[0, 45], [45, 103]],
  );

  const deliverable = saveDeliverable({
    projectId: "schneider-epc",
    name: "PODCAST_TEASER_16x9.mp4",
    spec: { resolution: "1920x1080", codec: "H.264", aspect: "16:9", captions: true, audio: "stereo", watermark: true },
  });
  assert.equal(deliverable.ok, true);
  assert.equal(setDeliverableStatus(deliverable.id, "encoding").ok, true);
  assert.equal(setDeliverableStatus(deliverable.id, "qc").ok, false, "frozen source version required");
});
