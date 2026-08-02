import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.tsx"),
  "utf8",
);
const internalRoute = readFileSync(
  resolve(repositoryRoot, "components/review/InternalAssetReviewPage.tsx"),
  "utf8",
);

test("the canonical internal route preserves an explicitly selected media version", () => {
  assert.match(internalRoute, /const requestedVersionId = searchParams\.get\("version"\)/);
  assert.match(
    internalRoute,
    /buildCanonicalInternalReviewHref\([\s\S]*?requestedVersionId[\s\S]*?\)/,
  );
  assert.match(internalRoute, /version=\$\{encodeURIComponent\(versionId\)\}/);
});

test("the cockpit reads comments and edit decisions from one exact version", () => {
  assert.match(cockpit, /const requestedVersionId = searchParams\.get\("version"\)/);
  assert.match(cockpit, /fetch\(`\/api\/assets\/\$\{encodeURIComponent\(assetId\)\}\/versions`/);
  assert.match(cockpit, /const versionQuery = `version_id=\$\{encodeURIComponent\(versionId\)\}`/);
  assert.match(cockpit, /\/comments\?\$\{versionQuery\}/);
  assert.match(cockpit, /\/edit-decisions\?\$\{versionQuery\}/);
  assert.match(
    cockpit,
    /liveAssetDataId === activeAssetRecordId && liveAssetDataVersionId === activeVersionId[\s\S]*?\? liveComments[\s\S]*?: \[\]/,
  );
});

test("cockpit writes keep top-level notes, replies, comment status, and cuts on that version", () => {
  const submitComment = cockpit.match(
    /async function submitComment\(\) \{([\s\S]*?)\n  \}\n\n  function startReply/,
  )?.[1];
  assert.ok(submitComment, "submitComment is missing");
  assert.match(submitComment, /version_id: activeVersionId/);
  assert.match(submitComment, /parent_id: replyToComment\?\.id/);
  assert.match(submitComment, /versionId: activeVersionId/);
  assert.match(cockpit, /body: JSON\.stringify\(\{ id: comment\.id, status, version_id: activeVersionId \}\)/);

  const addCutDecision = cockpit.match(
    /async function addCutDecision\(\) \{([\s\S]*?)\n  \}\n\n  function handleReviewShortcutEvent/,
  )?.[1];
  assert.ok(addCutDecision, "addCutDecision is missing");
  assert.match(addCutDecision, /version_id: activeVersionId/);
});

test("cockpit preserves parent records and renders review threads through one reply composer", () => {
  assert.match(cockpit, /parent_id: typeof record\.parent_id === "string" \? record\.parent_id : null/);
  assert.match(cockpit, /const visibleCommentThreads = useMemo/);
  assert.match(cockpit, /function startReply\(comment: DemoReviewComment\)/);
  assert.match(cockpit, /canReplyToReviewThread/);
  assert.match(cockpit, /visibility: replyToComment\?\.visibility \?\? "internal"/);
  assert.match(cockpit, /replyToId: comment\.id/);
  assert.match(cockpit, /selectedThreadId: comment\.parent_id \?\? comment\.id/);
  assert.match(cockpit, /cockpit-comment-replies/);
});

test("one selected root thread drives the frame pins, timeline, and comment rail", () => {
  assert.match(cockpit, /const \[selectedCommentId, setSelectedCommentId\] = useState<string \| null>\(null\)/);
  assert.match(cockpit, /function selectReviewComment\(comment: DemoReviewComment, seek = true\)/);
  assert.match(cockpit, /const rootComment = comment\.parent_id/);
  assert.match(cockpit, /\.filter\(\(comment\) => !comment\.parent_id && comment\.pin_x != null/);
  assert.match(cockpit, /\.filter\(\(comment\) => !comment\.parent_id\)[\s\S]*?selectedCommentId=\{selectedCommentId\}/);
  assert.match(cockpit, /onMarkerActivate=\{\(marker\) => \{[\s\S]*?selectReviewComment\(comment\)/);
  assert.match(cockpit, /data-selected=\{comment\.id === selectedCommentId \? "true" : undefined\}/);
  assert.match(cockpit, /onClick=\{\(\) => selectReviewComment\(reply\)\}/);
});

test("the review cockpit uses one anchored composer for pins, timecodes, and replies", () => {
  assert.match(cockpit, /videoFrameRef\.current\?\.getBoundingClientRect\(\) \?\? event\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(cockpit, /function openReviewCommentAtPlayhead\(\)/);
  assert.match(cockpit, /<MessageSquarePlus size=\{18\} \/>/);
  assert.match(cockpit, /className="cockpit-inline-comment"/);
  assert.match(cockpit, /setPendingReviewComment\(\{ anchor, pin, timeSeconds \}\)/);
  assert.match(cockpit, /Add a comment at \$\{formatClock\(pendingReviewComment\.timeSeconds\)\}/);
  assert.match(cockpit, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(cockpit, /onClick=\{openReviewCommentAtPlayhead\}/);
  assert.doesNotMatch(cockpit, /cockpit-comment-composer/);
  assert.doesNotMatch(cockpit, /querySelector<HTMLInputElement>\("\.cockpit-comment-composer input"\)/);
  assert.match(cockpit, /Send comment and continue playback/);
});

test("an internal review draft stays attached while the reviewer navigates the thread", () => {
  const selection = cockpit.match(
    /function selectReviewComment\(comment: DemoReviewComment, seek = true\) \{([\s\S]*?)\n  \}\n\n  function openReviewCommentComposer/,
  )?.[1];

  assert.ok(selection, "selectReviewComment is missing");
  assert.doesNotMatch(selection, /setPendingReviewComment|setReplyToCommentId|setResumeAfterComment/);
  assert.match(
    cockpit,
    /function openReviewCommentComposer[\s\S]*?if \(pendingReviewComment\) \{[\s\S]*?commentInputRef\.current\?\.focus\(\)[\s\S]*?return false;/,
  );
  assert.match(
    cockpit,
    /const selectAsset = useCallback\(\(asset: MediaAsset\) => \{[\s\S]*?setCommentBody\(""\)[\s\S]*?setPendingReviewComment\(null\)/,
  );
  assert.match(
    cockpit,
    /function selectReviewVersion\(versionId: string\) \{[\s\S]*?setCommentBody\(""\)[\s\S]*?setPendingReviewComment\(null\)/,
  );
});

test("demo comment persistence failure leaves the review draft intact", () => {
  const submitComment = cockpit.match(
    /async function submitComment\(\) \{([\s\S]*?)\n  \}\n\n  function startReply/,
  )?.[1];
  assert.ok(submitComment, "submitComment is missing");
  assert.match(submitComment, /if \(!createdComment\) \{[\s\S]*?The comment could not be saved\.[\s\S]*?return;/);
  assert.ok(
    submitComment.indexOf("if (!createdComment)") < submitComment.indexOf('setCommentBody("")'),
    "the draft must not clear before demo persistence succeeds",
  );
});
