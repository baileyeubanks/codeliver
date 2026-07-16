import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
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
  if (instance) url.searchParams.set("journey", instance);
  return url.href;
}

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("the local demo journey persists account, project, media, review, share, and settings state across reload", async () => {
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

  try {
    const workspace = await import(moduleUrl("lib/demo/workspace-store.ts", "primary"));
    const { buildInternalDemoAssetHref } = await import(moduleUrl("lib/demo/workspace.ts"));
    const key = workspace.DEMO_WORKSPACE_STORAGE_KEY as string;
    const readState = () => JSON.parse(values.get(key) ?? "null") as {
      session: { authenticated: boolean; email: string };
      projects: Array<{ id: string; name: string }>;
      assets: Array<{ id: string; comment_count?: number }>;
      archivedAssets: Array<{ id: string }>;
      trashedAssets: Array<{ id: string }>;
      shareLinks: Array<{
        id: string;
        is_active: boolean;
        permission: string;
        notification_channels?: string[];
        notification_status?: string;
        public_url: string;
      }>;
      reviewComments: Array<{ asset_id: string; body: string; status: string }>;
      reviewCutMarkers: Array<{ asset_id: string; time_seconds: number }>;
      approvalStages: Array<{ id: string; status: string }>;
      settings: {
        profile: { firstName: string; lastName: string; reviewerColor: string };
        appearance: { darkMode: boolean; reducedMotion: boolean };
        notifications: {
          email: { enabled: boolean; digest: string };
          sms: { enabled: boolean; phone: string };
          imessage: { enabled: boolean; status: string };
        };
        brand: { displayName: string; playerLabel: string; primaryColor: string };
      };
    };

    workspace.registerDemoAccount("reviewer@example.com", "Taylor Reviewer");
    assert.deepEqual(readState().session, {
      authenticated: false,
      email: "reviewer@example.com",
      lastSignedInAt: null,
    });
    workspace.signInDemoSession("reviewer@example.com");

    const project = workspace.createDemoProject("Journey Regression");
    const assetId = "journey-regression-v1";
    workspace.addDemoAssets([
      {
        id: assetId,
        project_id: project.id,
        title: "Journey Regression_v1",
        thumbnail_url: "/demo/ceraweek-speaker.jpg",
        file_type: "video",
        duration_seconds: 90,
        status: "in_review",
        version_count: 1,
        reviewer_count: 1,
        reviewer_done: 0,
        comment_count: 0,
        created_at: "2026-07-14T20:00:00.000Z",
        href: buildInternalDemoAssetHref(project.id, assetId),
      },
    ]);
    workspace.addDemoReviewComment({
      projectId: project.id,
      assetId,
      body: "  Keep this note through reload.  ",
      timeSeconds: 12.5,
      pinX: 25,
      pinY: 75,
    });
    workspace.addDemoReviewCutMarker({ projectId: project.id, assetId, timeSeconds: -2 });
    workspace.addDemoReviewCutMarker({ projectId: project.id, assetId, timeSeconds: 0.1 });
    workspace.addDemoReviewCutMarker({ projectId: project.id, assetId, timeSeconds: 8 });
    workspace.approveDemoStage("approval-denie-client");

    const links = workspace.createDemoShareLinks({
      assetIds: [assetId, assetId],
      reviewerName: "Client Approver",
      reviewerEmail: "approver@example.com",
      shareIntent: "approval_needed",
      requireName: true,
      allowDownloads: false,
      watermarkEnabled: true,
      expiresAt: "2026-07-20T20:00:00.000Z",
      maxViews: 5,
      notificationChannels: ["email", "email", "sms"],
    });
    assert.equal(links.length, 1, "batch creation must deduplicate repeated assets");
    workspace.setDemoShareLinkActive(links[0].id, false);

    workspace.updateDemoProfile({ reviewerColor: "#123456" });
    workspace.updateDemoAppearance({ darkMode: false, reducedMotion: true });
    workspace.updateDemoNotificationChannel("email", { digest: "daily" });
    workspace.updateDemoNotificationChannel("sms", { enabled: true, phone: "+12145550199" });
    workspace.updateDemoNotificationChannel("imessage", { enabled: true, status: "dry_run" });
    workspace.updateDemoBrand({
      displayName: "Journey Brand",
      playerLabel: "Reviewed in Journey QA",
      primaryColor: "#204060",
    });

    workspace.archiveDemoAsset(assetId);
    assert.equal(readState().archivedAssets.some((asset) => asset.id === assetId), true);
    workspace.restoreDemoArchivedAsset(assetId);
    workspace.moveDemoAssetToTrash(assetId);
    assert.equal(readState().trashedAssets.some((asset) => asset.id === assetId), true);
    workspace.restoreDemoAsset(assetId);
    workspace.signOutDemoSession();

    const beforeReload = readState();
    assert.equal(beforeReload.session.authenticated, false);
    assert.equal(beforeReload.projects.some((item) => item.id === project.id), true);
    assert.equal(beforeReload.assets.find((asset) => asset.id === assetId)?.comment_count, 1);
    assert.equal(beforeReload.reviewComments[0].body, "Keep this note through reload.");
    assert.deepEqual(
      beforeReload.reviewCutMarkers
        .filter((marker) => marker.asset_id === assetId)
        .map((marker) => marker.time_seconds),
      [0, 8],
    );
    assert.equal(
      beforeReload.approvalStages.find((stage) => stage.id === "approval-denie-client")?.status,
      "approved",
    );
    assert.equal(beforeReload.shareLinks[0].is_active, false);
    assert.equal(beforeReload.shareLinks[0].permission, "approve");
    assert.deepEqual(beforeReload.shareLinks[0].notification_channels, ["email", "sms"]);
    assert.equal(beforeReload.shareLinks[0].notification_status, "dry_run");
    assert.match(beforeReload.shareLinks[0].public_url, /^\/review\/demo\?/);
    assert.equal(beforeReload.settings.appearance.reducedMotion, true);
    assert.equal(beforeReload.settings.notifications.email.digest, "daily");
    assert.equal(beforeReload.settings.notifications.sms.phone, "+12145550199");
    assert.equal(beforeReload.settings.notifications.imessage.status, "dry_run");
    assert.equal(beforeReload.settings.brand.displayName, "Journey Brand");

    const reloadedWorkspace = await import(moduleUrl("lib/demo/workspace-store.ts", "reload"));
    reloadedWorkspace.updateDemoAppearance({ reducedMotion: false });
    const afterReload = readState();
    assert.equal(afterReload.projects.some((item) => item.id === project.id), true);
    assert.equal(afterReload.reviewComments.some((comment) => comment.asset_id === assetId), true);
    assert.equal(afterReload.shareLinks.some((link) => link.id === links[0].id), true);
    assert.equal(afterReload.settings.appearance.reducedMotion, false);
    assert.equal(afterReload.session.authenticated, false);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});

test("external approval authority is recipient-specific, sequential, and identity-redacted", async () => {
  const { demoReviewPayload } = await import(moduleUrl("lib/review/demoReview.ts"));
  const { canInviteDecideApproval, getExternalApprovalState } = await import(
    moduleUrl("lib/review-invites.ts")
  );
  const invite = {
    ...demoReviewPayload.invite,
    asset_id: demoReviewPayload.asset.id,
    version_id: "demo-version-4",
    token: "demo",
    reviewer_name: demoReviewPayload.reviewer_name,
    reviewer_email: demoReviewPayload.reviewer_email,
    permissions: demoReviewPayload.permissions,
    password_hash: null,
    expires_at: demoReviewPayload.expires_at,
    watermark_enabled: demoReviewPayload.watermark_enabled,
    watermark_text: demoReviewPayload.watermark_text,
    download_enabled: demoReviewPayload.download_enabled,
    last_viewed_at: null,
  };

  const state = getExternalApprovalState({
    approvals: demoReviewPayload.approvals,
    invite,
    workflowMode: "sequential",
  });
  assert.deepEqual(state.activeApprovalIds, ["approval-1"]);
  assert.equal(state.approvals.every((approval: { assignee_email: unknown }) => approval.assignee_email === null), true);
  assert.equal(
    canInviteDecideApproval({
      approvalId: "approval-1",
      approvals: demoReviewPayload.approvals,
      invite,
      workflowMode: "sequential",
    }).ok,
    true,
  );
  assert.equal(
    canInviteDecideApproval({
      approvalId: "approval-2",
      approvals: demoReviewPayload.approvals,
      invite,
      workflowMode: "sequential",
    }).ok,
    false,
  );
  assert.equal(
    canInviteDecideApproval({
      approvalId: "approval-1",
      approvals: demoReviewPayload.approvals,
      invite: { ...invite, permissions: "comment" },
      workflowMode: "sequential",
    }).ok,
    false,
  );
});

test(
  "safe demo approval endpoint enforces the same recipient authority as production",
  { skip: process.env.NODE_ENV === "production" },
  async () => {
    const { PATCH } = await import(moduleUrl("app/api/review/[token]/approvals/route.ts"));
    const authorized = await PATCH(
      new Request("http://localhost/api/review/demo/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "approval-1", status: "approved" }),
      }),
      { params: Promise.resolve({ token: "demo" }) },
    );
    assert.equal(authorized.status, 200);

    const foreignStep = await PATCH(
      new Request("http://localhost/api/review/demo/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "approval-2", status: "rejected" }),
      }),
      { params: Promise.resolve({ token: "demo" }) },
    );
    assert.equal(
      foreignStep.status,
      403,
      "the external demo reviewer can decide an internal producer approval step",
    );
  },
);

