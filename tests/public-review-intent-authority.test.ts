import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base) ? base : existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { resolvePublicReviewIntent } = await import("../lib/review/public-intent-authority.ts");

const commentFallback = {
  permissions: "comment" as const,
  downloadEnabled: false,
  watermarkEnabled: false,
};

test("a token-bound approval share ignores a conflicting final-delivery query", () => {
  assert.equal(
    resolvePublicReviewIntent({
      sourceCatalogPreview: false,
      tokenBoundShare: {
        permissions: "approve",
        downloadEnabled: true,
        watermarkEnabled: false,
      },
      queryIntent: "final_delivery",
      fallback: commentFallback,
    }),
    "approval_needed",
  );
});

test("a token-bound final delivery stays final even when the query requests review", () => {
  assert.equal(
    resolvePublicReviewIntent({
      sourceCatalogPreview: false,
      tokenBoundShare: {
        shareIntent: "final_delivery",
        permissions: "view",
        downloadEnabled: true,
        watermarkEnabled: false,
      },
      queryIntent: "client_review",
      fallback: commentFallback,
    }),
    "final_delivery",
  );
});

test("an unbound fixture preview may use only a valid query intent", () => {
  assert.equal(
    resolvePublicReviewIntent({
      sourceCatalogPreview: false,
      tokenBoundShare: null,
      queryIntent: "approval_needed",
      fallback: commentFallback,
    }),
    "approval_needed",
  );
  assert.equal(
    resolvePublicReviewIntent({
      sourceCatalogPreview: false,
      tokenBoundShare: null,
      queryIntent: "not-an-intent",
      fallback: commentFallback,
    }),
    "client_review",
  );
});

test("a direct source preview remains internal regardless of query intent", () => {
  assert.equal(
    resolvePublicReviewIntent({
      sourceCatalogPreview: true,
      tokenBoundShare: null,
      queryIntent: "final_delivery",
      fallback: commentFallback,
    }),
    "internal_review",
  );
});
