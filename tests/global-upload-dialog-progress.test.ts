import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import ts from "typescript";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = resolve(repositoryRoot, "components/navigation/GlobalUploadDialog.tsx");
const componentSource = readFileSync(componentPath, "utf8");

interface ElementNode {
  type: unknown;
  props: Record<string, unknown>;
}

interface UploadProgress {
  bytesStored: number;
  bytesTotal: number;
  percent: number;
  phase: string;
}

interface PendingWrite {
  assetId: string;
  onProgress?: (progress: UploadProgress) => void;
  resolve: (result: { persistent: boolean }) => void;
  reject: (error: Error) => void;
}

interface DialogModule {
  default: (props: { querySuffix: string; onClose: () => void }) => ElementNode;
}

function isElementNode(value: unknown): value is ElementNode {
  return Boolean(value) && typeof value === "object" && "type" in value && "props" in value;
}

function collectText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(collectText).join("");
  if (isElementNode(value)) return collectText(value.props.children);
  return "";
}

function findElement(value: unknown, predicate: (element: ElementNode) => boolean): ElementNode | null {
  if (Array.isArray(value)) {
    for (const child of value) {
      const match = findElement(child, predicate);
      if (match) return match;
    }
    return null;
  }
  if (!isElementNode(value)) return null;
  if (predicate(value)) return value;
  return findElement(value.props.children, predicate);
}

function createHookHarness() {
  const states: unknown[] = [];
  let cursor = 0;

  return {
    react: {
      useRef: <T,>(current: T) => ({ current }),
      useState: <T,>(initial: T | (() => T)) => {
        const stateIndex = cursor++;
        if (!(stateIndex in states)) {
          states[stateIndex] = typeof initial === "function" ? (initial as () => T)() : initial;
        }
        return [states[stateIndex] as T, (next: T | ((current: T) => T)) => {
          states[stateIndex] = typeof next === "function"
            ? (next as (current: T) => T)(states[stateIndex] as T)
            : next;
        }] as const;
      },
    },
    render(Component: DialogModule["default"], props: { querySuffix: string; onClose: () => void }) {
      cursor = 0;
      return Component(props);
    },
  };
}

