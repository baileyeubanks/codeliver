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
    return nextResolve(specifier, context);
  },
});

function moduleUrl(path: string) {
  const url = pathToFileURL(resolve(repositoryRoot, path));
  url.searchParams.set("approval-version", String(Date.now()));
  return url.href;
}

test("approval decisions reject a stale version before they load or change an approval step", async () => {
  const { recordApprovalDecision } = await import(moduleUrl("lib/approval-decisions.ts"));
  const tables: string[] = [];
  const client = {
    from(table: string) {
      tables.push(table);
      assert.equal(table, "versions");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return {
            data: {
              id: "version-old",
              asset_id: "asset-a",
              version_number: 1,
              file_url: "https://example.test/version-old.mp4",
              file_size: null,
              thumbnail_url: null,
              duration_seconds: 5,
              resolution: "1920x1080",
              is_current: false,
              notes: null,
              uploaded_by: null,
              created_at: "2026-07-16T00:00:00.000Z",
            },
            error: null,
          };
        },
      };
    },
  };

  const result = await recordApprovalDecision(
    {
      assetId: "asset-a",
      versionId: "version-old",
      approvalId: "approval-a",
      status: "approved",
      actor: { name: "Client Reviewer" },
    },
    client as never,
  );

  assert.deepEqual(result, {
    ok: false,
    statusCode: 409,
    error: "This approval request is for an earlier version",
  });
  assert.deepEqual(tables, ["versions"]);
});

test("public review reads and writes make stale approval links view-only", () => {
  const reviewRoute = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/route.ts"),
    "utf8",
  );
  const approvalRoute = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/approvals/route.ts"),
    "utf8",
  );

  assert.match(reviewRoute, /versionLookup\.version\.is_current/);
  assert.match(reviewRoute, /activeApprovalIds: \[\]/);
  assert.match(reviewRoute, /can_decide: false/);
  assert.match(
    approvalRoute,
    /resolveAssetVersion\(\{[\s\S]*?assetId: invite\.asset_id,[\s\S]*?versionId: invite\.version_id,[\s\S]*?\}\)/,
  );
  assert.match(approvalRoute, /versionLookup\.version\.is_current/);
  assert.match(approvalRoute, /versionId: versionLookup\.version\.id/);
});

test("internal approval decisions are bound to the media version selected in the cockpit", () => {
  const approvalRoute = readFileSync(
    resolve(repositoryRoot, "app/api/assets/[id]/approvals/route.ts"),
    "utf8",
  );

  assert.match(approvalRoute, /body\.version_id/);
  assert.match(approvalRoute, /The media version being approved is required/);
  assert.match(
    approvalRoute,
    /recordApprovalDecision\(\{[\s\S]*?assetId,[\s\S]*?versionId,[\s\S]*?approvalId: body\.id/,
  );
});