test(
  "safe demo comment endpoint rejects malformed annotations and emits external comments only",
  { skip: process.env.NODE_ENV === "production" },
  async () => {
    const { POST } = await import(moduleUrl("app/api/review/[token]/comments/route.ts"));
    const malformed = await POST(
      new Request("http://localhost/api/review/demo/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "Pinned", pin_x: 50, pin_y: null }),
      }),
      { params: Promise.resolve({ token: "demo" }) },
    );
    assert.equal(malformed.status, 400);

    const accepted = await POST(
      new Request("http://localhost/api/review/demo/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: "  Version note  ",
          author_name: "External Reviewer",
          timecode_seconds: 4.25,
          pin_x: 25,
          pin_y: 75,
        }),
      }),
      { params: Promise.resolve({ token: "demo" }) },
    );
    assert.equal(accepted.status, 201);
    const comment = await accepted.json();
    assert.equal(comment.body, "Version note");
    assert.equal(comment.visibility, "external");
    assert.equal(comment.asset_id, "demo-asset");
    assert.equal(comment.timecode_seconds, 4.25);
    assert.deepEqual([comment.pin_x, comment.pin_y], [25, 75]);
  },
);

test("public review comments persist through the demo workspace authority", () => {
  const publicReview = source("app/review/[token]/page.tsx");
  const submitComment = source("lib/review/submit-review-comment.ts");

  assert.equal(
    /addDemoReviewComment\s*\(/.test(`${publicReview}\n${submitComment}`),
    true,
    "public demo comments exist only in component state and disappear on reload",
  );
});

test("public review approvals persist through the demo workspace authority", () => {
  const publicReview = source("app/review/[token]/page.tsx");
  const handlerStart = publicReview.indexOf("async function handleApprovalDecision");
  const handlerEnd = publicReview.indexOf("\n  function renderPins", handlerStart);
  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);

  assert.equal(
    /(?:approve|record|update)Demo[A-Za-z]*Approval[A-Za-z]*\s*\(/.test(
      publicReview.slice(handlerStart, handlerEnd),
    ),
    true,
    "public demo approval decisions exist only in component state and disappear on reload",
  );
});

test("public recipient reads and mutations remain bound to invite, asset, version, and visibility", () => {
  const reviewRoute = source("app/api/review/[token]/route.ts");
  const commentRoute = source("app/api/review/[token]/comments/route.ts");
  const cutRoute = source("app/api/review/[token]/edit-decisions/route.ts");

  assert.match(reviewRoute, /\.eq\("version_id", versionLookup\.version\.id\)/);
  assert.match(reviewRoute, /\.eq\("visibility", "external"\)/);
  assert.match(commentRoute, /parent\.data\.version_id !== versionLookup\.version\.id/);
  assert.match(commentRoute, /review_invite_id: invite\.id/);
  assert.match(commentRoute, /visibility: "external"/);
  assert.match(cutRoute, /\.eq\("review_invite_id", invite\.id\)/);
  assert.match(cutRoute, /\.eq\("version_id", versionLookup\.version\.id\)/);
  assert.match(cutRoute, /status: "proposed"/);
});
