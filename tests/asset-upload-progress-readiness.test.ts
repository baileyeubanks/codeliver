import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repositoryRoot = process.env.CVP_ASSET_UPLOAD_ROOT
  ? resolve(process.env.CVP_ASSET_UPLOAD_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const uploader = readFileSync(
  resolve(repositoryRoot, "components/assets/AssetUpload.tsx"),
  "utf8",
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Element = { type: unknown; props: Record<string, any> };

function settle() {
  return new Promise<void>((done) => setImmediate(done));
}

async function flushTusCallbacks() {
  for (let index = 0; index < 6; index += 1) await settle();
}

function elements(node: unknown): Element[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  const element = node as Element;
  return [element, ...elements(element.props?.children)];
}

function uploadHarness() {
  const state: unknown[] = [];
  let cursor = 0;
  let generatedId = 0;
  const durableUploadUrl = "/api/upload/tus/durable-upload";
  let uploadedBytesHaveCommitted = false;
  const transport: string[] = [];
  const completions: unknown[][] = [];
  const instances: FakeTusUpload[] = [];

  const hooks = {
    ...React,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (value: unknown) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useCallback(callback: unknown) {
      cursor += 1;
      return callback;
    },
    useEffect() {
      cursor += 1;
    },
  };

  class FakeTusUpload {
    readonly number = instances.length;
    readonly abortCalls: boolean[] = [];
    readonly options: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fingerprint: (file: any) => Promise<string>;
      metadata: { idempotencyKey: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onAfterResponse: (request: any, response: { getHeader(name: string): string | null }) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onError: (error: any) => void;
      onSuccess: () => Promise<void>;
    };
    startCalls = 0;
    resumedFrom: { uploadUrl: string } | undefined;

    constructor(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _file: any,
      options: FakeTusUpload["options"],
    ) {
      this.options = options;
      instances.push(this);
    }

    async findPreviousUploads() {
      return uploadedBytesHaveCommitted ? [{ uploadUrl: durableUploadUrl }] : [];
    }

    resumeFromPreviousUpload(previous: { uploadUrl: string }) {
      this.resumedFrom = previous;
    }

    start() {
      this.startCalls += 1;
      if (this.number === 0) {
        transport.push("POST /api/upload/tus");
        transport.push(`PATCH ${durableUploadUrl} final -> 503`);
        uploadedBytesHaveCommitted = true;
        this.options.onError({
          message: "Catalog attachment is temporarily unavailable",
          originalResponse: { getStatus: () => 503 },
        });
        return;
      }

      transport.push(`HEAD ${this.resumedFrom?.uploadUrl ?? "missing"}`);
      this.options.onAfterResponse({}, {
        getHeader(name: string) {
          if (name === "Upload-State") return "committed";
          if (name === "Upload-Original-Ready") return "true";
          return null;
        },
      });
      void this.options.onSuccess();
    }

    abort(terminate = false) {
      this.abortCalls.push(terminate);
      if (terminate) transport.push(`DELETE ${durableUploadUrl}`);
      return Promise.resolve();
    }
  }

  const cache = new Map<string, unknown>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function load(relative: string): any {
    if (cache.has(relative)) return cache.get(relative);
    const output = ts.transpileModule(readFileSync(resolve(repositoryRoot, relative), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const loadedModule = { exports: {} };
    function imports(name: string): unknown {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "lucide-react") return new Proxy({}, { get: () => "svg" });
      if (name.endsWith(".css")) return new Proxy({}, { get: (_, key) => key });
      if (name === "tus-js-client") return { Upload: FakeTusUpload };
      if (name === "@/lib/utils/media") return { formatFileSize: (bytes: number) => `${bytes} B` };
      if (name === "@/lib/uploads/transfer-intent") return load("lib/uploads/transfer-intent.ts");
      throw new Error(`Unexpected import ${name}`);
    }
    runInNewContext(`(function(require,module,exports){${output}\n})`, {
      AbortSignal: { timeout: () => undefined },
      console: { error() {} },
      crypto: { randomUUID: () => `attempt-${++generatedId}` },
      fetch: async () => ({
        ok: true,
        json: async () => ({ readyForWrites: true, label: "Test storage", maxUploadBytes: 1_000_000, maxChunkBytes: 1_000_000 }),
      }),
      setTimeout,
    })(imports, loadedModule, loadedModule.exports);
    cache.set(relative, loadedModule.exports);
    return loadedModule.exports;
  }

  const AssetUpload = load("components/assets/AssetUpload.tsx").default;
  function render(): Element {
    cursor = 0;
    return AssetUpload({
      projectId: "project-1",
      onUploadComplete: async (assets: unknown[]) => { completions.push(assets); },
    });
  }

  return { completions, durableUploadUrl, instances, render, transport };
}

test("AssetUpload exposes tus byte progress through accessible progress ranges", () => {
  assert.match(uploader, /onProgress\(bytesUploaded, bytesTotal\)/);
  assert.match(uploader, /bytesUploaded,/);
  assert.match(uploader, /bytesTotal,/);
  assert.match(uploader, /role="progressbar"/);
  assert.match(uploader, /aria-valuenow=\{item\.bytesUploaded\}/);
  assert.match(uploader, /aria-valuemax=\{item\.bytesTotal\}/);
  assert.match(uploader, /aria-valuetext=\{`\$\{formatFileSize\(item\.bytesUploaded\)\} of \$\{formatFileSize\(item\.bytesTotal\)\} uploaded/);
});

test("AssetUpload preserves received bytes when tus completes into ready or quarantine", () => {
  assert.match(uploader, /bytesUploaded: item\.bytesTotal,/);
  assert.match(uploader, /status: quarantined \? "quarantined" : "done"/);
  assert.match(uploader, /Upload-State/);
  assert.match(uploader, /Upload-Original-Ready/);
});

test("AssetUpload keeps selected files pending while confirming readiness", () => {
  assert.doesNotMatch(uploader, /disabled=\{storage\.phase !== "ready"\}/);
  assert.match(uploader, /void refreshStorageReadiness\(\)\.then\(begin\)/);
  assert.match(uploader, /startTusUpload\(item, readiness\)/);
  assert.doesNotMatch(uploader, /Storage readiness is still being checked. Retry/);
  assert.match(uploader, /refreshStorageReadiness/);
  assert.match(uploader, /aria-label="Retry upload"/);
  assert.match(uploader, /aria-label="Remove failed upload"/);
  assert.doesNotMatch(uploader, /set(?:Timeout|Interval)\(/);
});

test("AssetUpload recovers a final PATCH 503 through persisted-url HEAD reconciliation", async () => {
  const app = uploadHarness();
  const file = { name: "review-master.mov", size: 480_000_000, type: "video/quicktime", lastModified: 1 };
  const input = elements(app.render()).find(
    (element) => element.type === "input" && element.props.type === "file",
  );
  assert.ok(input, "the real AssetUpload file input is rendered");

  input.props.onChange({ target: { files: [file], value: "" } });
  await flushTusCallbacks();
  assert.equal(app.instances.length, 1, "the first upload reaches its final PATCH");
  assert.deepEqual(app.transport, [
    "POST /api/upload/tus",
    `PATCH ${app.durableUploadUrl} final -> 503`,
  ]);

  const retry = elements(app.render()).find(
    (element) => element.props?.["aria-label"] === "Retry upload",
  );
  assert.ok(retry, "the real AssetUpload retry callback is exposed after the 503");
  retry.props.onClick();
  await flushTusCallbacks();

  const [failedUpload, resumedUpload] = app.instances;
  assert.equal(app.instances.length, 2, "retry creates a fresh tus client for recovery");
  assert.deepEqual(failedUpload.abortCalls, [], "the failed client is quiescent instead of receiving DELETE");
  assert.equal(failedUpload.startCalls, 1, "the failed client is never restarted after its terminal error");
  assert.equal(resumedUpload.resumedFrom?.uploadUrl, app.durableUploadUrl, "retry keeps the discovered upload URL");
  assert.equal(
    await resumedUpload.options.fingerprint(file),
    await failedUpload.options.fingerprint(file),
    "retry retains the durable tus fingerprint",
  );
  assert.equal(
    resumedUpload.options.metadata.idempotencyKey,
    failedUpload.options.metadata.idempotencyKey,
    "retry retains the catalog idempotency identity",
  );
  assert.deepEqual(app.transport, [
    "POST /api/upload/tus",
    `PATCH ${app.durableUploadUrl} final -> 503`,
    `HEAD ${app.durableUploadUrl}`,
  ], "the recovery path sends HEAD and never DELETE");
  assert.equal(app.completions.length, 1, "the real onSuccess callback reports completion after reconciliation");
  assert.equal(app.completions[0].length, 0, "reconciliation completes without inventing a second asset payload");
});
