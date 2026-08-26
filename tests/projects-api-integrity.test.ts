import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = resolve(repositoryRoot, "lib/api/projects-collection.ts");

type ProjectInput = {
  id: string;
  name: string;
  stage?: string | null;
};

type MediaAssetInput = {
  id: string;
  project_id: string;
  title: string;
  file_type: string;
  status: string;
  created_at: string;
  href?: string | null;
};

type ProjectsCollectionModule = {
  isProjectCollectionItem(value: unknown): value is ProjectInput;
  isMediaAssetCollectionItem(value: unknown): value is MediaAssetInput;
  normalizeProjectCollectionItem(value: ProjectInput): {
    id: string;
    name: string;
    stage?: string;
  };
  normalizeMediaAssetCollectionItem(value: MediaAssetInput): {
    id: string;
    project_id: string;
    title: string;
    file_type: string;
    status: string;
    created_at: string;
    href?: string;
  };
  projectsStateFromCollections(projects: unknown, assets: unknown):
    | { status: "error"; responseStatus: null }
    | { status: "empty" }
    | {
        status: "success";
        projects: Array<{ id: string; name: string; stage?: string }>;
        assets: Array<{
          id: string;
          project_id: string;
          title: string;
          file_type: string;
          status: string;
          created_at: string;
          href?: string;
        }>;
      };
  loadProjectsRemoteState(
    request: (input: string, init?: RequestInit) => Promise<Response>,
  ): Promise<
    | { status: "error"; responseStatus: number | null }
    | { status: "empty" }
    | {
        status: "success";
        projects: Array<{ id: string; name: string; stage?: string }>;
        assets: Array<{
          id: string;
          project_id: string;
          title: string;
          file_type: string;
          status: string;
          created_at: string;
          href?: string;
        }>;
      }
  >;
};

async function loadModule(): Promise<ProjectsCollectionModule> {
  assert.equal(
    existsSync(helperPath),
    true,
    "Projects must route backend data through a reusable runtime contract",
  );
  return import(pathToFileURL(helperPath).href) as Promise<ProjectsCollectionModule>;
}

function validProject(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    id: "project-a",
    name: "Launch campaign",
    stage: "production",
    ...overrides,
  };
}

function validAsset(overrides: Partial<MediaAssetInput> = {}): MediaAssetInput {
  return {
    id: "asset-a",
    project_id: "project-a",
    title: "Launch cut",
    file_type: "video",
    status: "in_review",
    created_at: "2026-08-23T20:00:00.000Z",
    href: "/projects/project-a/assets/asset-a",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fixedResponses(input: {
  projects?: () => Response;
  assets?: () => Response;
}) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    assert.deepEqual(init, { cache: "no-store" });
    if (url === "/api/projects") return (input.projects ?? (() => jsonResponse({ items: [] })))();
    if (url === "/api/assets") return (input.assets ?? (() => jsonResponse({ items: [] })))();
    throw new Error(`Unexpected URL: ${url}`);
  };
}

test("project validation covers id, name, and nullable stage before rendering", async () => {
  const {
    isProjectCollectionItem,
    normalizeProjectCollectionItem,
  } = await loadModule();

  assert.equal(isProjectCollectionItem(validProject()), true);
  assert.equal(isProjectCollectionItem(validProject({ stage: null })), true);
  assert.equal(isProjectCollectionItem({ id: "project-a", name: "Launch campaign" }), true);
  assert.deepEqual(normalizeProjectCollectionItem(validProject({ stage: null })), {
    id: "project-a",
    name: "Launch campaign",
  });

  for (const malformed of [
    null,
    [],
    validProject({ id: "" }),
    validProject({ id: "../settings" }),
    validProject({ id: "project-a?tab=account" }),
    validProject({ id: `p${"a".repeat(128)}` }),
    validProject({ name: "" }),
    validProject({ name: " ".repeat(3) }),
    validProject({ name: "n".repeat(241) }),
    validProject({ id: 42 as unknown as string }),
    validProject({ name: null as unknown as string }),
    validProject({ stage: 3 as unknown as string }),
    validProject({ stage: "bad_stage" }),
  ]) {
    assert.equal(
      isProjectCollectionItem(malformed),
      false,
      `malformed project must be rejected: ${JSON.stringify(malformed)}`,
    );
  }
});

