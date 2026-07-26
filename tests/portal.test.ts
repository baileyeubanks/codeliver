import assert from "node:assert/strict";
import test from "node:test";

import { clientProjectStatus, CLIENT_PROJECT_STATUSES } from "../lib/portal/status.ts";
import {
  deriveActionItems,
  reviewHrefForAsset,
  type PortalApprovalStageRef,
  type PortalAssetRef,
  type PortalShareLinkRef,
} from "../lib/portal/actions.ts";
import {
  CLIENT_SAFE_ACTIVITY_ACTIONS,
  clientSafeActivity,
  isClientSafeActivityAction,
  type PortalActivityInput,
} from "../lib/portal/activity.ts";
import {
  activePortalProjects,
  formatPortalDate,
  latestReviews,
  recentDeliveries,
  resolveClientIdentity,
  reviewStatusForAsset,
} from "../lib/portal/views.ts";

/* ── Plain-language status mapping ─────────────────────────────────────── */

test("clientProjectStatus maps every internal stage to plain language", () => {
  assert.equal(clientProjectStatus("inquiry"), "Planning");
  assert.equal(clientProjectStatus("intake"), "Planning");
  assert.equal(clientProjectStatus("development"), "Planning");
  assert.equal(clientProjectStatus("preproduction"), "Planning");
  assert.equal(clientProjectStatus("production"), "Production");
  assert.equal(clientProjectStatus("post"), "Editing");
  assert.equal(clientProjectStatus("review"), "Awaiting Feedback");
  assert.equal(clientProjectStatus("delivery"), "Final Delivery");
});

test("clientProjectStatus hides archived and unknown stages", () => {
  assert.equal(clientProjectStatus("archived"), null);
  assert.equal(clientProjectStatus(undefined), null);
  assert.equal(clientProjectStatus(null), null);
  assert.equal(clientProjectStatus("qc_internal"), null);
});

test("plain-language vocabulary contains exactly the five specced phrases", () => {
  assert.deepEqual([...CLIENT_PROJECT_STATUSES], [
    "Planning",
    "Production",
    "Editing",
    "Awaiting Feedback",
    "Final Delivery",
  ]);
});

/* ── Action-item derivation ────────────────────────────────────────────── */

const assets: PortalAssetRef[] = [
  { id: "denie-mcdonald-v4", project_id: "ica", title: "Denie McDonald_v4" },
  { id: "charles-drummond-v5", project_id: "ica", title: "Charles Drummond_v5" },
];

const shareLinks: PortalShareLinkRef[] = [
  {
    id: "share-ceraweek-cuts",
    asset_ids: ["denie-mcdonald-v4", "charles-drummond-v5"],
    is_active: true,
    public_url:
      "/review/demo?demo=1&asset=denie-mcdonald-v4&assets=denie-mcdonald-v4%2Ccharles-drummond-v5&intent=client_review&share=demo-ceraweek-cuts",
  },
];

const approvalStages: PortalApprovalStageRef[] = [
  {
    id: "approval-denie-client",
    project_id: "ica",
    asset_id: "denie-mcdonald-v4",
    name: "Client Review",
    reviewer_names: ["Client Reviewer", "Jordan Miles"],
    approved_reviewer_names: ["Client Reviewer"],
    status: "in_progress",
  },
  {
    id: "approval-denie-final",
    project_id: "ica",
    asset_id: "denie-mcdonald-v4",
    name: "Final Approval",
    reviewer_names: ["Lena Ortiz"],
    approved_reviewer_names: [],
    status: "pending",
  },
  {
    id: "approval-charles-final",
    project_id: "ica",
    asset_id: "charles-drummond-v5",
    name: "Final Approval",
    reviewer_names: ["Lena Ortiz"],
    approved_reviewer_names: [],
    status: "approved",
  },
];

test("deriveActionItems turns open stages into approval/feedback items, approvals first", () => {
  const items = deriveActionItems({ assets, shareLinks, approvalStages });
  assert.equal(items.length, 2);

  assert.equal(items[0].kind, "approval");
  assert.equal(items[0].title, "Approve “Denie McDonald_v4”");
  assert.equal(items[0].actionLabel, "Review & approve");
  assert.equal(items[0].detail, "Final Approval · 0 of 1 reviewers in");

  assert.equal(items[1].kind, "feedback");
  assert.equal(items[1].title, "Share feedback on “Denie McDonald_v4”");
  assert.equal(items[1].actionLabel, "Give feedback");
  assert.equal(items[1].detail, "Client Review · 1 of 2 reviewers in");
});

