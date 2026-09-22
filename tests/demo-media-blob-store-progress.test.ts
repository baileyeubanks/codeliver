import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const blobStoreSource = readFileSync(
  resolve(repositoryRoot, "lib/demo/media-blob-store.ts"),
  "utf8",
);

interface CacheEntry {
  body: ArrayBuffer;
  headers: Headers;
}

class InMemoryCache {
  private readonly entries = new Map<string, CacheEntry>();

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(String(request), {
      body: await response.arrayBuffer(),
      headers: new Headers(response.headers),
    });
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const entry = this.entries.get(String(request));
    return entry && new Response(entry.body.slice(0), { headers: entry.headers });
  }
}

function createChunkedFile(payload: Uint8Array): File {
  return {
    name: "progress-proof.mp4",
    size: payload.byteLength,
    type: "video/mp4",
    slice(start = 0, end = payload.byteLength) {
      const part = payload.slice(start, end);
      return {
        size: part.byteLength,
        type: "video/mp4",
        arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength),
      };
    },
    stream() {
      let offset = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= payload.byteLength) {
            controller.close();
            return;
          }

          const nextOffset = Math.min(offset + 48 * 1024, payload.byteLength);
          controller.enqueue(payload.slice(offset, nextOffset));
          offset = nextOffset;
        },
      });
    },
  } as unknown as File;
}

test("streams demo media into persistent cache with byte-derived progress", async () => {
  const previousCaches = globalThis.caches;
  const cache = new InMemoryCache();
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { open: async () => cache },
  });

  try {
    const store = await import("../lib/demo/media-blob-store.ts?progress-test=first-import");
    const payload = new Uint8Array(1200 * 1024).map((_, index) => index % 251);
    const file = createChunkedFile(payload);
    const progress: Array<{ bytesStored: number; bytesTotal: number; percent: number; phase: string }> = [];

    const result = await store.putDemoMediaBlob("asset-progress-proof", file, {
      onProgress: (update) => progress.push(update),
    });

    assert.deepEqual(result, { persistent: true });
    assert.deepEqual(progress[0], {
      bytesStored: 0,
      bytesTotal: file.size,
      percent: 0,
      phase: "cache",
    });
    assert.deepEqual(progress.at(-1), {
      bytesStored: file.size,
      bytesTotal: file.size,
      percent: 100,
      phase: "complete",
    });
    assert.ok(progress.some((update) => update.bytesStored > 0 && update.bytesStored < file.size));
    assert.ok(progress.every((update) => update.bytesStored >= 0 && update.bytesStored <= file.size));

    const reloadedStore = await import("../lib/demo/media-blob-store.ts?progress-test=after-reload");
    const reloadedBlob = await reloadedStore.getDemoMediaBlob("asset-progress-proof");

    assert.ok(reloadedBlob);
    assert.equal(reloadedBlob.type, "video/mp4");
    assert.deepEqual(new Uint8Array(await reloadedBlob.arrayBuffer()), payload);
  } finally {
    if (previousCaches === undefined) {
      Reflect.deleteProperty(globalThis, "caches");
    } else {
      Object.defineProperty(globalThis, "caches", {
        configurable: true,
        value: previousCaches,
      });
    }
  }
});

test("IndexedDB fallback does not duplicate large uploads in JavaScript memory", () => {
  assert.doesNotMatch(blobStoreSource, /copyBlobWithProgress/);
  assert.doesNotMatch(blobStoreSource, /const chunks: BlobPart\[\]/);
});

test("local upload completes even when a background tab receives no animation frames", async () => {
  const oldCaches = Object.getOwnPropertyDescriptor(globalThis,"caches");
  const oldFrames = Object.getOwnPropertyDescriptor(globalThis,"requestAnimationFrame");
  const cache = new InMemoryCache();
  const pendingFrames: FrameRequestCallback[] = [];
  Object.defineProperty(globalThis,"caches",{configurable:true,value:{open:async()=>cache}});
  Object.defineProperty(globalThis,"requestAnimationFrame",{configurable:true,value:(callback:FrameRequestCallback)=>{pendingFrames.push(callback);return pendingFrames.length;}});
  const store = await import("../lib/demo/media-blob-store.ts?progress-test=background");
  const bytes = new Uint8Array(1200 * 1024).fill(37);
  const upload = store.putDemoMediaBlob("background-source",createChunkedFile(bytes));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      upload.then(()=>"stored"),
      new Promise<string>(resolve=>{timeout=setTimeout(()=>resolve("waiting for paint"),1000);}),
    ]);
    assert.equal(result,"stored","storage must not await a browser animation frame");
    const reloaded = await import("../lib/demo/media-blob-store.ts?progress-test=background-reload");
    const blob = await reloaded.getDemoMediaBlob("background-source");
    assert.ok(blob);
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),bytes);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (oldFrames) Object.defineProperty(globalThis,"requestAnimationFrame",oldFrames);
    else Reflect.deleteProperty(globalThis,"requestAnimationFrame");
    for (const callback of pendingFrames) callback(0);
    await upload;
    if (oldCaches) Object.defineProperty(globalThis,"caches",oldCaches);
    else Reflect.deleteProperty(globalThis,"caches");
  }
});