test("media validation covers every field consumed by the mobile Projects surface", async () => {
  const {
    isMediaAssetCollectionItem,
    normalizeMediaAssetCollectionItem,
  } = await loadModule();

  assert.equal(isMediaAssetCollectionItem(validAsset()), true);
  assert.deepEqual(normalizeMediaAssetCollectionItem(validAsset()), validAsset());

  const nullableHref = validAsset({ href: null });
  assert.equal(isMediaAssetCollectionItem(nullableHref), true);
  assert.deepEqual(normalizeMediaAssetCollectionItem(nullableHref), {
    id: "asset-a",
    project_id: "project-a",
    title: "Launch cut",
    file_type: "video",
    status: "in_review",
    created_at: "2026-08-23T20:00:00.000Z",
  });

  const withoutHref = validAsset();
  delete withoutHref.href;
  assert.equal(isMediaAssetCollectionItem(withoutHref), true);

  const malformedCases: Array<[string, MediaAssetInput]> = [
    ["id", validAsset({ id: "" })],
    ["id path escape", validAsset({ id: "../settings" })],
    ["id length", validAsset({ id: `a${"s".repeat(128)}` })],
    ["project_id", validAsset({ project_id: "" })],
    ["project_id path escape", validAsset({ project_id: "../settings" })],
    ["title", validAsset({ title: "" })],
    ["title whitespace", validAsset({ title: "   " })],
    ["title length", validAsset({ title: "t".repeat(501) })],
    ["file_type", validAsset({ file_type: "" })],
    ["file_type domain", validAsset({ file_type: "application/x-malformed" })],
    ["status", validAsset({ status: "" })],
    ["status domain", validAsset({ status: "bad_status" })],
    ["created_at parse", validAsset({ created_at: "not-a-date" })],
    ["created_at calendar", validAsset({ created_at: "2026-02-30T00:00:00.000Z" })],
    ["created_at hour", validAsset({ created_at: "2026-01-01T24:00:00.000Z" })],
    ["created_at minute", validAsset({ created_at: "2026-01-01T23:60:00.000Z" })],
    ["created_at second", validAsset({ created_at: "2026-01-01T23:59:60.000Z" })],
    ["href type", validAsset({ href: 42 as unknown as string })],
    ["href authority", validAsset({ href: "https://attacker.invalid/review" })],
    ["href synthetic authority", validAsset({ href: "https://co-videopro.invalid/projects/project-a" })],
    ["href traversal", validAsset({ href: "/projects/../settings" })],
    ["href encoded traversal", validAsset({ href: "/projects/%2e%2e/settings" })],
  ];
  for (const [label, malformed] of malformedCases) {
    assert.equal(
      isMediaAssetCollectionItem(malformed),
      false,
      `${label} must be rejected before rendering`,
    );
  }
});

test("non-OK projects and assets responses become failure rather than empty or success", async () => {
  const { loadProjectsRemoteState } = await loadModule();

  assert.deepEqual(
    await loadProjectsRemoteState(fixedResponses({
      projects: () => jsonResponse({ code: "BACKEND_UNAVAILABLE" }, 503),
    })),
    { status: "error", responseStatus: 503 },
  );
  assert.deepEqual(
    await loadProjectsRemoteState(fixedResponses({
      projects: () => jsonResponse({ items: [validProject()] }),
      assets: () => jsonResponse({ code: "AUTH_REQUIRED" }, 401),
    })),
    { status: "error", responseStatus: 401 },
  );
});

test("malformed 200 payloads and malformed items become failure rather than empty or success", async () => {
  const { loadProjectsRemoteState } = await loadModule();

  for (const request of [
    fixedResponses({ projects: () => jsonResponse({ items: null }) }),
    fixedResponses({ projects: () => jsonResponse([]) }),
    fixedResponses({ assets: () => jsonResponse({ unexpected: [] }) }),
    fixedResponses({ projects: () => new Response("not-json", { status: 200 }) }),
    fixedResponses({
      projects: () => jsonResponse({ items: [validProject({ stage: 7 as unknown as string })] }),
    }),
    fixedResponses({
      projects: () => jsonResponse({ items: [validProject()] }),
      assets: () => jsonResponse({ items: [validAsset({ file_type: null as unknown as string })] }),
    }),
  ]) {
    assert.deepEqual(
      await loadProjectsRemoteState(request),
      { status: "error", responseStatus: null },
    );
  }
});