test("action items link to the live review share URL", () => {
  const items = deriveActionItems({ assets, shareLinks, approvalStages });
  for (const item of items) {
    assert.equal(item.href, shareLinks[0].public_url);
    assert.match(item.href ?? "", /^\/review\/demo\?demo=1/);
  }
});

test("completed stages and unknown assets never produce items", () => {
  const items = deriveActionItems({
    assets,
    shareLinks,
    approvalStages: [
      approvalStages[2], // already approved
      { ...approvalStages[0], id: "ghost", asset_id: "missing-asset" },
    ],
  });
  assert.deepEqual(items, []);
});

test("empty workspace yields the honest empty state (no items)", () => {
  assert.deepEqual(
    deriveActionItems({ assets: [], shareLinks: [], approvalStages: [] }),
    [],
  );
});

test("reviewHrefForAsset falls back to the plain review surface without a share link", () => {
  assert.equal(reviewHrefForAsset("kevin-bowers-v2", shareLinks), "/review/demo?demo=1&asset=kevin-bowers-v2");
  assert.equal(reviewHrefForAsset("kevin-bowers-v2", []), "/review/demo?demo=1&asset=kevin-bowers-v2");
});

test("inactive share links are never used for actions", () => {
  const href = reviewHrefForAsset("denie-mcdonald-v4", [
    { ...shareLinks[0], is_active: false },
  ]);
  assert.equal(href, "/review/demo?demo=1&asset=denie-mcdonald-v4");
});

test("studio questions and upload requests become items in kind order", () => {
  const items = deriveActionItems({
    assets,
    shareLinks,
    approvalStages: [],
    uploadRequests: [
      { id: "up-1", project_id: "ica", title: "Signed appearance releases", due_label: "Before Friday", href: "/portal/uploads/up-1" },
    ],
    comments: [
      { id: "q-1", asset_id: "denie-mcdonald-v4", author_name: "Content Co-op", body: "Which logo lockup should close the film?", status: "open" },
      { id: "c-1", asset_id: "denie-mcdonald-v4", author_name: "Client Reviewer", body: "Is this the final grade?", status: "open" },
      { id: "c-2", asset_id: "denie-mcdonald-v4", author_name: "Content Co-op", body: "Resolved question?", status: "resolved" },
      { id: "c-3", asset_id: "denie-mcdonald-v4", author_name: "Content Co-op", body: "Statement, not a question.", status: "open" },
    ],
  });
  assert.deepEqual(items.map((item) => item.kind), ["upload", "question"]);
  assert.equal(items[0].title, "Upload: Signed appearance releases");
  assert.equal(items[0].detail, "Requested · Before Friday");
  assert.equal(items[1].title, "Answer: “Which logo lockup should close the film?”");
  assert.equal(items[1].detail, "Question on Denie McDonald_v4");
  assert.equal(items[1].href, shareLinks[0].public_url);
});

/* ── Client-safe activity ──────────────────────────────────────────────── */

function activityItem(action: string, details: Record<string, string>, id = `a-${action}`): PortalActivityInput {
  return {
    id,
    action,
    actor_name: "Bailey Eubanks",
    details,
    created_at: "2026-07-14T21:53:00.000Z",
    project_id: "ica",
    asset_id: null,
  };
}

test("clientSafeActivity rephrases progress events in plain language", () => {
  const events = clientSafeActivity([
    activityItem("uploaded_new_version", { asset_title: "Denie McDonald_v4" }),
    activityItem("rendered_sequence", { name: "McLaren Podcast — radio cut" }),
    activityItem("approved_asset", { asset_title: "ICA_ROADSHOW_x_FINAL" }),
    activityItem("deliverable_delivered", { name: "ICA_ROADSHOW_MASTER_16x9.mov" }),
  ]);
  assert.deepEqual(events.map((event) => event.message), [
    "New cut ready: Denie McDonald_v4",
    "New cut ready: McLaren Podcast — radio cut",
    "Approved: ICA_ROADSHOW_x_FINAL",
    "Delivered: ICA_ROADSHOW_MASTER_16x9.mov",
  ]);
});

