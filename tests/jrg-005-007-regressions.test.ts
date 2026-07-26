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

    return nextResolve(specifier, context);
  },
});

test("JRG-005 protected return targets are local, fragment-free, and demo-normalized", async () => {
  const { buildProtectedReturnPath } = await import(
    pathToFileURL(resolve(repositoryRoot, "proxy.ts")).href
  );

  assert.equal(
    buildProtectedReturnPath(
      "/projects/ica",
      "?asset=denie-mcdonald-v4&view=review#comments",
    ),
    "/projects/ica?asset=denie-mcdonald-v4&view=review",
  );
  assert.equal(
    buildProtectedReturnPath("/projects/ica", "?demo=1&asset=cut&demo=0"),
    "/projects/ica?demo=1&asset=cut",
  );

  for (const unsafe of [
    "https://attacker.example/projects",
    "//attacker.example/projects",
    "/login",
    "/signup",
    "/auth/callback",
  ]) {
    assert.equal(buildProtectedReturnPath(unsafe, "?secret=value#fragment"), "/projects");
  }
});

test("JRG-007 share loading rejects bad responses before a retryable error state", () => {
  const shareList = readFileSync(
    resolve(repositoryRoot, "components/sharing/ShareLinkList.tsx"),
    "utf8",
  );
  const errorState = shareList.indexOf("if (activeLoadError)");
  const emptyState = shareList.indexOf("if (orderedLinks.length === 0)");

  assert.match(shareList, /if \(!response\.ok\) throw new Error/);
  assert.match(shareList, /!Array\.isArray\(data\.items\)/);
  assert.match(shareList, /role="alert"/);
  assert.match(shareList, /onClick=\{retryLoad\}/);
  assert.match(shareList, /setLocalRefresh\(\(current\) => current \+ 1\)/);
  assert.match(shareList, /const controller = new AbortController\(\)/);
  assert.match(shareList, /cancelled = true;\s*controller\.abort\(\)/);
  assert.ok(errorState >= 0 && errorState < emptyState, "the empty state can mask a load error");
});
