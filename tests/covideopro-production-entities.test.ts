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

import { chaseList } from "../lib/covideopro/transitions.ts";

type DemoStore = typeof import("../lib/demo/workspace-store.ts");
let demoStore: DemoStore | null = null;
async function store(): Promise<DemoStore> {
  if (!demoStore) demoStore = await import("../lib/demo/workspace-store.ts");
  return demoStore;
}

test.beforeEach(async () => {
  (await store()).resetDemoWorkspace();
});

test("the El Paso seed carries the production doctrine", async () => {
  const { getDemoWorkspaceSnapshot } = await store();
  const workspace = getDemoWorkspaceSnapshot();
  const project = workspace.projects.find((candidate) => candidate.id === "el-paso");
  assert.equal(project?.stage, "preproduction");
  assert.equal(workspace.productionDays.filter((day) => day.project_id === "el-paso").length, 5);
  assert.equal(workspace.crewMembers.length, 3);
  assert.equal(workspace.locations.length, 3);
  assert.equal(workspace.releases.length, 3);
});

test("chase list: who films within 2 days and has not signed", () => {
  const entries = chaseList(
    [
      { id: "r1", person_name: "Signed Person", status: "signed", production_day_ids: ["d1"] },
      { id: "r2", person_name: "Sent Person", status: "sent", production_day_ids: ["d1"] },
      { id: "r3", person_name: "Unsent Person", status: "unsent", production_day_ids: ["d1", "d2"] },
      { id: "r4", person_name: "Far Person", status: "unsent", production_day_ids: ["d3"] },
      { id: "r5", person_name: "Cancelled Person", status: "unsent", production_day_ids: ["d4"] },
    ],
    [
      { id: "d1", date: "2026-08-19", status: "scheduled" },
      { id: "d2", date: "2026-08-20", status: "scheduled" },
      { id: "d3", date: "2026-08-28", status: "scheduled" },
      { id: "d4", date: "2026-08-19", status: "cancelled" },
    ],
    "2026-08-18",
    2,
  );

  assert.deepEqual(
    entries.map((entry) => entry.personName),
    ["Sent Person", "Unsent Person", "Unsent Person"],
    "signed, far-future, and cancelled-day people are excluded",
  );
  assert.equal(entries[0].daysUntilShoot, 1);
  assert.equal(entries[1].productionDate, "2026-08-19");
  assert.equal(entries[2].productionDate, "2026-08-20");
});

test("store chase list surfaces Ephram (unsigned, films day 2 and 3)", async () => {
  const { getChaseList } = await store();
  const entries = getChaseList("el-paso", 4, "2026-08-17");
  const names = entries.map((entry) => entry.personName);
  assert.ok(names.includes("Ephram Sims"));
  assert.ok(names.includes("Adam Wickersham"), "sent but unsigned appears");
  assert.ok(!names.includes("Gisela Rivas"), "signed is excluded");
});

test("release and agreement state machines", async () => {
  const { setReleaseStatus, setLocationAgreementStatus, setProductionDayStatus, getDemoWorkspaceSnapshot } = await store();

  assert.equal(setReleaseStatus("rel-ephram", "signed").ok, false, "unsent cannot jump to signed");
  assert.equal(setReleaseStatus("rel-ephram", "sent").ok, true);
  assert.equal(setReleaseStatus("rel-ephram", "signed").ok, true);
  const ephram = getDemoWorkspaceSnapshot().releases.find((release) => release.id === "rel-ephram");
  assert.equal(ephram?.status, "signed");
  assert.ok(ephram?.signed_at);

  assert.equal(setLocationAgreementStatus("loc-weathermast", "signed").ok, false, "none → signed rejected");
  assert.equal(setLocationAgreementStatus("loc-weathermast", "drafted").ok, true);
  assert.equal(setLocationAgreementStatus("loc-weathermast", "sent").ok, true);
  assert.equal(setLocationAgreementStatus("loc-weathermast", "signed").ok, true);

  assert.equal(setProductionDayStatus("pd-elpaso-d4", "in_progress").ok, true);
  assert.equal(setProductionDayStatus("pd-elpaso-d4", "wrapped").ok, true);
  assert.equal(setProductionDayStatus("pd-elpaso-d4", "scheduled").ok, false, "wrapped is terminal");
});

test("call sheet: Agent 2 produces the versioned FORM artifact with chase warning", async () => {
  const { generateCallSheet, getDemoWorkspaceSnapshot } = await store();

  const first = generateCallSheet("pd-elpaso-d2");
  assert.equal(first.ok, true);
  const sheet = getDemoWorkspaceSnapshot().callSheets.find((candidate) => candidate.id === first.id);
  assert.equal(sheet?.version, 1);
  assert.match(sheet?.content ?? "", /DAY 2 OF 3/);
  assert.match(sheet?.content ?? "", /Bailey Eubanks/);
  assert.match(sheet?.content ?? "", /Brook Hollow/);
  assert.match(sheet?.content ?? "", /NOT cleared: residents' homes, license plates/);
  assert.match(sheet?.content ?? "", /Gisela Rivas   appearance   RELEASE SIGNED\? ☑/);
  assert.match(sheet?.content ?? "", /Ephram Sims   appearance   RELEASE SIGNED\? ☐/);
  assert.match(sheet?.content ?? "", /CHASE: Ephram Sims — unsigned as of generation/);
  assert.match(sheet?.content ?? "", /SUNRISE 06:14/);

  const second = generateCallSheet("pd-elpaso-d2");
  assert.equal(second.ok, true);
  assert.equal(getDemoWorkspaceSnapshot().callSheets.find((candidate) => candidate.id === second.id)?.version, 2);

  const cancelled = (await store()).setProductionDayStatus("pd-elpaso-d4", "cancelled");
  assert.equal(cancelled.ok, true);
  assert.equal(generateCallSheet("pd-elpaso-d4").ok, false, "cancelled days get no call sheet");
});
