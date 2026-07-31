import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type ProbeTestState = typeof globalThis & {
  __ccoDocumentProbeRow?: Record<string, unknown> | null;
  __ccoDocumentProbeError?: { message: string } | null;
  __ccoDocumentProbeSelect?: string;
  __ccoDocumentProbeEquality?: [string, string];
};

const state = globalThis as ProbeTestState;

function dataModule(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

const opaqueTokenStub = dataModule(`
  export function opaqueTokenLookup(token) {
    return { column: "token_hash", value: "hashed-" + token };
  }
`);

const supabaseStub = dataModule(`
  class Query {
    select(columns) {
      globalThis.__ccoDocumentProbeSelect = columns;
      return this;
    }
    eq(column, value) {
      globalThis.__ccoDocumentProbeEquality = [column, value];
      return this;
    }
    async maybeSingle() {
      return {
        data: globalThis.__ccoDocumentProbeRow ?? null,
        error: globalThis.__ccoDocumentProbeError ?? null,
      };
    }
  }

  export function getSupabase() {
    return {
      from(table) {
        if (table !== "review_invites") {
          throw new Error("unexpected table: " + table);
        }
        return new Query();
      },
    };
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/security/opaque-token") {
      return nextResolve(opaqueTokenStub, context);
    }
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStub, context);
    }
    return nextResolve(specifier, context);
  },
});

async function authorityModule() {
  return import(
    pathToFileURL(
      resolve(repositoryRoot, "lib/review/document-authority.ts"),
    ).href
  );
}

test.afterEach(() => {
  state.__ccoDocumentProbeRow = undefined;
  state.__ccoDocumentProbeError = undefined;
  state.__ccoDocumentProbeSelect = undefined;
  state.__ccoDocumentProbeEquality = undefined;
});

test("the document probe distinguishes an existing token without consuming admission", async () => {
  state.__ccoDocumentProbeRow = { id: "invite-a" };
  const { probeReviewDocumentAuthority } = await authorityModule();

  assert.deepEqual(
    await probeReviewDocumentAuthority("opaque-token-value"),
    { ok: true },
  );
  assert.equal(state.__ccoDocumentProbeSelect, "id");
  assert.deepEqual(state.__ccoDocumentProbeEquality, [
    "token_hash",
    "hashed-opaque-token-value",
  ]);
});

test("the document probe maps a missing record to 404 and a database error to 503", async () => {
  const { probeReviewDocumentAuthority } = await authorityModule();

  state.__ccoDocumentProbeRow = null;
  assert.deepEqual(
    await probeReviewDocumentAuthority("missing-token-value"),
    {
      ok: false,
      status: 404,
      error: "Invalid or expired review link",
    },
  );

  state.__ccoDocumentProbeError = { message: "database offline" };
  assert.deepEqual(
    await probeReviewDocumentAuthority("unknown-token-value"),
    {
      ok: false,
      status: 503,
      error: "Review service is unavailable",
    },
  );
});

test("the production document route probes authority before rendering the client", () => {
  const source = readFileSync(
    resolve(repositoryRoot, "app/review/[token]/page.tsx"),
    "utf8",
  );

  assert.match(source, /probeReviewDocumentAuthority\(token\)/);
  assert.match(source, /documentAuthority\.status === 404/);
  assert.match(source, /new BackendUnavailableError\("Review database"\)/);
  assert.match(
    source,
    /probeReviewDocumentAuthority\(token\)[\s\S]*return <PublicReviewPage \/>/,
  );
  assert.doesNotMatch(source, /admitReviewInvite|getReviewInviteByToken/);
});
