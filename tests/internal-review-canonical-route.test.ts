import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = resolve(
  repositoryRoot,
  "components/review/InternalAssetReviewPage.tsx",
);
const componentSource = readFileSync(componentPath, "utf8");

interface InternalReviewModule {
  buildCanonicalInternalReviewHref: (
    projectId: string,
    assetId: string,
    demoMode?: boolean,
  ) => string;
  readAuthoritativeAssetIdentity: (
    payload: unknown,
    requestedAssetId: string,
  ) => { assetId: string; projectId: string } | null;
}

function loadInternalReviewModule(): InternalReviewModule {
  const output = ts.transpileModule(componentSource, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: componentPath,
  }).outputText;
  const loadedModule = { exports: {} as InternalReviewModule };

  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "next/link") return () => null;
    if (specifier === "next/navigation") {
      return {
        useParams: () => ({}),
        useRouter: () => ({ replace: () => undefined }),
        useSearchParams: () => new URLSearchParams(),
      };
    }
    if (specifier === "lucide-react") return {};
    if (specifier === "@/lib/demo/workspace") return { demoAssets: [] };
    throw new Error(`Unexpected InternalAssetReviewPage import: ${specifier}`);
  }

  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${output}\n })`,
  ) as (
    loader: typeof mockRequire,
    moduleRecord: typeof loadedModule,
    exports: InternalReviewModule,
  ) => void;
  evaluate(mockRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const internalReview = loadInternalReviewModule();

test("legacy internal asset URLs resolve to the canonical cockpit review state", () => {
  assert.equal(
    internalReview.buildCanonicalInternalReviewHref(
      "project with spaces",
      "asset/with?delimiters",
    ),
    "/projects/project%20with%20spaces?asset=asset%2Fwith%3Fdelimiters&view=review",
  );
  assert.equal(
    internalReview.buildCanonicalInternalReviewHref("ica", "rough-cut", true),
    "/projects/ica?demo=1&asset=rough-cut&view=review",
  );
});

test("only an API record with authoritative asset and project identifiers can redirect", () => {
  const identity = internalReview.readAuthoritativeAssetIdentity(
    { id: "asset-a", project_id: "authoritative-project", title: "Current cut" },
    "asset-a",
  );

  assert.equal(identity?.assetId, "asset-a");
  assert.equal(identity?.projectId, "authoritative-project");
  assert.equal(
    internalReview.readAuthoritativeAssetIdentity(
      { id: "different-asset", project_id: "project-a" },
      "asset-a",
    ),
    null,
  );
  assert.equal(
    internalReview.readAuthoritativeAssetIdentity(
      { id: "asset-a", project_id: "   " },
      "asset-a",
    ),
    null,
  );
  assert.equal(internalReview.readAuthoritativeAssetIdentity(null, "asset-a"), null);
});

test("the internal route validates before replacing into the bright project cockpit", () => {
  const loader = componentSource.match(
    /async function openCanonicalReview\(\) \{([\s\S]*?)\n    \}\n\n    void openCanonicalReview/,
  )?.[1];

  assert.ok(loader, "could not locate the authoritative asset loader");
  assert.match(loader, /fetch\(`\/api\/assets\/\$\{encodeURIComponent\(assetId\)\}`/);
  assert.match(loader, /cache: "no-store"/);
  assert.match(loader, /signal: controller\.signal/);
  assert.match(loader, /if \(!response\.ok\)/);
  assert.match(loader, /const payload: unknown = await response\.json\(\)/);
  assert.match(
    loader,
    /const payload: unknown = await response\.json\(\);\s*if \(!current\) return;/,
  );
  assert.match(loader, /readAuthoritativeAssetIdentity\(payload, assetId\)/);
  assert.match(
    loader,
    /buildCanonicalInternalReviewHref\(identity\.projectId, identity\.assetId\)/,
  );
  assert.match(componentSource, /controller\.abort\(\)/);
  assert.match(componentSource, /bg-\[#0e1114\]/);
});

test("API failures remain honest and recoverable instead of opening legacy or fabricated media", () => {
  assert.doesNotMatch(componentSource, /ReviewWorkspace/);
  assert.doesNotMatch(componentSource, /Untitled Media/);
  assert.doesNotMatch(componentSource, /["'`]\/review\//);
  assert.doesNotMatch(componentSource, /PublicReview/);
  assert.match(componentSource, /No substitute media was opened\./);
  assert.match(componentSource, /role="alert"/);
  assert.match(componentSource, /aria-labelledby="internal-review-error-title"/);
  assert.match(componentSource, /tabIndex=\{-1\}/);
  assert.match(componentSource, /<nav aria-label="Review recovery"/);
  assert.match(componentSource, />\s*Back to project\s*</);
  assert.match(componentSource, />\s*View all projects\s*</);
  assert.match(componentSource, />\s*Try again\s*</);
});