function loadDialogModule({
  onAddAssets,
  onPutBlob,
  onPush,
  onInspect,
}: {
  onAddAssets: (assets: Array<{
    id: string;
    file_type?: string;
    duration_seconds?: number;
    thumbnail_url?: string;
  }>) => void;
  onPutBlob: (assetId: string, file: File, options?: { onProgress?: (progress: UploadProgress) => void }) => Promise<{ persistent: boolean }>;
  onPush: (href: string) => void;
  onInspect?: (file: File) => Promise<{
    kind: "video" | "audio" | "image" | "unknown";
    duration:
      | { status: "available"; seconds: number }
      | { status: "unavailable"; reason: string }
      | { status: "not-applicable"; reason: string };
    thumbnail:
      | { status: "available"; blob: Blob; mimeType: "image/jpeg"; width: number; height: number }
      | { status: "unavailable"; reason: string }
      | { status: "not-applicable"; reason: string };
  }>;
}) {
  const harness = createHookHarness();
  const output = ts.transpileModule(componentSource, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: componentPath,
  }).outputText;
  const loadedModule = { exports: {} as DialogModule };
  const styles = new Proxy({}, { get: (_target, key) => String(key) });
  const Icon = () => null;

  function mockRequire(specifier: string): unknown {
    if (specifier === "react") return harness.react;
    if (specifier === "react/jsx-runtime") {
      return {
        jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
        jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
      };
    }
    if (specifier === "next/navigation") return { useRouter: () => ({ push: onPush }) };
    if (specifier === "lucide-react") return { Upload: Icon, X: Icon };
    if (specifier === "@/lib/demo/workspace-store") {
      return {
        addDemoAssets: onAddAssets,
        useDemoWorkspace: () => ({ projects: [{ id: "project-1", name: "Launch film" }] }),
      };
    }
    if (specifier === "@/lib/demo/media-blob-store") return { putDemoMediaBlob: onPutBlob };
    if (specifier === "@/lib/demo/media-inspection") {
      return {
        inspectSelectedMedia: onInspect ?? (async (file: File) => ({
          kind: file.type.startsWith("audio/")
            ? "audio"
            : file.type.startsWith("image/")
              ? "image"
              : "video",
          duration: file.type.startsWith("video/")
            ? { status: "available", seconds: 12.5 }
            : { status: "not-applicable", reason: "image-has-no-duration" },
          thumbnail: { status: "unavailable", reason: "thumbnail-unavailable" },
        })),
      };
    }
    if (specifier === "@/lib/demo/workspace") {
      return { buildInternalDemoAssetHref: (projectId: string, assetId: string) => `/projects/${projectId}/assets/${assetId}` };
    }
    if (specifier === "./useDialogFocus") return { useDialogFocus: () => undefined };
    if (specifier === "./GlobalUploadDialog.module.css") return { __esModule: true, default: styles };
    throw new Error(`Unexpected GlobalUploadDialog import: ${specifier}`);
  }

  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${output}\n })`,
  ) as (loader: typeof mockRequire, moduleRecord: typeof loadedModule, exports: DialogModule) => void;
  evaluate(mockRequire, loadedModule, loadedModule.exports);

  return {
    dialog: loadedModule.exports.default,
    render: harness.render,
  };
}

function uploadButton(tree: ElementNode): ElementNode {
  const button = findElement(tree, (element) => element.type === "button" && /Upload/.test(collectText(element)));
  assert.ok(button, "upload command should be rendered");
  return button;
}

test("GlobalUploadDialog renders callback progress and waits for all registered files before navigation", async () => {
  const pendingWrites: PendingWrite[] = [];
  const addedAssets: Array<Array<{
    id: string;
    file_type?: string;
    duration_seconds?: number;
    thumbnail_url?: string;
  }>> = [];
  const navigations: string[] = [];
  let closeCount = 0;
  const firstFile = { name: "intro-cut.mp4", size: 1024, type: "video/mp4" } as File;
  const secondFile = { name: "voiceover.wav", size: 2048, type: "audio/wav" } as File;
  const { dialog, render } = loadDialogModule({
    onAddAssets: (assets) => addedAssets.push(assets),
    onPutBlob: (assetId, _file, options) => new Promise((resolve, reject) => {
      pendingWrites.push({ assetId, onProgress: options?.onProgress, resolve, reject });
    }),
    onPush: (href) => navigations.push(href),
  });

  let tree = render(dialog, { querySuffix: "?demo=1", onClose: () => { closeCount += 1; } });
  const fileInput = findElement(tree, (element) => element.type === "input" && element.props.type === "file");
  assert.ok(fileInput, "file input should be rendered");
  (fileInput.props.onChange as (event: { target: { files: File[] } }) => void)({ target: { files: [firstFile, secondFile] } });
  tree = render(dialog, { querySuffix: "?demo=1", onClose: () => { closeCount += 1; } });

  const upload = uploadButton(tree);
  const closeDuringUpload = findElement(tree, (element) => element.type === "button" && element.props["aria-label"] === "Close upload dialog");
  assert.ok(closeDuringUpload, "upload dialog should have a close control");
  const uploadPromise = (upload.props.onClick as () => Promise<void>)();
  await Promise.resolve();

  assert.equal(pendingWrites.length, 1);
  assert.equal(typeof pendingWrites[0].onProgress, "function", "putDemoMediaBlob must receive the onProgress callback");
  (closeDuringUpload.props.onClick as () => void)();
  assert.equal(addedAssets.length, 0);
  assert.equal(closeCount, 0);
  assert.deepEqual(navigations, []);

  pendingWrites[0].onProgress?.({ bytesStored: 512, bytesTotal: 1024, percent: 50, phase: "storing" });
  tree = render(dialog, { querySuffix: "?demo=1", onClose: () => { closeCount += 1; } });
  const progress = findElement(tree, (element) => element.type === "progress");
  assert.equal(progress?.props.value, 17);
  assert.equal(progress?.props.max, 100);
  assert.match(collectText(tree), /intro-cut\.mp4/);
  assert.match(collectText(tree), /512 B of 1 KB/);
  assert.match(collectText(tree), /17% overall/);

  pendingWrites[0].resolve({ persistent: true });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(pendingWrites.length, 2);
  assert.equal(addedAssets.length, 0);
  assert.equal(closeCount, 0);
  assert.deepEqual(navigations, []);

  pendingWrites[1].onProgress?.({ bytesStored: 2048, bytesTotal: 2048, percent: 100, phase: "storing" });
  pendingWrites[1].resolve({ persistent: false });
  await uploadPromise;
  tree = render(dialog, { querySuffix: "?demo=1", onClose: () => { closeCount += 1; } });

  assert.equal(addedAssets.length, 1);
  assert.equal(addedAssets[0].length, 2);
  assert.equal(addedAssets[0][0].file_type, "video");
  assert.equal(addedAssets[0][0].duration_seconds, 12.5);
  assert.equal(addedAssets[0][0].thumbnail_url, undefined);
  assert.equal(addedAssets[0][1].file_type, "audio");
  assert.equal(addedAssets[0][1].duration_seconds, undefined);
  assert.equal(closeCount, 0);
  assert.deepEqual(navigations, []);
  assert.match(collectText(tree), /Stored on this device/);
  assert.match(collectText(tree), /Session-only fallback/);
  assert.match(collectText(tree), /Open project/);

  const openProject = findElement(tree, (element) => element.type === "button" && /Open project/.test(collectText(element)));
  assert.ok(openProject, "completed uploads should expose the project navigation command");
  (openProject.props.onClick as () => void)();
  assert.equal(closeCount, 1);
  assert.deepEqual(navigations, ["/projects/project-1?demo=1"]);
});

test("GlobalUploadDialog keeps a failed file visible as a terminal error", async () => {
  let pendingWrite: PendingWrite | null = null;
  const { dialog, render } = loadDialogModule({
    onAddAssets: () => undefined,
    onPutBlob: (assetId, _file, options) => new Promise((resolve, reject) => {
      pendingWrite = { assetId, onProgress: options?.onProgress, resolve, reject };
    }),
    onPush: () => undefined,
  });
  const file = { name: "missing-master.mov", size: 4096, type: "video/quicktime" } as File;
  let tree = render(dialog, { querySuffix: "", onClose: () => undefined });
  const fileInput = findElement(tree, (element) => element.type === "input" && element.props.type === "file");
  assert.ok(fileInput);
  (fileInput.props.onChange as (event: { target: { files: File[] } }) => void)({ target: { files: [file] } });
  tree = render(dialog, { querySuffix: "", onClose: () => undefined });

  const uploadPromise = (uploadButton(tree).props.onClick as () => Promise<void>)();
  await Promise.resolve();
  assert.equal(typeof pendingWrite?.onProgress, "function", "failed uploads still require callback-driven progress");
  pendingWrite?.onProgress?.({ bytesStored: 1024, bytesTotal: 4096, percent: 25, phase: "storing" });
  pendingWrite?.reject(new Error("Local media storage was aborted."));
  await uploadPromise;
  tree = render(dialog, { querySuffix: "", onClose: () => undefined });

  assert.match(collectText(tree), /missing-master\.mov/);
  assert.match(collectText(tree), /Upload failed/);
  assert.match(collectText(tree), /Local media storage was aborted/);
});
