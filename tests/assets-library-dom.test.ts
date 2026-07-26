import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import React, { type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function transpileTsModule(modulePath: string): string {
  return ts.transpileModule(readFileSync(modulePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: modulePath,
  }).outputText;
}

function evaluateModule(output: string, mockRequire: (specifier: string) => unknown) {
  const loadedModule = { exports: {} as Record<string, unknown> };
  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${output}\n })`,
  ) as (
    loader: typeof mockRequire,
    moduleRecord: typeof loadedModule,
    exports: Record<string, unknown>,
  ) => void;
  evaluate(mockRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);

/** Load the real pure-logic chain (no stubs) so tests exercise production logic. */
function loadPure(relativePath: string, deps: Record<string, unknown> = {}) {
  return evaluateModule(transpileTsModule(resolve(repositoryRoot, relativePath)), (specifier) => {
    if (specifier in deps) return deps[specifier];
    throw new Error(`Unexpected import in ${relativePath}: ${specifier}`);
  });
}

const typesModule = loadPure("lib/assets/types.ts");
const formatsModule = loadPure("lib/assets/formats.ts", { "./types": typesModule });
const scrubModule = loadPure("lib/assets/scrub.ts");
const workspaceModule = loadPure("lib/demo/workspace.ts");
const demoLibraryModule = loadPure("lib/assets/demo-library.ts", {
  "./formats": formatsModule,
  "./types": typesModule,
  "../demo/workspace": workspaceModule,
});
const manifestModule = loadPure("lib/assets/manifest.ts", {
  "./formats": formatsModule,
  "./types": typesModule,
});

function sharedMocks(): Record<string, unknown> {
  return {
    "lucide-react": new Proxy(
      {},
      { get: () => Icon },
    ),
    "next/link": {
      __esModule: true,
      default: ({ href, children, ...rest }: Record<string, unknown>) =>
        React.createElement("a", { href, ...rest }, children as React.ReactNode),
    },
    "@/lib/assets/types": typesModule,
    "@/lib/assets/formats": formatsModule,
    "@/lib/assets/scrub": scrubModule,
    "@/lib/assets/manifest": manifestModule,
  };
}

function loadComponent(relativePath: string) {
  const mocks = sharedMocks();
  return evaluateModule(transpileTsModule(resolve(repositoryRoot, relativePath)), (specifier) => {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier in mocks) return mocks[specifier];
    throw new Error(`Unexpected ${relativePath} import: ${specifier}`);
  }) as { default: ComponentType<Record<string, unknown>> };
}

const FormatMatrixDialog = loadComponent("components/library/FormatMatrixDialog.tsx");
const LibraryAssetCard = loadComponent("components/library/LibraryAssetCard.tsx");
const PackageManifestPanel = loadComponent("components/library/PackageManifestPanel.tsx");

const { demoLibraryMetaById, demoLibraryPackages } = demoLibraryModule as {
  demoLibraryMetaById: Record<
    string,
    { formats: Array<Record<string, unknown>>; rights: { label: string }; platforms: string[] }
  >;
  demoLibraryPackages: Array<Record<string, unknown>>;
};
const { buildPackageManifest } = manifestModule as {
  buildPackageManifest: (
    pkg: unknown,
    assets: Array<{ id: string; title: string }>,
    metas: unknown,
  ) => Record<string, unknown>;
};

// ── Format matrix dialog ───────────────────────────────────────

test("format matrix renders one row per format with honest availability", () => {
  const markup = renderToStaticMarkup(
    React.createElement(FormatMatrixDialog.default, {
      assetTitle: "Schneider + McLaren Podcast_v3",
      formats: demoLibraryMetaById["mclaren-podcast-v3"].formats,
      onClose: () => {},
    }),
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-label="Formats for Schneider \+ McLaren Podcast_v3"/);
  for (const key of [
    "master",
    "web",
    "vertical",
    "square",
    "captioned",
    "clean",
    "audio_only",
    "thumbnail",
    "transcript",
  ]) {
    assert.match(markup, new RegExp(`data-testid="format-row-${key}"`));
  }
  // Master is a real file: downloadable with its honest size.
  assert.match(markup, /data-testid="format-download-master"/);
  assert.match(markup, /href="\/demo\/interview-source\.mp4" download=""/);
  assert.match(markup, /27\.2 MB/);
  // Vertical was never produced: honest label, and no download affordance.
  assert.match(
    markup,
    /data-testid="format-row-vertical"[\s\S]*?Not produced for this asset/,
  );
  assert.doesNotMatch(markup, /format-download-vertical/);
  assert.doesNotMatch(markup, /format-download-transcript/);
});

// ── Asset card ─────────────────────────────────────────────────

test("asset card shows rights badge, truthful facts, and a real hover-scrub video", () => {
  const markup = renderToStaticMarkup(
    React.createElement(LibraryAssetCard.default, {
      id: "ica-ceo-hero-v1",
      title: "ICA CEO Hero Cut_v1",
      href: "/projects/ica?demo=1&asset=ica-ceo-hero-v1&view=review",
      projectName: "ICA",
      projectHref: "/projects/ica?demo=1",
      posterUrl: "/demo/ceraweek-speaker.jpg",
      videoUrl: "/demo/ica-ceo-preview.mp4",
      durationSeconds: 5.005,
      resolution: "1920x1080",
      sizeBytes: 727_711,
      meta: demoLibraryMetaById["ica-ceo-hero-v1"],
      isFavorite: true,
      onToggleFavorite: () => {},
      onOpenFormats: () => {},
      onRequestCutdown: () => {},
    }),
  );

  assert.match(markup, /data-testid="library-asset-card" data-asset-id="ica-ceo-hero-v1"/);
  assert.match(markup, /data-testid="rights-badge-ica-ceo-hero-v1"[^>]*>Paid usage until 2027-07</);
  assert.match(markup, /0:05 · 1920x1080 · 711 KB/);
  assert.match(markup, /<video[^>]*src="\/demo\/ica-ceo-preview\.mp4"/);
  assert.match(markup, /preload="metadata"/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /aria-label="Remove ICA CEO Hero Cut_v1 from favorites"/);
  assert.match(markup, /data-testid="source-project-ica-ceo-hero-v1"/);
  assert.match(markup, /href="\/projects\/ica\?demo=1"[^>]*data-testid="source-project-ica-ceo-hero-v1"|data-testid="source-project-ica-ceo-hero-v1"[\s\S]{0,200}\/projects\/ica\?demo=1/);
});

test("asset card without a produced master renders the poster, no fake scrub video", () => {
  const markup = renderToStaticMarkup(
    React.createElement(LibraryAssetCard.default, {
      id: "denie-mcdonald-v4",
      title: "Denie McDonald_v4",
      href: "/projects/ica?demo=1&asset=denie-mcdonald-v4&view=review",
      projectName: "ICA",
      projectHref: "/projects/ica?demo=1",
      posterUrl: "/demo/ceraweek-speaker.jpg",
      videoUrl: null,
      durationSeconds: 71,
      resolution: null,
      sizeBytes: null,
      meta: demoLibraryMetaById["denie-mcdonald-v4"],
      isFavorite: false,
      onToggleFavorite: () => {},
      onOpenFormats: () => {},
      onRequestCutdown: () => {},
    }),
  );

  assert.doesNotMatch(markup, /<video/);
  assert.match(markup, /<img[^>]*src="\/demo\/ceraweek-speaker\.jpg"/);
  assert.match(markup, /aria-pressed="false"/);
  assert.match(markup, /1:11/);
});

// ── Package manifest panel ─────────────────────────────────────

test("package manifest lists real files with checksums and honest totals", () => {
  const pkg = demoLibraryPackages.find((candidate) => candidate.id === "pkg-ica-roadshow");
  const manifest = buildPackageManifest(
    pkg,
    [
      { id: "ica-roadshow-final", title: "ICA_ROADSHOW_x_FINAL" },
      { id: "ica-ceo-hero-v1", title: "ICA CEO Hero Cut_v1" },
    ],
    demoLibraryMetaById,
  );

  const markup = renderToStaticMarkup(
    React.createElement(PackageManifestPanel.default, {
      manifest,
      description: "Approved roadshow hero film plus the CEO hero cut.",
      onClose: () => {},
    }),
  );

  assert.match(markup, /data-testid="package-manifest"/);
  assert.match(markup, /ica-ceo-preview\.mp4/);
  assert.match(markup, /53300e99341e99cd/);
  assert.match(markup, /3 files · 1\.2 MB total/);
  // No invented master for the roadshow final — thumbnail row only.
  assert.doesNotMatch(markup, /manifest-row-ica-roadshow-final-master/);
  assert.match(markup, /manifest-row-ica-roadshow-final-thumbnail/);
});
