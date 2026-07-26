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

interface VersionForTest {
  id: string;
  asset_id: string;
  version_number: number;
  file_url: string;
  file_size: number | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  resolution: string | null;
  is_current: boolean;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

function makeVersion(number: number, overrides: Partial<VersionForTest> = {}): VersionForTest {
  return {
    id: `version-${number}`,
    asset_id: "asset-1",
    version_number: number,
    file_url: `/demo/v${number}.mp4`,
    file_size: null,
    thumbnail_url: null,
    duration_seconds: null,
    resolution: null,
    is_current: false,
    notes: null,
    uploaded_by: null,
    created_at: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

const DEMO_VERSIONS: VersionForTest[] = [
  makeVersion(1),
  makeVersion(2),
  makeVersion(3, { is_current: true }),
];

interface VersionsLibModule {
  sortVersions: (versions: readonly VersionForTest[]) => VersionForTest[];
  currentVersion: (versions: readonly VersionForTest[]) => VersionForTest | null;
  resolveVersionParam: (
    versions: readonly VersionForTest[],
    param: string | null | undefined,
  ) => VersionForTest | null;
  versionBadgeLabel: (version: VersionForTest, isCurrent?: boolean) => string;
  comparePair: (
    versions: readonly VersionForTest[],
    aParam?: string | null,
    bParam?: string | null,
  ) => { a: VersionForTest; b: VersionForTest } | null;
}

interface VersionSwitcherModule {
  default: ComponentType<{
    versions: VersionForTest[];
    activeVersionId: string | null;
    onSelect: (version: VersionForTest) => void;
    currentVersionOnly?: boolean;
  }>;
}

interface VersionCompareModule {
  default: ComponentType<{
    versions: VersionForTest[];
    initialAId?: string | null;
    initialBId?: string | null;
    onExit?: () => void;
  }>;
  COMPARE_DRIFT_THRESHOLD_SECONDS: number;
  shouldCorrectDrift: (leaderTime: number, followerTime: number, threshold?: number) => boolean;
  clampCompareSeek: (seconds: number, duration: number) => number;
}

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

function iconStub(names: string[]): Record<string, ComponentType<Record<string, unknown>>> {
  const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);
  return Object.fromEntries(names.map((name) => [name, Icon]));
}

// The canonical P19a pure-logic module, loaded for real (type-only imports
// erase, so it must stay dependency-free at runtime).
const versionsLib = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "lib/versions/versions.ts")),
  (specifier: string) => {
    throw new Error(`versions.ts must stay dependency-free: ${specifier}`);
  },
) as unknown as VersionsLibModule;

function loadVersionSwitcher(): VersionSwitcherModule {
  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") return iconStub(["History"]);
    if (specifier === "@/lib/versions/versions") return versionsLib;
    throw new Error(`Unexpected VersionSwitcher import: ${specifier}`);
  }

  return evaluateModule(
    transpileTsModule(resolve(repositoryRoot, "components/review/VersionSwitcher.tsx")),
    mockRequire,
  ) as unknown as VersionSwitcherModule;
}

function loadVersionCompare(): VersionCompareModule {
  const playerStoreState = { playing: false, currentTime: 0, duration: 0 };
  const usePlayerStore = (selector?: (state: typeof playerStoreState) => unknown) =>
    selector ? selector(playerStoreState) : playerStoreState;
  usePlayerStore.getState = () => ({
    setPlaying: () => undefined,
    setCurrentTime: () => undefined,
  });

  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") {
      return iconStub(["GitCompare", "Play", "Pause", "Volume2", "VolumeX", "X"]);
    }
    if (specifier === "@/lib/stores/playerStore") return { usePlayerStore };
    if (specifier === "@/lib/versions/versions") return versionsLib;
    if (specifier === "@/components/player/VideoPlayer") {
      // Default export: return the component itself so esModuleInterop's
      // __importDefault wraps it into `{ default: component }`.
      function MockVideoPlayer(props: { src: string }) {
        return React.createElement("video", { src: props.src, "data-testid": "compare-video" });
      }
      return MockVideoPlayer;
    }
    throw new Error(`Unexpected VersionCompare import: ${specifier}`);
  }

  return evaluateModule(
    transpileTsModule(resolve(repositoryRoot, "components/review/VersionCompare.tsx")),
    mockRequire,
  ) as unknown as VersionCompareModule;
}

