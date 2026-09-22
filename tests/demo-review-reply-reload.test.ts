import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test, { after } from "node:test";
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
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !extname(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const values = new Map<string, string>();
let failWrites = false;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (failWrites) throw new Error("quota");
        values.set(key, value);
      },
      removeItem(key: string) {
        values.delete(key);
      },
    },
    addEventListener() {},
    removeEventListener() {},
  },
});

after(() => {
  Reflect.deleteProperty(globalThis, "window");
});

function moduleUrl(path: string) {
  return pathToFileURL(resolve(repositoryRoot, path)).href;
}

test("local replies survive reload beneath their parent on the exact review cut", async () => {
  const workspace = await import(moduleUrl("lib/demo/workspace-store.ts"));
  const binding = {projectId:"ica",assetId:"denie-mcdonald-v4",versionId:"demo-version-4",reviewInviteId:"reply-review",assetType:"video"};
  const parent = workspace.addDemoReviewComment({...binding,body:"Tighten this answer.",timeSeconds:44});
  assert.ok(parent);
  const reply = workspace.addDemoReviewComment({...binding,parentId:parent.id,body:"  Revised wording is ready.  ",timeSeconds:0,authorName:"QA Reviewer"});
  assert.ok(reply);
  const restored = workspace.restoreDemoWorkspace(values.get(workspace.DEMO_WORKSPACE_STORAGE_KEY));
  const saved = restored.reviewComments.find(item=>item.id===reply.id);
  assert.equal(saved?.parent_id,parent.id);
  const {projectPersistedDemoReviewComment} = await import(moduleUrl("lib/review/demo-comment-projection.ts"));
  const projected = projectPersistedDemoReviewComment(saved,binding);
  assert.equal(projected?.parent_id,parent.id);
  assert.equal(projected?.timecode_seconds,null,"replies must not create a frame-zero timeline note");
  assert.equal(projected?.body,"Revised wording is ready.");
  assert.equal(projected?.author_name,"QA Reviewer");
  for (const wrong of [{versionId:"demo-version-5"},{reviewInviteId:"another-invite"},{assetId:"another-asset"},{projectId:"another-project"},{parentId:"missing-parent"}]) {
    const result = workspace.addDemoReviewComment({...binding,parentId:parent.id,body:"Must not attach across review scope.",timeSeconds:0,...wrong});
    assert.equal(result,null);
  }
  assert.equal(workspace.addDemoReviewComment({...binding,parentId:reply.id,body:"No hidden nested thread.",timeSeconds:0}),null);
  const before=workspace.getDemoWorkspaceSnapshot().reviewComments.length;
  failWrites=true;
  try {
    assert.equal(workspace.addDemoReviewComment({...binding,parentId:parent.id,body:"Storage denied.",timeSeconds:0}),null);
    assert.equal(workspace.getDemoWorkspaceSnapshot().reviewComments.length,before,"failed persistence cannot report a saved reply");
  } finally { failWrites=false; }
});
