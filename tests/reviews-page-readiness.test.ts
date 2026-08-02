import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("app/(dashboard)/reviews/page.tsx", "utf8");
const styles = readFileSync(
  "app/(dashboard)/reviews/ReviewsPage.module.css",
  "utf8",
);
const shareRoute = readFileSync("app/api/assets/[id]/share/route.ts", "utf8");
const stateSurfaceSource = source.slice(
  source.indexOf("function ReviewPageStateSurface"),
  source.indexOf("export default function ReviewsPage"),
);

test("reviews page detail exposes share-link permission and readiness state", () => {
  assert.match(source, /Permission and readiness/);
  assert.match(source, /permissionLabel\(detail\.permission\)/);
  assert.match(source, /scopeLabel\(detail\)/);
  assert.match(source, /expiryLabel\(detail\.expires_at\)/);
  assert.match(source, /viewCapLabel\(detail\.max_views\)/);
  assert.match(source, /passwordProtectionLabel\(detail\.password_protected\)/);
  assert.doesNotMatch(source, /Password gate not configured/);
});

test("reviews page normalizes password protection without consuming secrets", () => {
  assert.match(source, /password_protected\?: boolean \| null/);
  assert.match(source, /typeof invite\.password_protected === "boolean"/);
  assert.match(source, /if \(value === true\) return "Password required"/);
  assert.match(source, /if \(value === false\) return "No password required"/);
  assert.match(source, /return "Password status unavailable"/);
  assert.doesNotMatch(source, /password_hash/);
  assert.match(shareRoute, /const passwordProtected = Boolean\(invite\.password_hash\)/);
  assert.match(shareRoute, /password_protected: passwordProtected/);
  assert.match(shareRoute, /delete safeInvite\.password_hash/);
});

test("pre-auth review states share one responsive surface at every breakpoint", () => {
  assert.ok(stateSurfaceSource.length > 0);
  assert.match(stateSurfaceSource, /className=\{styles\.stateSurface\}/);
  assert.doesNotMatch(stateSurfaceSource, /desktopComposition|mobileComposition/);
  assert.match(source, /return <ReviewPageStateSurface kind="loading" \/>/);
  assert.match(source, /return <ReviewPageStateSurface kind="unavailable" \/>/);
  assert.match(styles, /\.stateSurface \{/);
  assert.match(
    styles,
    /@media \(max-width: 760px\) \{[\s\S]*?\.stateSurface \{/,
  );
  assert.doesNotMatch(styles, /\.stateSurface\s*\{[^}]*display:\s*none/);
});

test("reviews page uses an icon button for modal close", () => {
  assert.match(source, /<X size=\{18\} \/>/);
  assert.doesNotMatch(source, />✕</);
});

test("reviews manager preserves staff, client, list, and revoke authority", () => {
  assert.match(source, /return <ClientReviewInbox \/>/);
  assert.match(source, /authSession\.session\?\.surfaceRole !== "staff"/);
  assert.match(source, /loadRemoteShareLinks\(controller\.signal, authSession\.session\.id\)/);
  assert.match(source, /fetch\("\/api\/projects"/);
  assert.match(source, /`\/api\/assets\/\$\{encodeURIComponent\(assetId\)\}\/share`/);
  assert.match(source, /`\/api\/assets\/\$\{encodeURIComponent\(link\.asset_id\)\}\/share`/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /Revoked links cannot be restored/);
  assert.doesNotMatch(source, /fetch\("\/api\/sharing"/);
});

test("review URLs are created only from bounded records and a verified runtime origin", () => {
  assert.match(source, /readItems\(await projectsResponse\.json\(\), "Projects"\)/);
  assert.match(source, /normalizeRemoteShareLink\(invite, assetId, currentUserId\)/);
  assert.match(source, /`\/review\/\$\{encodeURIComponent\(token\)\}`/);
  assert.match(source, /toClientSiteUrl\(value, runtimeOrigin\)/);
  assert.match(source, /toDemoSiteUrl\(value, runtimeOrigin\)/);
});

test("runtime-origin resolution cannot diverge between server and first client render", () => {
  assert.match(source, /const \[runtimeOrigin, setRuntimeOrigin\] = useState<string \| null>\(null\)/);
  assert.match(source, /if \(!runtimeOrigin\) return null/);
});
