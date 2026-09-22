import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
type ScanBoundaryState = typeof globalThis & {
  __ccoScanBoundarySession: Record<string, unknown>;
  __ccoScanBoundaryAfter: Array<() => Promise<void> | void>;
  __ccoScanBoundaryBeginCalls: number;
  __ccoScanBoundaryScans: number;
  __ccoScanBoundaryRecoveries: number;
  __ccoScanBoundaryCatalogCalls: number;
  __ccoScanBoundaryCatalogBusy: boolean;
  __ccoScanBoundaryDerivativeRetries: number;
};
const state = globalThis as ScanBoundaryState;

const moduleUrl = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const authStub = moduleUrl(`export async function requireAuth(){return {id:"user-a"}}`);
const configStub = moduleUrl(`export function readStorageConfig(){return {writeEnabled:true,issues:[]}}`);
const afterStub = moduleUrl(`export function afterResponse(task){globalThis.__ccoScanBoundaryAfter.push(task)}`);
const orchestratorStub = moduleUrl(`
  export function createDefaultUploadOrchestrator(){return {
    async getSession(){return globalThis.__ccoScanBoundarySession},
    async beginMalwareScanRetry(){globalThis.__ccoScanBoundaryBeginCalls += 1; return globalThis.__ccoScanBoundarySession},
    async resumeMalwareScanRetry(){
      if(globalThis.__ccoScanBoundarySession.state === "committed") return globalThis.__ccoScanBoundarySession;
      globalThis.__ccoScanBoundaryScans += 1;
      globalThis.__ccoScanBoundarySession = {...globalThis.__ccoScanBoundarySession,state:"committed",receipt:{objectKey:"object"},assetId:"asset-a",versionId:"version-a",catalog:{state:"attached"}};
      return globalThis.__ccoScanBoundarySession;
    },
    async recoverSession(){
      globalThis.__ccoScanBoundaryRecoveries += 1;
      globalThis.__ccoScanBoundarySession = {...globalThis.__ccoScanBoundarySession,state:"committed",receipt:{objectKey:"object"},assetId:"asset-a",versionId:"version-a",catalog:{state:"attached"}};
      return globalThis.__ccoScanBoundarySession;
    },
    async resumeDeferredFinalization(){
      if(globalThis.__ccoScanBoundarySession.state === "committed") return globalThis.__ccoScanBoundarySession;
      globalThis.__ccoScanBoundaryScans += 1;
      globalThis.__ccoScanBoundarySession = {
        ...globalThis.__ccoScanBoundarySession,
        state:"committed", finalizationDeferred:false,
        scan:{verdict:"clean",engine:"test",signature:null,detail:"clean",scannedAt:new Date().toISOString()},
        receipt:{provider:"local",objectKey:"object",size:7,sha256:"c".repeat(64),providerVersionId:"v1",committedAt:new Date().toISOString()},
        assetId:"asset-a",versionId:"version-a",catalog:{state:"attached"}
      };
      return globalThis.__ccoScanBoundarySession;
    },
    async retryDerivatives(){
      globalThis.__ccoScanBoundaryDerivativeRetries += 1;
      globalThis.__ccoScanBoundarySession = {...globalThis.__ccoScanBoundarySession,derivatives:{state:"ready"}};
      return globalThis.__ccoScanBoundarySession;
    }
  }}
`);
const sharedStub = moduleUrl(`
  export function assertUploadStorageConfigured(){}
  export async function ensureCatalogAsset(){
    globalThis.__ccoScanBoundaryCatalogCalls += 1;
    if(globalThis.__ccoScanBoundaryCatalogBusy){
      const error = new Error("Upload session is busy; retry after backoff");
      error.name = "UploadOrchestrationError";
      error.code = "UPLOAD_BUSY";
      error.retryable = true;
      throw error;
    }
    return {id:"asset-a",version_id:"version-a"}
  }
  export function jsonUploadError(error,headers){return new Response(JSON.stringify({error:error.message}),{status:500,headers})}
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStub, context);
    if (specifier === "@/lib/storage/config") return nextResolve(configStub, context);
    if (specifier === "@/lib/runtime/after-response") return nextResolve(afterStub, context);
    if (specifier === "@/lib/tus/orchestrator") return nextResolve(orchestratorStub, context);
    if (specifier === "@/app/api/upload/_shared") return nextResolve(sharedStub, context);
    if (specifier === "@/lib/api/responses") {
      return nextResolve(pathToFileURL(resolve(repositoryRoot, "lib/api/responses.ts")).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const uploadId = "11111111-1111-4111-8111-111111111111";
const baseSession = () => ({
  id: uploadId,
  state: "verifying",
  offset: 7,
  size: 7,
  scan: null,
  finalizationDeferred: true,
  receipt: null,
  objectKey: null,
  assetId: null,
  versionId: null,
  version: 1,
  catalog: { state: "pending" },
});

async function post() {
  const { POST } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/tus/[uploadId]/scan/route.ts")).href
  );
  return POST(
    new NextRequest(`https://co-videopro.com/api/upload/tus/${uploadId}/scan`, { method: "POST" }),
    { params: Promise.resolve({ uploadId }) },
  );
}

