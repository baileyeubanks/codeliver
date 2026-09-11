import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !extname(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

function moduleUrl(path: string, instance?: string) {
  const url = pathToFileURL(resolve(repositoryRoot, path));
  if (instance) url.searchParams.set("emailfix", instance);
  return url.href;
}

const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
      removeItem(key: string) {
        values.delete(key);
      },
    },
    addEventListener() {},
    removeEventListener() {},
  },
});

// The demo public review page selected its reviewer email through TWO
// divergent gates: the load path fell back to the payload reviewer only when
// the share intent was "approval_needed", while the decision-record path fell
// back whenever permissions were "approve". An approve-capable link without a
// named reviewer and without the approval intent (e.g. an edited or migrated
// share) resolved to null on load — the active approval step never matched,
// so Approve/Request-changes stayed hidden even though the record path would
// have accepted the decision. Both paths must resolve through one shared
// authority keyed on the approval PERMISSION (the authority boundary), not
// the presentational intent.

test("demo reviewer identity resolves through one shared permission-keyed authority", async () => {
  const { resolveDemoReviewerEmail } = await import(
    moduleUrl("lib/review/demo-reviewer-identity.ts")
  );
  const { demoReviewPayload } = await import(
    moduleUrl("lib/review/demoReview.ts", "resolver-payload")
  );

  // An approve-permission link with no named reviewer still gets the demo
  // reviewer identity, so the active step matches and the decision UI shows.
  assert.equal(
    resolveDemoReviewerEmail({
      shareReviewerEmail: null,
      permissions: "approve",
    }),
    demoReviewPayload.reviewer_email,
  );

  // Share email wins when present, normalized for comparison.
  assert.equal(
    resolveDemoReviewerEmail({
      shareReviewerEmail: "  Approvals@ICA.Example  ",
      permissions: "approve",
    }),
    "approvals@ica.example",
  );

  // Non-approve links never invent an approval identity.
  assert.equal(
    resolveDemoReviewerEmail({
      shareReviewerEmail: null,
      permissions: "comment",
    }),
    null,
  );
  assert.equal(
    resolveDemoReviewerEmail({ shareReviewerEmail: null, permissions: "view" }),
    null,
  );
});

test("PublicReviewPage uses the shared resolver in BOTH the load and record paths", () => {
  const source = readFileSync(
    resolve(repositoryRoot, "components/review/PublicReviewPage.tsx"),
    "utf8",
  );
  const uses = source.match(/resolveDemoReviewerEmail\(/g) ?? [];
  assert.ok(
    uses.length >= 2,
    `expected resolveDemoReviewerEmail at both reviewer-email sites, found ${uses.length}`,
  );
  assert.ok(
    !source.includes(
      'requestedIntent === "approval_needed"\n                  ? demoReviewPayload.reviewer_email',
    ) &&
      !source.includes(
        '(requestedIntent === "approval_needed" ? demoReviewPayload.reviewer_email : null)',
      ),
    "the divergent intent-gated fallback must be gone from the load path",
  );
});

test("the demo payload's active pending approval step belongs to the demo reviewer", async () => {
  const { demoReviewPayload } = await import(
    moduleUrl("lib/review/demoReview.ts", "invariant-payload")
  );
  const normalize = (value?: string | null) =>
    value?.trim().toLowerCase() || null;
  const pending = [...demoReviewPayload.approvals]
    .sort((left, right) => left.step_order - right.step_order)
    .filter((approval) => approval.status === "pending");
  const active =
    demoReviewPayload.workflow_mode === "sequential"
      ? pending.slice(0, 1)
      : pending;
  assert.ok(
    active.length > 0,
    "the demo review must have an active pending step",
  );
  for (const step of active) {
    assert.equal(
      normalize(step.assignee_email),
      normalize(demoReviewPayload.reviewer_email),
      `step ${step.id} must be assigned to the demo reviewer or Approve/Request-changes stays hidden`,
    );
  }
});

test("an approve share with padded mixed-case email records its active-step decision", async () => {
  const workspace = await import(
    moduleUrl("lib/demo/workspace-store.ts", "record-instance")
  );
  const { demoReviewPayload, bindDemoReviewApprovals } = await import(
    moduleUrl("lib/review/demoReview.ts", "record-payload")
  );
  const { resolveDemoReviewerEmail } = await import(
    moduleUrl("lib/review/demo-reviewer-identity.ts", "record-resolver")
  );

  const state = workspace.getDemoWorkspaceSnapshot();
  const share = state.shareLinks.find(
    (link) => link.token === "demo-ica-final",
  );
  assert.ok(share, "seeded approval share exists");

  const reviewerEmail = resolveDemoReviewerEmail({
    shareReviewerEmail: "  APPROVALS@ica.EXAMPLE ",
    permissions: share.permission,
  });
  const bound = bindDemoReviewApprovals({
    approvals: demoReviewPayload.approvals,
    assetId: share.asset_ids[0],
    reviewerEmail,
    permission: share.permission,
  });
  const pending = bound
    .filter((approval) => approval.status === "pending")
    .sort((left, right) => left.step_order - right.step_order);
  const activeId = pending[0]?.id;
  assert.ok(activeId, "the share binds an active pending step");

  const decision = workspace.recordDemoPublicReviewApproval({
    projectId: "ica",
    assetId: share.asset_ids[0],
    versionId: "demo-version-4",
    reviewInviteId: share.id,
    reviewerName: "Resolver Probe",
    reviewerEmail,
    permission: share.permission,
    workflowMode: demoReviewPayload.workflow_mode,
    approvals: bound,
    initialAssetStatus: "in_review",
    approvalId: activeId,
    decision: "approved",
  });
  assert.equal(
    decision.ok,
    true,
    "the padded/mixed-case share email must resolve to the same active step",
  );
});
