import assert from "node:assert/strict";
import test from "node:test";
import { renderReviewReport, selectReportComments } from "../lib/review/report.ts";
import type { Comment } from "../lib/types/codeliver.ts";

const comment = (patch: Partial<Comment> = {}): Comment => ({
  id: "note-1", asset_id: "asset-1", version_id: "version-1", parent_id: null,
  author_name: "Client", body: "Trim the opening.", visibility: "external", status: "open",
  created_at: "2026-09-21T12:00:00Z", timecode_seconds: 12.5, frame_number: 300,
  ...patch,
} as Comment);
const input = { assetId: "asset-1", assetTitle: "Film", projectName: "Project", versionId: "version-1", versionNumber: 1, approvalLabel: "In review", generatedAt: "2026-09-21T12:00:00Z", comments: [] as Comment[] };

test("report selects admitted asset/version external threads without orphan leaks", () => {
  const visible = comment({ replies: [comment({ id: "reply", parent_id: "note-1" })] });
  const selected = selectReportComments({ ...input, comments: [visible,
    comment({ id: "internal", visibility: "internal" }),
    comment({ id: "orphan", parent_id: "internal" }),
    comment({ id: "other-asset", asset_id: "asset-2" }),
    comment({ id: "other-version", version_id: "version-2" }),
    comment({ id: "general", version_id: null }),
  ] });
  assert.deepEqual(selected.map(c => c.id), ["note-1", "reply", "general"]);
});

test("report preserves notes, frames, vector drawings and safe reference images", () => {
  const html = renderReviewReport({ ...input, comments: [comment({
    pin_x: 27, pin_y: 34,
    annotations: [{ id: "drawing", comment_id: "note-1", asset_id: "asset-1", version_id: "version-1", data: { kind: "rectangle", x: .1, y: .2, width: .3, height: .4 } } as NonNullable<Comment["annotations"]>[number]],
    attachments: [{ id: "reference", comment_id: "note-1", file_url: "/api/review/reference.png", file_name: "Reference frame", file_type: "image/png", file_size: 10 }],
  })] });
  assert.match(html, /Trim the opening\./);
  assert.match(html, /00:12\.500/);
  assert.match(html, /Frame 300/);
  assert.match(html, /<svg/);
  assert.match(html, /cx="0.27" cy="0.34"/);
  assert.match(html, /Reference frame/);
  assert.match(html, /src="\/api\/review\/reference.png"/);
  assert.match(html, /@page/);
  assert.match(html, /Print or save PDF/);
});

test("report escapes user content and rejects active URLs and misbound attachments", () => {
  const html = renderReviewReport({ ...input, assetTitle: "<script>secret()</script>", comments: [comment({
    body: '<img src=x onerror="alert(1)">', author_name: "<b>Client</b>",
    attachments: [
      { id: "unsafe", comment_id: "note-1", file_url: "javascript:alert(1)", file_name: "Unsafe", file_type: "image/png", file_size: 1 },
      { id: "unbound", comment_id: "different", file_url: "https://example.test/private.png", file_name: "Private", file_type: "image/png", file_size: 1 },
    ],
  })] });
  assert.doesNotMatch(html, /<script>|<img src=x|src="javascript:|private\.png/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;b&gt;Client/);
});
