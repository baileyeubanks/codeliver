import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reviewRouteRoot = resolve(repositoryRoot, "app/api/review/[token]");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = existsSync(`${base}.ts`)
        ? `${base}.ts`
        : existsSync(`${base}.tsx`)
          ? `${base}.tsx`
          : base;
      return nextResolve(pathToFileURL(path).href, context);
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !specifier.endsWith(".ts") &&
        !specifier.endsWith(".tsx")
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

async function publicDtoModule() {
  return import(pathToFileURL(resolve(repositoryRoot, "lib/review/public-dto.ts")).href);
}

function routeSources(root: string) {
  const routes: Array<{ path: string; source: string }> = [];

  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile() && entry.name === "route.ts") {
        routes.push({
          path: relative(repositoryRoot, path),
          source: readFileSync(path, "utf8"),
        });
      }
    }
  }

  walk(root);
  return routes.sort((left, right) => left.path.localeCompare(right.path));
}

function exportedHandlerCount(source: string) {
  return Array.from(
    source.matchAll(
      /export\s+async\s+function\s+(?:GET|POST|PUT|PATCH|DELETE)\s*\(/g,
    ),
  ).length;
}

function authorizedLookupCount(source: string) {
  return Array.from(
    source.matchAll(/await\s+getAuthorizedReviewInvite\s*\(/g),
  ).length;
}

test("every public review-token handler uses the password-aware invite authority except unlock", () => {
  const routes = routeSources(reviewRouteRoot);
  assert.deepEqual(
    routes.map((route) => route.path),
    [
      "app/api/review/[token]/approvals/route.ts",
      "app/api/review/[token]/comments/route.ts",
      "app/api/review/[token]/completion/route.ts",
      "app/api/review/[token]/edit-decisions/route.ts",
      "app/api/review/[token]/media/route.ts",
      "app/api/review/[token]/route.ts",
      "app/api/review/[token]/unlock/route.ts",
    ],
  );

  for (const route of routes) {
    const handlerCount = exportedHandlerCount(route.source);
    assert.ok(handlerCount > 0, `${route.path} must expose a public handler`);

    if (route.path.endsWith("/unlock/route.ts")) {
      assert.equal(authorizedLookupCount(route.source), 0, route.path);
      assert.equal(
        Array.from(
          route.source.matchAll(/await\s+getReviewInviteByToken\s*\(\s*token\s*\)/g),
        ).length,
        handlerCount,
        `${route.path} must be the bounded password verifier`,
      );
      assert.match(route.source, /await\s+verifyReviewPassword\s*\(/);
      continue;
    }

    assert.ok(
      authorizedLookupCount(route.source) >= handlerCount,
      `${route.path} must authorize every exported public handler`,
    );
    assert.doesNotMatch(
      route.source,
      /\bgetReviewInviteByToken\b/,
      `${route.path} must not bypass password-cookie authority`,
    );
  }
});

test("token-bearing sharing helpers use the same password-aware authority", () => {
  const sharingRoot = resolve(repositoryRoot, "app/api/sharing");
  const tokenRoutes = routeSources(sharingRoot).filter(({ source }) =>
    source.includes("extractReviewAnalyticsToken"),
  );

  assert.deepEqual(
    tokenRoutes.map((route) => route.path),
    [
      "app/api/sharing/analytics/route.ts",
      "app/api/sharing/watermark/route.ts",
    ],
  );

  for (const route of tokenRoutes) {
    const extractedTokenCount = Array.from(
      route.source.matchAll(/extractReviewAnalyticsToken\s*\(/g),
    ).length;
    assert.ok(extractedTokenCount > 0, route.path);
    assert.equal(
      authorizedLookupCount(route.source),
      extractedTokenCount,
      `${route.path} must authorize every extracted review token`,
    );
    assert.doesNotMatch(route.source, /\bgetReviewInviteByToken\b/);
  }
});

test("public asset and version DTOs project an explicit field allowlist", async () => {
  const { toPublicReviewAsset, toPublicReviewVersion } = await publicDtoModule();
  const asset = {
    id: "asset-1",
    title: "Campaign rough cut",
    file_type: "video/mp4",
    file_url: "https://storage.example/private-asset.mp4",
    storage_path: "private/asset-1.mp4",
    status: "in_review",
    projects: {
      id: "project-1",
      name: "Campaign",
      owner_id: "staff-user-1",
    },
  };
  const version = {
    id: "version-1",
    asset_id: "asset-1",
    version_number: 3,
    file_url: "https://storage.example/private-version.mp4",
    file_size: 42_000,
    thumbnail_url: "https://storage.example/private-thumbnail.jpg",
    duration_seconds: 91.2,
    resolution: "1920x1080",
    is_current: true,
    notes: "Internal notes",
    uploaded_by: "staff-user-1",
    created_at: "2026-07-15T12:00:00.000Z",
    storage_path: "private/version-1.mp4",
  };
  const mediaUrl = "/api/review/public-token/media";

  assert.deepEqual(toPublicReviewAsset(asset, mediaUrl), {
    id: "asset-1",
    title: "Campaign rough cut",
    file_type: "video/mp4",
    file_url: mediaUrl,
    status: "in_review",
    projects: { name: "Campaign" },
  });
  assert.deepEqual(toPublicReviewVersion(version, mediaUrl), {
    id: "version-1",
    asset_id: "asset-1",
    version_number: 3,
    file_url: mediaUrl,
    file_size: 42_000,
    thumbnail_url: null,
    duration_seconds: 91.2,
    resolution: "1920x1080",
    is_current: true,
    notes: null,
    uploaded_by: null,
    created_at: "2026-07-15T12:00:00.000Z",
  });
});

test("public review handlers use explicit DTO mappers and projected selects", () => {
  const source = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/route.ts"),
    "utf8",
  );
  const dtoSource = readFileSync(
    resolve(repositoryRoot, "lib/review/public-dto.ts"),
    "utf8",
  );

  assert.match(
    source,
    /const mediaUrl = `\/api\/review\/\$\{encodeURIComponent\(token\)\}\/media`;/,
  );
  assert.match(
    source,
    /asset:\s*invite\.assets\s*\?\s*toPublicReviewAsset\(invite\.assets,\s*mediaUrl\)\s*:\s*null,/,
  );
  assert.match(
    source,
    /version:\s*toPublicReviewVersion\(versionLookup\.version,\s*mediaUrl\),/,
  );
  assert.match(
    source,
    /edit_decisions:\s*\(editDecisionsResult\.data\s*\?\?\s*\[\]\)\.map\(toPublicEditDecision\),/,
  );
  assert.match(
    source,
    /comments:\s*\(commentsResult\.data\s*\?\?\s*\[\]\)\.map\(toPublicReviewComment\),/,
  );
  assert.match(
    source,
    /const downloadEnabled = invite\.download_enabled === true;/,
  );
  assert.match(
    source,
    /download_url:\s*downloadEnabled\s*\?\s*`\$\{mediaUrl\}\?download=1`\s*:\s*null,/,
  );

  assert.doesNotMatch(source, /versionLookup\.version\.file_url/);
  assert.doesNotMatch(source, /invite\.assets\.file_url/);
  assert.doesNotMatch(
    source,
    /\.\.\.\s*(?:invite\.assets|versionLookup\.version)\b/,
  );
  assert.doesNotMatch(dtoSource, /\.\.\.\s*(?:asset|version)\b/);
  assert.doesNotMatch(source, /download_enabled\s*\?\?\s*true/);

  for (const route of routeSources(reviewRouteRoot)) {
    assert.doesNotMatch(
      route.source,
      /\.select\s*\(\s*(["'`])\s*\*\s*\1\s*\)/,
      `${route.path} must use an explicit database projection`,
    );
  }
});

test("public review comments stay private to the authorized invite thread", () => {
  const reviewRouteSource = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/route.ts"),
    "utf8",
  );
  const commentRouteSource = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/comments/route.ts"),
    "utf8",
  );

  assert.match(
    reviewRouteSource,
    /\.eq\("visibility", "external"\)\s*\.eq\("review_invite_id", invite\.id\)/,
  );
  assert.match(
    commentRouteSource,
    /isExternalReviewThreadForInvite\(\{[\s\S]*?reviewInviteId:\s*parent\.data\.review_invite_id,[\s\S]*?inviteId:\s*invite\.id/,
  );
  assert.match(
    commentRouteSource,
    /\{ error: "Comment thread not found" \}, \{ status: 404 \}/,
  );
  assert.match(commentRouteSource, /review_invite_id: invite\.id,/);
});

test("public review links only receive edit decisions created through their exact invite", () => {
  const reviewRouteSource = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/route.ts"),
    "utf8",
  );
  const editDecisionRouteSource = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/edit-decisions/route.ts"),
    "utf8",
  );

  for (const source of [reviewRouteSource, editDecisionRouteSource]) {
    assert.match(source, /\.eq\("review_invite_id", invite\.id\)/);
    assert.doesNotMatch(source, /status\.in\.\(accepted,applied\)/);
  }
});

test("review completion is a private, exact-version signal separate from approval decisions", () => {
  const reviewRouteSource = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/route.ts"),
    "utf8",
  );
  const completionRouteSource = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/completion/route.ts"),
    "utf8",
  );

  assert.match(
    reviewRouteSource,
    /from\("review_invite_completions"\)[\s\S]*?\.eq\("review_invite_id", invite\.id\)[\s\S]*?\.eq\("asset_id", invite\.asset_id\)[\s\S]*?\.eq\("version_id", versionLookup\.version\.id\)/,
  );
  assert.match(reviewRouteSource, /completion_available:\s*!completionUnavailable/);
  assert.match(
    reviewRouteSource,
    /can_complete_review:[\s\S]*?canInviteCompleteReview\(invite\)/,
  );
  assert.match(completionRouteSource, /await getAuthorizedReviewInvite\(request, token\)/);
  assert.match(completionRouteSource, /await resolveAssetVersion\(\{[\s\S]*?assetId: invite\.asset_id/);
  assert.match(completionRouteSource, /rpc\("complete_review_invite"/);
  assert.match(
    completionRouteSource,
    /\{ error: "Review completion is temporarily unavailable" \},[\s\S]*?status: 503/,
  );
  assert.doesNotMatch(completionRouteSource, /recordApprovalDecision|approval_workflows/);
});

test("the client-review demo keeps the assigned reviewer identity required for finishing a review", () => {
  const pageSource = readFileSync(
    resolve(repositoryRoot, "app/review/[token]/page.tsx"),
    "utf8",
  );

  assert.match(
    pageSource,
    /reviewer_email:\s*requestedDemoShare\?\.reviewer_email \?\?\s*demoReviewPayload\.reviewer_email/,
  );
  assert.match(
    pageSource,
    /setCanCompleteReview\(\s*review\.permissions !== "view" && Boolean\(review\.reviewer_email\),\s*\)/,
  );
});

test("limited-view review access uses atomic claims and a distinct media grant", () => {
  const routeSource = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/route.ts"),
    "utf8",
  );
  const mediaSource = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/media/route.ts"),
    "utf8",
  );
  const pageSource = readFileSync(
    resolve(repositoryRoot, "app/review/[token]/page.tsx"),
    "utf8",
  );
  const claimSource = readFileSync(
    resolve(repositoryRoot, "lib/sharing/share-claims.ts"),
    "utf8",
  );

  assert.match(routeSource, /createInviteReviewAccessGrant\(token, invite\)/);
  assert.match(routeSource, /await claimShareLinkView\(\{ token, requestId \}\)/);
  assert.match(
    routeSource,
    /if \(!atomicClaims && !\(inviteLookup\.accessGranted && viewLimitReached\)\)/,
  );
  assert.match(routeSource, /createReviewViewGrant\(\{/);
  assert.match(mediaSource, /hasValidReviewViewGrant\(request, \{/);
  assert.match(
    mediaSource,
    /getAuthorizedReviewInvite\(request, token\)[\s\S]*?hasValidReviewViewGrant/,
  );
  assert.match(pageSource, /globalThis\.crypto\.randomUUID\(\)/);
  assert.match(
    pageSource,
    /"X-Review-View-Claim-Id": viewClaimRequestRef\.current\.requestId/,
  );
  assert.match(claimSource, /p_token_hash: hashOpaqueToken\(token\)/);
  assert.doesNotMatch(claimSource, /p_token:\s*token/);
});

test("public review database failures are mapped to generic errors", () => {
  for (const route of routeSources(reviewRouteRoot)) {
    if (route.path.endsWith("/unlock/route.ts") || route.path.endsWith("/media/route.ts")) {
      continue;
    }

    assert.doesNotMatch(
      route.source,
      /return NextResponse\.json\(\{ error: versionLookup\.error \}/,
      `${route.path} must not expose storage errors`,
    );
  }
});
