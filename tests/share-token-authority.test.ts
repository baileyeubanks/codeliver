import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shareService = readFileSync(
  new URL("../lib/sharing/share-service.ts", import.meta.url),
  "utf8",
);
const shareRoute = readFileSync(
  new URL("../app/api/assets/[id]/share/route.ts", import.meta.url),
  "utf8",
);
const reviewInvites = readFileSync(
  new URL("../lib/review-invites.ts", import.meta.url),
  "utf8",
);
const teamInviteRoute = readFileSync(
  new URL("../app/api/teams/invites/route.ts", import.meta.url),
  "utf8",
);
const teamInvitePage = readFileSync(
  new URL("../components/auth/TeamInviteAcceptance.tsx", import.meta.url),
  "utf8",
);

test("share creation and rotation persist opaque credentials through the authority helper", () => {
  assert.match(
    shareService,
    /\.\.\.persistedOpaqueTokenFields\(tokens\[index\]\)/,
  );
  assert.match(
    shareService,
    /\.\.\.persistedOpaqueTokenFields\(replacementToken\)/,
  );
  assert.doesNotMatch(shareService, /token:\s*tokens\[index\]/);
  assert.doesNotMatch(shareService, /token:\s*newToken\(\)/);
  assert.match(reviewInvites, /\.\.\.persistedOpaqueTokenFields\(token\)/);
});

test("external share creation requires producer authority while previews allow editors", () => {
  assert.match(
    shareService,
    /const minimumRole = manifest\.operation === "preview" \? "editor" : "producer"/,
  );
  assert.match(
    shareService,
    /getAssetAccess\([\s\S]*item\.assetId,[\s\S]*userId,[\s\S]*minimumRole,[\s\S]*client/,
  );
  assert.doesNotMatch(
    shareService,
    /getAssetAccess\(item\.assetId, userId, "member", client\)/,
  );
});

test("token lookup hashes isolated-schema bearer credentials", () => {
  assert.match(reviewInvites, /const lookup = opaqueTokenLookup\(token\)/);
  assert.match(reviewInvites, /\.eq\(lookup\.column, lookup\.value\)/);
  assert.doesNotMatch(reviewInvites, /\.eq\(["']token["'],\s*token\)/);
});

test("authorized share responses recover the ephemeral token without storage secrets", () => {
  assert.match(shareService, /recoverOpaqueToken\(/);
  assert.match(shareService, /withoutShareSecrets\(/);
  assert.match(shareService, /delete safe\.password_hash/);
  assert.match(shareRoute, /withoutPersistedTokenSecrets\(/);
  assert.match(shareRoute, /delete safeInvite\.password_hash/);
  assert.match(shareRoute, /token:\s*recoverOpaqueToken\(/);
  assert.doesNotMatch(shareRoute, /return\s*\{\s*\.\.\.invite,/);
});

test("failed credential recovery is fail-closed", () => {
  assert.match(
    shareService,
    /Stored share links could not be securely recovered/,
  );
  assert.match(
    shareService,
    /The rotated link could not be securely recovered/,
  );
  assert.match(
    shareRoute,
    /Stored share links could not be securely recovered/,
  );
});

test("team invitations use opaque credentials and never list stored bearer material", () => {
  assert.match(teamInviteRoute, /\.\.\.persistedOpaqueTokenFields\(token\)/);
  assert.match(teamInviteRoute, /const lookup = token[\s\S]*opaqueTokenLookup\(token\)/);
  assert.match(teamInviteRoute, /delete safe\.token/);
  assert.doesNotMatch(teamInviteRoute, /\.eq\(["']user_id["'],\s*email\)/);
  assert.match(teamInviteRoute, /invite\.email\.toLowerCase\(\)[\s\S]*user\.email\.toLowerCase\(\)/);
});

test("team invitation links have a complete authenticated acceptance surface", () => {
  assert.match(teamInvitePage, /\/api\/teams\/invites\?token=/);
  assert.match(teamInvitePage, /JSON\.stringify\(\{ token, action \}\)/);
  assert.match(teamInvitePage, /\/login\?next=/);
  assert.match(teamInviteRoute, /accept_url:\s*acceptUrl/);
  assert.match(teamInviteRoute, /dispatchTransactionalNotification/);
  assert.doesNotMatch(teamInviteRoute, /\bsendEmail\b/);
});