test("clientSafeActivity excludes every internal noise kind", () => {
  const internalNoise = [
    activityItem("added_comment", { asset_title: "Cut", body: "Tighten the pause" }),
    activityItem("added_crew_member", { name: "Cesar Berrones", role: "DP" }),
    activityItem("milestone_paid", { label: "50% production", method: "card" }),
    activityItem("checkout_created", { label: "50% production", provider: "mock" }),
    activityItem("compiled_bid", { total: "48000" }),
    activityItem("stage_advanced_post", { from: "production", to: "post" }),
    activityItem("specced_deliverable", { name: "Master" }),
    activityItem("qc_gate_passed", { name: "Master", gate: "loudness" }),
    activityItem("marked_cut_decision", { asset_title: "Cut", time_seconds: "12.50" }),
    activityItem("recorded_decision", { subject: "Scope call" }),
    activityItem("refined_select", { range: "10→20" }),
    activityItem("split_clip", { at: "42" }),
    activityItem("added_location", { name: "KBH Desalination" }),
    activityItem("opened_release", { person: "Adam Wickersham" }),
    activityItem("requested_cutdown", { asset_title: "Cut" }),
    activityItem("archived_asset", { asset_title: "Old cut" }),
    activityItem("moved_asset_to_trash", { asset_title: "Old cut" }),
    activityItem("started_discovery", { inquiry: "New business" }),
    activityItem("some_future_internal_action", { anything: "x" }),
  ];
  assert.deepEqual(clientSafeActivity(internalNoise), []);
});

test("clientSafeActivity drops safe kinds with missing subjects and honors limit", () => {
  const events = clientSafeActivity(
    [
      activityItem("uploaded_new_version", {}), // no asset_title → dropped
      activityItem("approved_asset", { asset_title: "One" }, "a-1"),
      activityItem("approved_asset", { asset_title: "Two" }, "a-2"),
      activityItem("approved_asset", { asset_title: "Three" }, "a-3"),
    ],
    2,
  );
  assert.deepEqual(events.map((event) => event.message), ["Approved: One", "Approved: Two"]);
});

test("the allowlist holds exactly the four client-meaningful kinds", () => {
  assert.deepEqual([...CLIENT_SAFE_ACTIVITY_ACTIONS].sort(), [
    "approved_asset",
    "deliverable_delivered",
    "rendered_sequence",
    "uploaded_new_version",
  ]);
  assert.equal(isClientSafeActivityAction("approved_asset"), true);
  assert.equal(isClientSafeActivityAction("added_comment"), false);
});

/* ── Views: identity, projects, reviews, deliveries ────────────────────── */

test("resolveClientIdentity finds the org behind live share-link emails", () => {
  const identity = resolveClientIdentity(
    [
      { id: "s1", asset_ids: [], reviewer_email: "approvals@ica.example", is_active: true, public_url: "/x", created_at: "2026-07-14T21:58:00.000Z" },
      { id: "s2", asset_ids: [], reviewer_email: "review@ica.example", is_active: true, public_url: "/y", created_at: "2026-07-14T20:35:00.000Z" },
      { id: "s3", asset_ids: [], reviewer_email: "old@schneider.example", is_active: false, public_url: "/z", created_at: "2026-07-13T00:00:00.000Z" },
    ],
    [
      { id: "c1", organization_id: "org-ica", name: "Morgan Lee", email: "morgan@ica.example", is_primary: true },
      { id: "c2", organization_id: "org-ica", name: "Jordan Miles", email: "jordan@ica.example", is_primary: false },
    ],
    [{ id: "org-ica", name: "Industrial Contractors Association" }],
  );
  assert.equal(identity.organizationName, "Industrial Contractors Association");
  assert.equal(identity.contactName, "Morgan Lee");
});

test("resolveClientIdentity is honest when nothing links out", () => {
  assert.deepEqual(resolveClientIdentity([], [], []), {
    organizationName: null,
    contactName: null,
  });
});

test("formatPortalDate renders UTC-stable short dates", () => {
  assert.equal(formatPortalDate("2026-07-24"), "Jul 24");
  assert.equal(formatPortalDate("2026-03-09T19:30:00.000Z"), "Mar 9");
});

test("activePortalProjects hides archived and attaches milestone + thumbnail", () => {
  const projects = activePortalProjects({
    projects: [
      { id: "ica", name: "ICA", stage: "review" },
      { id: "bp", name: "bp", stage: "production" },
      { id: "closed", name: "Closed", stage: "archived" },
    ],
    planItems: [
      { id: "p1", project_id: "bp", kind: "task", title: "Collect releases", date: "2026-07-18", status: "in_progress" },
      { id: "p2", project_id: "bp", kind: "milestone", title: "Rough cut to Rachel", date: "2026-07-24", status: "pending" },
      { id: "p3", project_id: "bp", kind: "milestone", title: "Old milestone", date: "2026-07-01", status: "done" },
    ],
    assets: [
      { id: "a1", project_id: "ica", title: "Cut", file_type: "video", status: "in_review", thumbnail_url: "/demo/a.jpg", created_at: "2026-07-14T21:53:00.000Z" },
    ],
  });
  assert.deepEqual(projects.map((project) => project.id), ["ica", "bp"]);
  assert.equal(projects[0].status, "Awaiting Feedback");
  assert.equal(projects[0].thumbnailUrl, "/demo/a.jpg");
  assert.equal(projects[1].status, "Production");
  assert.equal(projects[1].milestoneTitle, "Rough cut to Rachel");
  assert.equal(projects[1].nextDateLabel, "Jul 24");
  assert.equal(projects[1].thumbnailUrl, null);
});