async function get() {
  const { GET } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/tus/[uploadId]/scan/route.ts")).href
  );
  return GET(
    new NextRequest(`https://co-videopro.com/api/upload/tus/${uploadId}/scan`),
    { params: Promise.resolve({ uploadId }) },
  );
}

test("duplicate deferred POST callbacks run the expensive scan once", async () => {
  state.__ccoScanBoundarySession = baseSession();
  state.__ccoScanBoundaryAfter = [];
  state.__ccoScanBoundaryBeginCalls = 0;
  state.__ccoScanBoundaryScans = 0;
  state.__ccoScanBoundaryRecoveries = 0;

  assert.equal((await post()).status, 202);
  assert.equal((await post()).status, 202);
  assert.equal(state.__ccoScanBoundaryAfter.length, 2);
  await state.__ccoScanBoundaryAfter[0]();
  await state.__ccoScanBoundaryAfter[1]();
  assert.equal(state.__ccoScanBoundaryScans, 1);
  assert.equal(state.__ccoScanBoundaryBeginCalls, 0);
});

test("POST schedules clean placement recovery without waiting on the active lock", async () => {
  state.__ccoScanBoundarySession = {
    ...baseSession(), finalizationDeferred: false, objectKey: "object",
    scan: { verdict: "clean", engine: "test" },
  };
  state.__ccoScanBoundaryAfter = [];
  state.__ccoScanBoundaryBeginCalls = 0;
  state.__ccoScanBoundaryRecoveries = 0;
  const response = await post();
  const payload = await response.json();
  assert.equal(response.status, 202);
  assert.equal(payload.message, "Saving verified media to durable storage.");
  assert.equal(state.__ccoScanBoundaryRecoveries, 0);
  assert.equal(state.__ccoScanBoundaryAfter.length, 1);
  await state.__ccoScanBoundaryAfter[0]();
  assert.equal(state.__ccoScanBoundaryRecoveries, 1);
  assert.equal(state.__ccoScanBoundaryBeginCalls, 0);
});

test("POST observes an active retained-byte timeout retry without synchronously taking its lock", async () => {
  state.__ccoScanBoundarySession = {
    ...baseSession(), finalizationDeferred: false,
    scan: { verdict: "error", engine: "scanner-timeout" },
  };
  state.__ccoScanBoundaryAfter = [];
  state.__ccoScanBoundaryBeginCalls = 0;
  state.__ccoScanBoundaryCatalogCalls = 0;
  state.__ccoScanBoundaryCatalogBusy = false;
  state.__ccoScanBoundaryDerivativeRetries = 0;
  state.__ccoScanBoundaryScans = 0;
  const response = await post();
  assert.equal(response.status, 202);
  assert.equal(state.__ccoScanBoundaryScans, 0);
  await state.__ccoScanBoundaryAfter[0]();
  assert.equal(state.__ccoScanBoundaryScans, 1);
  assert.equal(state.__ccoScanBoundaryBeginCalls, 0);
});

test("POST after scan completion returns the exact ready receipt without starting a retry", async () => {
  state.__ccoScanBoundarySession = {
    ...baseSession(),
    state: "committed",
    finalizationDeferred: false,
    scan: { verdict: "clean" },
    receipt: { objectKey: "object" },
    assetId: "asset-a",
    versionId: "version-a",
    catalog: { state: "attached" },
  };
  state.__ccoScanBoundaryAfter = [];
  state.__ccoScanBoundaryBeginCalls = 0;
  const response = await post();
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.originalReady, true);
  assert.deepEqual(payload.asset, { id: "asset-a" });
  assert.deepEqual(payload.version, { id: "version-a", number: 1 });
  assert.equal(state.__ccoScanBoundaryBeginCalls, 0);
  assert.equal(state.__ccoScanBoundaryAfter.length, 0);
  assert.equal(state.__ccoScanBoundaryCatalogCalls, 0);
  assert.equal(state.__ccoScanBoundaryDerivativeRetries, 1);
});

test("GET keeps a clean committed upload processing while catalog attachment is busy", async () => {
  state.__ccoScanBoundarySession = {
    ...baseSession(),
    state: "committed",
    finalizationDeferred: false,
    scan: { verdict: "clean" },
    receipt: { objectKey: "object" },
    catalog: { state: "pending" },
  };
  state.__ccoScanBoundaryCatalogCalls = 0;
  state.__ccoScanBoundaryCatalogBusy = true;

  const response = await get();
  const payload = await response.json();
  assert.equal(response.status, 202);
  assert.equal(payload.state, "committed");
  assert.equal(payload.originalReady, false);
  assert.equal(payload.processing, true);
  assert.match(payload.message, /finalizing.*catalog/i);
  assert.equal(state.__ccoScanBoundaryCatalogCalls, 1);
});