test("legitimate empty and validated success remain distinct", async () => {
  const { loadProjectsRemoteState } = await loadModule();

  assert.deepEqual(
    await loadProjectsRemoteState(fixedResponses({})),
    { status: "empty" },
  );
  assert.deepEqual(
    await loadProjectsRemoteState(fixedResponses({
      projects: () => jsonResponse({ items: [validProject({ stage: null })] }),
      assets: () => jsonResponse({ items: [validAsset({ href: null })] }),
    })),
    {
      status: "success",
      projects: [{ id: "project-a", name: "Launch campaign" }],
      assets: [{
        id: "asset-a",
        project_id: "project-a",
        title: "Launch cut",
        file_type: "video",
        status: "in_review",
        created_at: "2026-08-23T20:00:00.000Z",
      }],
    },
  );
});

test("a failed reload cannot expose prior success data and a retry can recover", async () => {
  const { loadProjectsRemoteState } = await loadModule();
  let projectsAttempt = 0;
  const request = fixedResponses({
    projects: () => {
      projectsAttempt += 1;
      return projectsAttempt === 2
        ? jsonResponse({ code: "BACKEND_UNAVAILABLE" }, 502)
        : jsonResponse({ items: [validProject()] });
    },
    assets: () => jsonResponse({ items: [validAsset()] }),
  });

  const initial = await loadProjectsRemoteState(request);
  assert.equal(initial.status, "success");

  const failedReload = await loadProjectsRemoteState(request);
  assert.deepEqual(failedReload, { status: "error", responseStatus: 502 });
  assert.equal("projects" in failedReload, false);
  assert.equal("assets" in failedReload, false);

  const retry = await loadProjectsRemoteState(request);
  assert.equal(retry.status, "success");
  assert.equal(retry.status === "success" ? retry.projects[0]?.id : null, "project-a");
});

test("collection integrity rejects duplicate ids and orphan assets for remote and demo parity", async () => {
  const collection = await loadModule();
  assert.equal(
    typeof collection.projectsStateFromCollections,
    "function",
    "remote and demo collections must share one collection-level integrity gate",
  );

  const failure = { status: "error", responseStatus: null } as const;
  assert.deepEqual(
    collection.projectsStateFromCollections([validProject(), validProject()], []),
    failure,
  );
  assert.deepEqual(
    collection.projectsStateFromCollections(
      [validProject()],
      [validAsset(), validAsset()],
    ),
    failure,
  );
  assert.deepEqual(
    collection.projectsStateFromCollections(
      [validProject()],
      [validAsset({ project_id: "missing-project" })],
    ),
    failure,
  );
  assert.deepEqual(collection.projectsStateFromCollections([], [validAsset()]), failure);
  assert.deepEqual(collection.projectsStateFromCollections([], []), { status: "empty" });

  const success = collection.projectsStateFromCollections(
    [validProject()],
    [validAsset()],
  );
  assert.equal(success.status, "success");
});

test("the accepted mobile page uses the single integrity state without changing surface copy", () => {
  const page = readFileSync(
    resolve(repositoryRoot, "app/(dashboard)/projects/page.tsx"),
    "utf8",
  );

  assert.match(page, /loadProjectsRemoteState/);
  assert.match(page, /projectsStateFromCollections/);
  assert.match(page, /useState<ProjectsRemoteState>/);
  assert.match(page, /setRemoteState\(\{ status: "loading" \}\)/);
  assert.match(page, /onClick=\{retryProjects\}/);
  assert.doesNotMatch(page, /setRemoteProjects|setRemoteAssets/);
  assert.match(page, /<h1>Projects<\/h1>/);
  assert.match(page, /Projects unavailable/);
  assert.match(page, /Create your first project/);
  assert.match(page, /data-testid="project-list"/);
  assert.match(page, /data-testid="projects-end"/);
});
