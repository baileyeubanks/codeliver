import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { register, registerHooks } from "node:module";
import { dirname, extname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SourceCatalog } from "../lib/demo/source-catalog.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
register("./typescript-resolver.mjs", import.meta.url);
registerHooks({resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
  const base = resolve(repositoryRoot, specifier.slice(2));
  return nextResolve(pathToFileURL(extname(base) ? base : existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`).href, context);
}});

const catalog: SourceCatalog = {
  imported_at: "2026-09-22T00:00:00Z",
  projects: [{id:"automation-days", name:"Automation Days"}],
  assets: [{id:"aayush-v2",project_id:"automation-days",title:"Aayush v2",bytes:200,duration_seconds:123.248,width:1920,height:1080,created_at:"2026-09-09T00:00:00Z"}],
};

test("source workspace clears fixtures and rejects old persistence while retaining new user work", async () => {
  // Load the store with the same startup configuration as the preview launcher.
  process.env.NEXT_PUBLIC_CVP_SOURCE_CATALOG = JSON.stringify(catalog);
  const { serializeSourceWorkspace, unwrapSourceWorkspace } = await import("../lib/demo/source-catalog.ts");
  const { createInitialDemoWorkspace, restoreDemoWorkspace } = await import("../lib/demo/workspace-store.ts");
  const source = createInitialDemoWorkspace();
  const illustrative = {...source, projects:[{id:"ica",name:"Stock client"}],reviewComments:[{id:"fake-comment"}]};
  assert.deepEqual(source.projects.map(p=>p.id), ["automation-days"]);
  assert.deepEqual(source.assets.map(a=>a.id), ["aayush-v2"]);
  assert.deepEqual(source.organizations.map(o=>o.name), ["Schneider Electric"]);
  for (const collection of [source.reviewComments, source.approvalStages, source.contacts, source.deliverables, source.shareLinks, source.performanceMetrics]) assert.equal(collection.length, 0);
  assert.equal(JSON.stringify(source).includes("ica-ceo-preview"), false);
  assert.equal(unwrapSourceWorkspace(illustrative, catalog), null);
  assert.equal(unwrapSourceWorkspace(source, catalog), null, "untagged earlier source state cannot restore");
  const reset = restoreDemoWorkspace(JSON.stringify(illustrative));
  assert.deepEqual(reset.projects.map(p=>p.id), ["automation-days"]);
  assert.equal(reset.reviewComments.length,0);
  source.whiteboardBoards[0].nodes[0].body = "My new note";
  const serialized = serializeSourceWorkspace(source, catalog);
  const restored = unwrapSourceWorkspace(JSON.parse(serialized), catalog) as typeof source;
  assert.equal(restored.whiteboardBoards[0].nodes[0].body, "My new note");
  assert.equal(restoreDemoWorkspace(serialized).whiteboardBoards[0].nodes[0].body, "My new note");
  assert.equal(unwrapSourceWorkspace(JSON.parse(serialized), {...catalog,imported_at:"2026-09-23T00:00:00Z"}), null);
});

test("poster input verification rejects traversal and symlink escapes before ffmpeg", async () => {
  const { verifiedSourcePath } = await import(pathToFileURL(join(repositoryRoot,"scripts/source-preview-paths.mjs")).href);
  const base = mkdtempSync(join(tmpdir(), "cvp-source-paths-"));
  try {
    const root = join(base,"archive"); mkdirSync(root);
    const safe = join(root,"safe.mp4"); writeFileSync(safe,"1234");
    const outside = join(base,"outside.mp4"); writeFileSync(outside,"1234");
    assert.equal(verifiedSourcePath(root,{id:"safe",path:safe,bytes:4}), realpathSync(safe));
    assert.throws(()=>verifiedSourcePath(root,{id:"escape",path:join(root,"../outside.mp4"),bytes:4}), /outside archive/);
    symlinkSync(outside,join(root,"link.mp4"));
    assert.throws(()=>verifiedSourcePath(root,{id:"link",path:join(root,"link.mp4"),bytes:4}), /outside archive/);
    assert.throws(()=>verifiedSourcePath(root,{id:"drift",path:safe,bytes:9}), /identity changed/);
  } finally { rmSync(base,{recursive:true,force:true}); }
});
