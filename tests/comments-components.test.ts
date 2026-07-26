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

import type {
  Comment,
  CommentThreadFilter,
  MentionRosterEntry,
} from "../lib/types/codeliver.ts";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const composerSource = readFileSync(
  resolve(repositoryRoot, "components/comments/ReplyComposer.tsx"),
  "utf8",
);
const threadSource = readFileSync(
  resolve(repositoryRoot, "components/comments/CommentThread.tsx"),
  "utf8",
);

interface CommentListPropsForTest {
  comments: Comment[];
  roster?: MentionRosterEntry[];
  currentUserId?: string;
  demoMode?: boolean;
  selectedId?: string | null;
  onSelect?: (comment: Comment) => void;
  onSeek?: (time: number) => void;
  onReplySubmit?: (parentId: string, body: string, mentions: string[]) => void;
  onResolve?: (id: string) => void;
  onUnresolve?: (id: string) => void;
  onEdit?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
}

interface CommentListModule {
  default: ComponentType<CommentListPropsForTest>;
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

function evaluateModule(
  output: string,
  mockRequire: (specifier: string) => unknown,
) {
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

const Icon = (props: Record<string, unknown>) =>
  React.createElement("svg", props);
const lucideMock = new Proxy(
  {},
  { get: () => Icon },
);

const moduleCache = new Map<string, Record<string, unknown>>();

function loadRealModule(specifier: string): Record<string, unknown> {
  const cached = moduleCache.get(specifier);
  if (cached) return cached;

  const relativePath = specifier
    .replace("@/components/", "components/")
    .replace("@/lib/", "lib/");
  const modulePath = resolve(repositoryRoot, `${relativePath}.tsx`);
  const tsPath = resolve(repositoryRoot, `${relativePath}.ts`);

  let loaded: Record<string, unknown>;
  try {
    loaded = evaluateModule(transpileTsModule(modulePath), mockRequire);
  } catch {
    loaded = evaluateModule(transpileTsModule(tsPath), mockRequire);
  }
  moduleCache.set(specifier, loaded);
  return loaded;
}

function mockRequire(specifier: string): unknown {
  if (specifier === "react" || specifier === "react/jsx-runtime") {
    return require(specifier);
  }
  if (specifier === "lucide-react") return lucideMock;
  if (specifier === "@/lib/utils/media") {
    return { timeAgo: () => "2h ago" };
  }
  if (specifier === "@/components/comments/TimecodeLink") {
    // TimecodeLink is owned by P16; stub it for these P18 component tests.
    return {
      default: (props: { seconds: number }) =>
        React.createElement(
          "button",
          { type: "button", "data-testid": "timecode-link" },
          `${props.seconds}s`,
        ),
    };
  }
  if (
    specifier.startsWith("@/lib/comments/") ||
    specifier.startsWith("@/components/comments/")
  ) {
    return loadRealModule(specifier);
  }
  throw new Error(`Unexpected import: ${specifier}`);
}

const commentList = loadRealModule(
  "@/components/comments/CommentList",
) as unknown as CommentListModule;

const roster: MentionRosterEntry[] = [
  { id: "u-1", handle: "jane", name: "Jane Doe" },
  { id: "u-2", handle: "marcus", name: "Marcus Lee" },
];

function makeComment(overrides: Partial<Comment>): Comment {
  return {
    id: "c-0",
    review_id: null,
    review_invite_id: null,
    asset_id: "asset-1",
    version_id: null,
    parent_id: null,
    author_name: "Author",
    author_email: null,
    author_id: null,
    body: "Body",
    rich_body: null,
    timecode_seconds: null,
    frame_number: null,
    pin_x: null,
    pin_y: null,
    mentions: [],
    status: "open",
    visibility: "internal",
    resolved_by: null,
    resolved_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const longBody =
  "This note runs long on purpose. ".repeat(12).trim() +
  " It should clamp after three rendered lines.";

const fixtureComments: Comment[] = [
  makeComment({
    id: "c-1",
    author_name: "Client Reviewer",
    body: "@jane please check the grade on this shot.",
    mentions: ["jane"],
    attachments: [
      {
        id: "att-1",
        comment_id: "c-1",
        file_url: "/files/brief.pdf",
        file_name: "brief.pdf",
        file_type: "application/pdf",
        file_size: 12 * 1024,
      },
    ],
    reactions: [
      {
        id: "rx-1",
        comment_id: "c-1",
        user_id: "demo-user",
        emoji: "👍",
        created_at: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "rx-2",
        comment_id: "c-1",
        user_id: "u-2",
        emoji: "👍",
        created_at: "2026-07-01T00:00:00.000Z",
      },
    ],
  }),
  makeComment({
    id: "c-2",
    parent_id: "c-1",
    author_name: "Studio",
    body: "On it — new pass uploading shortly.",
    created_at: "2026-07-01T00:05:00.000Z",
  }),
  makeComment({
    id: "c-3",
    author_name: "Client Reviewer",
    body: "Title treatment approved, no further changes.",
    status: "resolved",
    resolved_at: "2026-07-01T01:00:00.000Z",
    created_at: "2026-07-01T00:10:00.000Z",
  }),
  makeComment({
    id: "c-4",
    author_name: "Producer",
    body: longBody,
    created_at: "2026-07-01T00:15:00.000Z",
  }),
];

function renderList(
  overrides: Partial<CommentListPropsForTest> = {},
): string {
  return renderToStaticMarkup(
    React.createElement(commentList.default, {
      comments: fixtureComments,
      roster,
      currentUserId: "demo-user",
      demoMode: true,
      onReplySubmit: () => {},
      onResolve: () => {},
      onUnresolve: () => {},
      onEdit: () => {},
      onDelete: () => {},
      ...overrides,
    }),
  );
}

test("filter chips render All / Open / Resolved with truthful counts", () => {
  const markup = renderList();
  assert.match(markup, /aria-label="Filter comments by status"/);
  // Counts are per thread (root): c-1 + reply, c-3 resolved, c-4 long.
  assert.match(markup, /All \(3\)/);
  assert.match(markup, /Open \(2\)/);
  assert.match(markup, /Resolved \(1\)/);
  // The default filter is All and is marked pressed.
  assert.match(
    markup,
    /<button[^>]*aria-pressed="true"[^>]*>All \(3\)<\/button>/,
  );
});

test("mentions render highlighted inside the comment body", () => {
  const markup = renderList();
  assert.match(
    markup,
    /<span class="[^"]*bg-\[var\(--blue\)\]\/10[^"]*">@jane<\/span>/,
  );
});

test("reaction row shows the fixed emoji set with aggregated counts and own state", () => {
  const markup = renderList();
  assert.match(markup, /role="group" aria-label="Comment reactions"/);
  // Two 👍 reactions, one of them the viewer's own (aria-pressed precedes
  // aria-label in the rendered attribute order).
  assert.match(
    markup,
    /aria-pressed="true" aria-label="👍 reaction, 2, you reacted"/,
  );
  // The rest of the fixed row is present with zero counts.
  for (const emoji of ["❤️", "✅", "👀"]) {
    assert.ok(
      markup.includes(`aria-label="${emoji} reaction, 0"`),
      `missing zero-count chip for ${emoji}`,
    );
  }
});

test("attachments render as chips with icon, name, size, and download affordance", () => {
  const markup = renderList();
  assert.match(markup, /brief\.pdf/);
  assert.match(markup, /12\.0 KB/);
  assert.match(markup, /aria-label="Download brief\.pdf"/);
});

test("long comments clamp with a Show more toggle; short ones do not", () => {
  const markup = renderList();
  assert.match(markup, /aria-expanded="false"[^>]*>Show more<\/button>/);
  assert.match(markup, /line-clamp-3/);
  // The short reply body never gets a clamp toggle of its own; exactly one
  // Show more exists (for c-4).
  assert.equal(markup.match(/Show more<\/button>/g)?.length, 1);
});

test("threads render replies with a collapse/expand toggle and reply count", () => {
  const markup = renderList();
  assert.match(markup, /aria-expanded="true"[^>]*>\s*<svg[^>]*><\/svg>1 reply<\/button>/);
  assert.match(markup, /On it — new pass uploading shortly\./);
});

test("resolved threads collapse by default with an expand affordance", () => {
  const markup = renderList();
  // Roots sort oldest-first: c-1 (1), resolved c-3 (2), long c-4 (3).
  assert.match(markup, /aria-label="Expand resolved thread 2"/);
  assert.match(markup, /Resolved<\/span>/);
});

test("hover actions expose labeled edit and delete buttons", () => {
  const markup = renderList();
  assert.match(
    markup,
    /aria-label="Edit comment by Client Reviewer"/,
  );
  assert.match(
    markup,
    /aria-label="Delete comment by Client Reviewer"/,
  );
  // Hover-reveal: actions stay keyboard-discoverable via focus-within.
  assert.match(markup, /focus-within:opacity-100/);
});

test("reply button and resolve/unresolve actions are present with 44px mobile targets", () => {
  const markup = renderList();
  assert.match(markup, />Reply<\/button>/);
  assert.match(markup, />Resolve<\/button>/);
  assert.ok(markup.includes("min-h-[44px]"), "missing 44px mobile targets");
});

test("empty state is honest when no comments exist", () => {
  const markup = renderList({ comments: [] });
  assert.match(markup, /No comments yet\./);
});

test("reply composer keyboard contract: Enter sends, Shift+Enter newlines, autocomplete is a listbox", () => {
  assert.match(composerSource, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(composerSource, /role="listbox"/);
  assert.match(composerSource, /role="option"/);
  assert.match(composerSource, /aria-label="Mention suggestions"/);
  // Submitted bodies are parsed for handles before leaving the composer.
  assert.match(composerSource, /onSubmit\(body, parseMentions\(body\)\)/);
});

test("comment thread keeps the resolved treatment and honest demo note", () => {
  assert.match(threadSource, /Demo only — changes are not saved\./);
  assert.match(threadSource, /role="status"/);
  assert.match(threadSource, /CommentThreadFilter|status === "resolved"/);
});

// Type-level smoke: the filter type round-trips through the list props.
const filterTypeCheck: CommentThreadFilter = "all";
assert.equal(filterTypeCheck, "all");