test("reviewStatusForAsset: approved wins, full feedback second, else needs review", () => {
  const base = { id: "a", project_id: "p", title: "t", file_type: "video", created_at: "2026-07-14T00:00:00.000Z" };
  assert.equal(reviewStatusForAsset({ ...base, status: "approved" }), "Approved");
  assert.equal(
    reviewStatusForAsset({ ...base, status: "in_review", reviewer_count: 2, reviewer_done: 2 }),
    "Feedback Submitted",
  );
  assert.equal(
    reviewStatusForAsset({ ...base, status: "in_review", reviewer_count: 2, reviewer_done: 1 }),
    "Needs Review",
  );
  assert.equal(reviewStatusForAsset({ ...base, status: "draft" }), "Needs Review");
});

test("latestReviews emits one item per shared asset, newest links first, with version labels", () => {
  const items = latestReviews({
    assets: [
      { id: "denie-mcdonald-v4", project_id: "ica", title: "Denie McDonald_v4", file_type: "video", status: "in_review", version_count: 4, reviewer_count: 2, reviewer_done: 1, created_at: "2026-07-14T21:53:00.000Z" },
      { id: "ica-roadshow-final", project_id: "ica", title: "ICA_ROADSHOW_x_FINAL", file_type: "video", status: "approved", version_count: 5, created_at: "2026-03-08T16:12:00.000Z" },
    ],
    shareLinks: [
      { id: "share-cuts", asset_ids: ["denie-mcdonald-v4"], is_active: true, public_url: "/review/demo?demo=1&share=cuts", created_at: "2026-07-14T20:35:00.000Z" },
      { id: "share-final", asset_ids: ["ica-roadshow-final"], is_active: true, public_url: "/review/demo?demo=1&share=final", created_at: "2026-07-14T21:58:00.000Z" },
      { id: "share-dead", asset_ids: ["denie-mcdonald-v4"], is_active: false, public_url: "/review/demo?demo=1&share=dead", created_at: "2026-07-14T23:00:00.000Z" },
    ],
  });
  assert.deepEqual(items.map((item) => item.assetId), ["ica-roadshow-final", "denie-mcdonald-v4"]);
  assert.equal(items[0].status, "Approved");
  assert.equal(items[0].versionLabel, "v5");
  assert.equal(items[0].href, "/review/demo?demo=1&share=final");
  assert.equal(items[1].status, "Needs Review");
  assert.equal(items[1].versionLabel, "v4");
});

test("recentDeliveries: real files get downloads, file-less masters are on request", () => {
  const deliveries = recentDeliveries({
    deliverables: [
      { id: "del-1", project_id: "ica", name: "ICA_ROADSHOW_MASTER_16x9.mov", spec: { resolution: "3840x2160", codec: "ProRes 422 HQ", aspect: "16:9" }, status: "delivered", delivered_at: "2026-03-09T19:30:00.000Z" },
      { id: "del-2", project_id: "ica", name: "SOCIAL_9x16.mp4", spec: { resolution: "1080x1920", codec: "H.264", aspect: "9:16" }, status: "qc", delivered_at: null },
    ],
    assets: [
      { id: "a1", project_id: "ica", title: "ICA CEO Hero Cut_v1", file_type: "video", status: "approved", file_url: "/demo/ica-ceo-preview.mp4", created_at: "2026-07-10T15:00:00.000Z" },
      { id: "a2", project_id: "ica", title: "ICA_ROADSHOW_x_FINAL", file_type: "video", status: "approved", created_at: "2026-03-08T16:12:00.000Z" },
      { id: "a3", project_id: "ica", title: "Denie McDonald_v4", file_type: "video", status: "in_review", created_at: "2026-07-14T21:53:00.000Z" },
    ],
  });
  assert.deepEqual(deliveries.map((delivery) => delivery.id), ["a1", "del-1", "a2"]);
  const hero = deliveries[0];
  assert.equal(hero.downloadHref, "/demo/ica-ceo-preview.mp4");
  assert.deepEqual(hero.formatChips, ["VIDEO", "MP4"]);
  const master = deliveries[1];
  assert.equal(master.downloadHref, null);
  assert.deepEqual(master.formatChips, ["ProRes 422 HQ", "16:9", "3840x2160"]);
  // QC-gated and in-review work never appears as delivered.
  assert.ok(!deliveries.some((delivery) => delivery.id === "del-2" || delivery.id === "a3"));
});
