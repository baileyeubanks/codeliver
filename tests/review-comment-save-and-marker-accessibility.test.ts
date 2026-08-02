import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");

function read(relativePath: string) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

test("comment creation stays successful when the durable notification queue is unavailable", () => {
  const routes = [
    "app/api/review/[token]/comments/route.ts",
    "app/api/assets/[id]/comments/route.ts",
  ];

  for (const route of routes) {
    const source = read(route);
    assert.match(source, /Comment persisted but notification queue is unavailable/, route);
    assert.doesNotMatch(
      source,
      /return NextResponse\.json\(\s*\{ error: notification\.error, code: notification\.code \}/,
      route,
    );
    const afterNotificationFailure = source.slice(
      source.indexOf("Comment persisted but notification queue is unavailable"),
    );
    assert.match(
      afterNotificationFailure,
      /return NextResponse\.json\([\s\S]{0,180}\{ status: 201 \},?\s*\)/,
      route,
    );
  }
});

test("comment timeline pins preserve thread identity, avoid overlap, and remain keyboard targets", () => {
  const source = read("components/player/PlayerTimeline.tsx");
  const commentMarkers = source.slice(
    source.indexOf("{/* Comment markers */}"),
    source.indexOf("{cutMarkers.map"),
  );

  assert.match(source, /function getCommentMarkerAriaLabel\(/);
  assert.match(source, /export function positionTimelineCommentMarkers\(/);
  assert.match(commentMarkers, /<button/);
  assert.match(commentMarkers, /type="button"/);
  assert.match(commentMarkers, /data-comment-marker/);
  assert.match(commentMarkers, /aria-current=\{selected \? "true" : undefined\}/);
  assert.match(commentMarkers, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(commentMarkers, /if \(onCommentActivate\) onCommentActivate\(comment\)/);
  assert.match(commentMarkers, /focus-visible:outline/);

  const publicReview = read("app/review/[token]/page.tsx");
  assert.match(publicReview, /onCommentActivate=\{\(timelineComment\) => \{/);
  assert.match(publicReview, /handleCommentSelect\(comment\)/);
  assert.match(publicReview, /selectedCommentId=\{selectedCommentId\}/);
});

test("comment threads expose one keyboard action per control instead of nesting controls in a card button", () => {
  const thread = read("components/comments/CommentThread.tsx");
  const timecode = read("components/comments/TimecodeLink.tsx");

  assert.match(thread, /role=\{onSelect \? "group" : undefined\}/);
  assert.match(thread, /aria-label=\{onSelect \? `Comment thread \$\{index\}` : undefined\}/);
  assert.doesNotMatch(thread, /role=\{onSelect \? "button" : undefined\}/);
  assert.doesNotMatch(thread, /tabIndex=\{onSelect \? 0 : undefined\}/);
  assert.match(timecode, /event\.stopPropagation\(\);/);
});

test("public and internal replies reuse the parent moment instead of becoming a second pin", () => {
  const policy = read("lib/review/thread-policy.ts");
  const publicRoute = read("app/api/review/[token]/comments/route.ts");
  const internalRoute = read("app/api/assets/[id]/comments/route.ts");
  const composer = read("components/review/InlineReviewComment.tsx");
  const publicReview = read("app/review/[token]/page.tsx");
  const thread = read("components/comments/CommentThread.tsx");

  assert.match(policy, /export function replySourceFromParent\(/);
  assert.match(publicRoute, /replySource = replySourceFromParent\([\s\S]*?timecodeSeconds: parent\.data\.timecode_seconds/);
  assert.match(internalRoute, /replySource = replySourceFromParent\([\s\S]*?timecodeSeconds: parent\.data\.timecode_seconds/);
  assert.match(composer, /persistedPin: \{ x: number; y: number \} \| null;/);
  assert.match(composer, /pin: persistedPin,/);
  assert.match(thread, /!isReply && \(comment\.pin_x != null \|\| comment\.pin_y != null\)/);
  assert.match(publicReview, /function startReply[\s\S]*?videoRef\.current\?\.pause\(\);/);
});

test("a public review draft keeps its source until the reviewer submits or cancels it", () => {
  const publicReview = read("app/review/[token]/page.tsx");
  const selectHandler = publicReview.match(
    /function handleCommentSelect\(comment: ReviewComment\) \{([\s\S]*?)\n  \}\n\n  function beginCommentDraft/,
  )?.[1];

  assert.ok(selectHandler, "the comment-selection handler is missing");
  assert.match(publicReview, /interface ReviewCommentDraft \{/);
  assert.match(
    publicReview,
    /function beginCommentDraft\(draft: ReviewCommentDraft\) \{[\s\S]*?if \(commentDraft\) \{[\s\S]*?setDraftNotice\([\s\S]*?return false;/,
  );
  assert.doesNotMatch(selectHandler, /setCommentDraft|setDraftNotice/);
  assert.match(publicReview, /key=\{commentDraft\.id\}/);
  assert.match(publicReview, /annotationEnabled=\{canComment && asset\?\.file_type === "video" && !commentDraft\}/);
  assert.match(publicReview, /function handleFramePin[\s\S]*?videoRef\.current\?\.pause\(\);/);
});