const switcher = loadVersionSwitcher();
const compare = loadVersionCompare();

// ── Canonical version helpers (P19a lib/versions contract) ──

test("sortVersions orders newest first without mutating input", () => {
  const shuffled = [DEMO_VERSIONS[0], DEMO_VERSIONS[2], DEMO_VERSIONS[1]];
  // Helpers run in a vm context; Array.from re-realms the result for
  // deepStrictEqual's prototype checks.
  const sorted = Array.from(versionsLib.sortVersions(shuffled), (version) => version.version_number);
  assert.deepEqual(sorted, [3, 2, 1]);
  assert.deepEqual(
    shuffled.map((version) => version.version_number),
    [1, 3, 2],
  );
});

test("currentVersion prefers the is_current flag, falls back to highest number", () => {
  assert.equal(versionsLib.currentVersion(DEMO_VERSIONS)?.version_number, 3);
  const noFlag = DEMO_VERSIONS.map((version) => ({ ...version, is_current: false }));
  assert.equal(versionsLib.currentVersion(noFlag)?.version_number, 3);
  assert.equal(versionsLib.currentVersion([]), null);
});

test("resolveVersionParam honors latest/current, numeric picks, and misses", () => {
  assert.equal(versionsLib.resolveVersionParam(DEMO_VERSIONS, "latest")?.version_number, 3);
  assert.equal(versionsLib.resolveVersionParam(DEMO_VERSIONS, "current")?.version_number, 3);
  assert.equal(versionsLib.resolveVersionParam(DEMO_VERSIONS, null)?.version_number, 3);
  assert.equal(versionsLib.resolveVersionParam(DEMO_VERSIONS, "1")?.version_number, 1);
  assert.equal(versionsLib.resolveVersionParam(DEMO_VERSIONS, "v2")?.version_number, 2);
  // Unknown numbers and garbage never fabricate a version.
  assert.equal(versionsLib.resolveVersionParam(DEMO_VERSIONS, "9"), null);
  assert.equal(versionsLib.resolveVersionParam(DEMO_VERSIONS, "abc"), null);
});

test("versionBadgeLabel spells out the current badge", () => {
  assert.equal(versionsLib.versionBadgeLabel(DEMO_VERSIONS[2]), "V3 · Current");
  assert.equal(versionsLib.versionBadgeLabel(DEMO_VERSIONS[0]), "V1");
  assert.equal(versionsLib.versionBadgeLabel(DEMO_VERSIONS[0], true), "V1 · Current");
});

test("comparePair defaults to the two newest versions and honors explicit picks", () => {
  const pair = versionsLib.comparePair(DEMO_VERSIONS);
  assert.ok(pair);
  assert.equal(pair.a.version_number, 3);
  assert.equal(pair.b.version_number, 2);

  const explicit = versionsLib.comparePair(DEMO_VERSIONS, "1", "3");
  assert.ok(explicit);
  assert.equal(explicit.a.version_number, 1);
  assert.equal(explicit.b.version_number, 3);

  // Same version on both sides, or too few versions, disables compare.
  assert.equal(versionsLib.comparePair(DEMO_VERSIONS, "2", "v2"), null);
  assert.equal(versionsLib.comparePair([DEMO_VERSIONS[0]]), null);
  assert.equal(versionsLib.comparePair([]), null);
});

// ── VersionSwitcher DOM ──

test("switcher renders one chip per version with the canonical badge label", () => {
  const markup = renderToStaticMarkup(
    React.createElement(switcher.default, {
      versions: DEMO_VERSIONS,
      activeVersionId: "version-3",
      onSelect: () => undefined,
    }),
  );

  assert.match(markup, /data-testid="version-switcher"/);
  assert.match(markup, /aria-label="Review versions"/);
  for (const version of DEMO_VERSIONS) {
    assert.match(markup, new RegExp(`data-version-id="${version.id}"`));
  }
  // Canonical labels: plain "V1"/"V2" chips, "V3 · Current" for the live one.
  assert.match(markup, />V1</);
  assert.match(markup, />V2</);
  assert.match(markup, /V3 · Current/);
  assert.match(markup, /aria-pressed="true"[^>]*data-version-id="version-3"|data-version-id="version-3"[^>]*aria-pressed="true"/);
  assert.match(markup, /data-current="true"[^>]*data-version-id="version-3"|data-version-id="version-3"[^>]*data-current="true"/);
});

