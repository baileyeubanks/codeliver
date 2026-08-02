import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error TS5097: Node's native TypeScript test runner requires explicit extensions.
import {
  parseProductionPlanInitialization,
  parseProductionPlanSnapshot,
  parseProductionTaskMutation,
  ProductionPlanValidationError,
} from "../lib/preproduction/production-plan.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const planRoute = read("app/api/projects/[id]/production-plan/route.ts");
const taskRoute = read("app/api/projects/[id]/production-tasks/[taskId]/route.ts");
const hook = read("lib/hooks/useProjectProductionPlan.ts");
const cockpit = read("components/projects/ProjectCockpit.tsx");
const lifecycle = read("lib/co-produce/lifecycle-contract.ts");

const REQUEST_ID = "a0b1c2d3-e4f5-4678-9234-56789abcdef0";
const ASSIGNEE_ID = "b0b1c2d3-e4f5-4678-9234-56789abcdef0";

function validPlan() {
  return {
    expectedPlanRevision: 0,
    requestId: REQUEST_ID,
    title: "ICA production plan",
    summary: "Prepare the accepted scope for production.",
    tasks: [
      {
        clientTaskId: "brief-lock",
        title: "Lock the production brief",
        description: null,
        priority: "high",
        assigneeId: ASSIGNEE_ID,
        dueDate: "2026-07-20",
        sourceKind: "plan",
        sourceRef: null,
        dependsOnClientTaskIds: [],
      },
      {
        clientTaskId: "schedule-lock",
        title: "Lock the production schedule",
        description: "Confirm the approved production window.",
        priority: "normal",
        assigneeId: null,
        dueDate: null,
        sourceKind: "plan",
        sourceRef: null,
        dependsOnClientTaskIds: ["brief-lock"],
      },
    ],
  };
}

test("plan parser normalizes a bounded acyclic plan", () => {
  const parsed = parseProductionPlanInitialization(validPlan());
  assert.equal(parsed.expectedPlanRevision, 0);
  assert.equal(parsed.tasks.length, 2);
  assert.deepEqual(parsed.tasks[1].dependsOnClientTaskIds, ["brief-lock"]);
});

test("plan parser rejects unknown dependencies and cycles", () => {
  const missing = validPlan();
  missing.tasks[1].dependsOnClientTaskIds = ["missing-task"];
  assert.throws(
    () => parseProductionPlanInitialization(missing),
    (error) => error instanceof ProductionPlanValidationError && error.code === "missing_dependency",
  );

  const cyclic = validPlan();
  cyclic.tasks[0].dependsOnClientTaskIds = ["schedule-lock"];
  assert.throws(
    () => parseProductionPlanInitialization(cyclic),
    (error) => error instanceof ProductionPlanValidationError && error.code === "dependency_cycle",
  );
});

test("task mutation requires an expected version and a non-empty exact patch", () => {
  assert.deepEqual(
    parseProductionTaskMutation({
      expectedVersion: 4,
      requestId: REQUEST_ID,
      patch: { status: "completed" },
    }),
    {
      expectedVersion: 4,
      requestId: REQUEST_ID,
      patch: { status: "completed" },
    },
  );
  assert.throws(
    () => parseProductionTaskMutation({ expectedVersion: 4, requestId: REQUEST_ID, patch: {} }),
    (error) => error instanceof ProductionPlanValidationError && error.code === "empty_patch",
  );
});

test("snapshot parser rejects incomplete authority responses", () => {
  assert.equal(parseProductionPlanSnapshot({ projectId: "project-only" }), null);
  const snapshot = parseProductionPlanSnapshot({
    projectId: "project-1",
    authorityVersion: 2,
    eventHeadHash: `sha256:${"0".repeat(64)}`,
    plan: null,
    tasks: [],
    dependencies: [],
    permissions: { canInitialize: true, canManage: true, canUpdateStatus: true },
  });
  assert.equal(snapshot?.authorityVersion, 2);
  assert.equal(snapshot?.plan, null);
});

test("project APIs are authenticated, schema-guarded, bounded, and RPC-only", () => {
  for (const source of [planRoute, taskRoute]) {
    assert.match(source, /requireAuthWithClient\(\)/);
    assert.match(source, /getSupabaseDataSchema\(\) !== "co_production"/);
    assert.match(source, /Cache-Control": "private, no-store"/);
    assert.doesNotMatch(source, /\.from\("production_(?:tasks|plan_revisions)"\).*\.(?:insert|update|delete)/s);
  }
  assert.match(planRoute, /\.rpc\("get_project_production_plan"/);
  assert.match(planRoute, /\.rpc\("initialize_production_plan"/);
  assert.match(
    planRoute,
    /production_plan_draft_[\s\S]*?approved script must be converted through its governed production plan handoff[\s\S]*?409/,
  );
  assert.match(planRoute, /sourceDraftId: null/);
  assert.match(planRoute, /approvalNote: null/);
  assert.match(taskRoute, /\.rpc\("mutate_production_task"/);
  assert.match(planRoute, /return json\(receipt, receipt\.replayed \? 200 : 201\)/);
  assert.match(taskRoute, /snapshot\.tasks\.some\(\(task\) => task\.id === taskId\)/);
});

test("production task hook preserves snapshots and handles stale conflicts", () => {
  assert.match(hook, /if \(!enabled \|\| !projectId\) return/);
  assert.match(hook, /requestVersionRef\.current !== requestVersion/);
  assert.match(hook, /if \(response\.status === 409\) await reload\(\)/);
  assert.match(hook, /setSnapshot\(nextSnapshot\)/);
  const reloadBlock = hook.slice(
    hook.indexOf("const reload = useCallback"),
    hook.indexOf("useEffect(() =>"),
  );
  assert.doesNotMatch(reloadBlock, /setSnapshot\(null\)/);
});

test("first-plan initialization stays behind the governed receipt contract", () => {
  assert.match(hook, /parseProductionPlanReceipt/);
  assert.match(hook, /initializationPendingRef/);
  assert.match(hook, /snapshot\.canInitialize/);
  assert.match(hook, /method: "POST"/);
  assert.match(hook, /receipt\.requestId !== plan\.requestId/);
  assert.match(hook, /await reload\(\)/);
  assert.match(cockpit, /productionPlan\.initializePlan/);
  assert.match(cockpit, /Initialize production plan/);
  assert.match(cockpit, /sourceKind: "manual"/);
  assert.match(cockpit, /initial-plan-\$\{requestId\}/);
  assert.match(cockpit, /productionPlan\.snapshot\.canInitialize/);
  assert.match(cockpit, /Plan setup requires a producer/);
  assert.doesNotMatch(cockpit, /const \[liveTasks\] = useState/);
});

test("existing cockpit task surface gains loading, error, persistence, and accessibility states", () => {
  assert.match(cockpit, /useProjectProductionPlan\(project\.id, !demoMode\)/);
  assert.match(cockpit, /productionPlan\.setTaskStatus/);
  assert.match(cockpit, /role="alert"/);
  assert.match(cockpit, /aria-live="polite"/);
  assert.match(cockpit, /aria-busy=\{pending \|\| undefined\}/);
  assert.match(cockpit, /<ul className="cockpit-task-list" aria-label="Production tasks">/);
  assert.match(cockpit, /href: surfaceHref\("tasks"\)/);
  assert.doesNotMatch(cockpit, /const \[liveTasks\] = useState/);
});

test("lifecycle contract names canonical plan, task, and append-only event records", () => {
  assert.match(lifecycle, /production_plan_revision:[\s\S]*deployment: "canonical"[\s\S]*storage: "production_plan_revisions"/);
  assert.match(lifecycle, /production_task:[\s\S]*storage: "production_tasks"/);
  assert.match(lifecycle, /project_preproduction_event:[\s\S]*storage: "project_preproduction_events"/);
  assert.match(lifecycle, /intent: "open-production-tasks"[\s\S]*routeId: "project"[\s\S]*action: "surface=tasks"/);
  assert.match(lifecycle, /responsibility: "append-after-commit"[\s\S]*record: "project_preproduction_event"/);
  assert.doesNotMatch(lifecycle, /primary: "planned\.production_task"/);
});