test("switcher marks the inactive chips as not pressed", () => {
  const markup = renderToStaticMarkup(
    React.createElement(switcher.default, {
      versions: DEMO_VERSIONS,
      activeVersionId: "version-1",
      onSelect: () => undefined,
    }),
  );

  assert.equal(markup.match(/aria-pressed="true"/g)?.length, 1);
  assert.equal(markup.match(/aria-pressed="false"/g)?.length, 2);
});

test("current_version_only hides every chip but the current version and says so", () => {
  const markup = renderToStaticMarkup(
    React.createElement(switcher.default, {
      versions: DEMO_VERSIONS,
      activeVersionId: "version-3",
      onSelect: () => undefined,
      currentVersionOnly: true,
    }),
  );

  assert.match(markup, /data-version-id="version-3"/);
  assert.doesNotMatch(markup, /data-version-id="version-1"/);
  assert.doesNotMatch(markup, /data-version-id="version-2"/);
  assert.match(markup, /only the current version/i);
});

// ── VersionCompare sync logic ──

test("drift correction triggers only beyond the threshold", () => {
  assert.equal(compare.COMPARE_DRIFT_THRESHOLD_SECONDS > 0, true);
  const threshold = compare.COMPARE_DRIFT_THRESHOLD_SECONDS;
  assert.equal(compare.shouldCorrectDrift(10, 10 + threshold / 2), false);
  assert.equal(compare.shouldCorrectDrift(10, 10 + threshold + 0.01), true);
  assert.equal(compare.shouldCorrectDrift(10, 10 - threshold - 0.01), true);
});

test("compare seeks clamp into the playable range", () => {
  assert.equal(compare.clampCompareSeek(-2, 30), 0);
  assert.equal(compare.clampCompareSeek(45, 30), 30);
  assert.equal(compare.clampCompareSeek(12.5, 30), 12.5);
  // Unknown duration never fabricates an upper bound.
  assert.equal(compare.clampCompareSeek(12.5, 0), 12.5);
});

// ── VersionCompare DOM ──

test("compare renders two players defaulted to the two newest versions", () => {
  const markup = renderToStaticMarkup(
    React.createElement(compare.default, { versions: DEMO_VERSIONS }),
  );

  assert.match(markup, /data-testid="version-compare"/);
  const videos = markup.match(/<video[^>]*data-testid="compare-video"[^>]*>/g) ?? [];
  assert.equal(videos.length, 2);
  // Canonical default pair: newest (V3) as A, second-newest (V2) as B.
  assert.match(markup, /src="\/demo\/v3\.mp4"/);
  assert.match(markup, /src="\/demo\/v2\.mp4"/);
  assert.match(markup, /data-compare-slot="A"/);
  assert.match(markup, /data-compare-slot="B"/);
});

test("compare picker changes which version a slot plays", () => {
  const markup = renderToStaticMarkup(
    React.createElement(compare.default, {
      versions: DEMO_VERSIONS,
      initialAId: "version-1",
      initialBId: "version-3",
    }),
  );

  assert.match(markup, /src="\/demo\/v1\.mp4"/);
  assert.match(markup, /src="\/demo\/v3\.mp4"/);
  assert.match(markup, /aria-label="Compare slot A version"/);
  assert.match(markup, /aria-label="Compare slot B version"/);
});

test("compare exposes one shared transport for both players", () => {
  const markup = renderToStaticMarkup(
    React.createElement(compare.default, { versions: DEMO_VERSIONS }),
  );

  assert.match(markup, /data-testid="compare-transport"/);
  assert.match(markup, /aria-label="Play both versions"/);
  assert.match(markup, /aria-label="Seek both versions"/);
});
