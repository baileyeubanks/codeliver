"use client";

import { useEffect, useState } from "react";

const DATABASE_NAME = "co-deliver-demo-media";
const DATABASE_VERSION = 1;
const STORE_NAME = "media";
const CACHE_NAME = "co-videopro-demo-media-v1";
const CACHE_KEY_PATH = "/__co-videopro-demo-media__/";

interface StoredDemoMedia {
  assetId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  updatedAt: string;
}

export type DemoMediaBlobProgressPhase = "cache" | "indexeddb" | "memory" | "complete";

export interface DemoMediaBlobProgress {
  bytesStored: number;
  bytesTotal: number;
  percent: number;
  phase: DemoMediaBlobProgressPhase;
}

export interface PutDemoMediaBlobOptions {
  onProgress?: (progress: DemoMediaBlobProgress) => void;
}

const memoryFallback = new Map<string, StoredDemoMedia>();

function cacheKey(assetId: string): string {
  const origin = typeof location !== "undefined" && location.origin && location.origin !== "null"
    ? location.origin
    : "https://co-videopro.local";
  return new URL(`${CACHE_KEY_PATH}${encodeURIComponent(assetId)}`, origin).toString();
}

function canUseCacheStorage(): boolean {
  return typeof globalThis.caches !== "undefined" && typeof globalThis.caches.open === "function";
}

function reportProgress(
  options: PutDemoMediaBlobOptions | undefined,
  bytesStored: number,
  bytesTotal: number,
  phase: DemoMediaBlobProgressPhase,
) {
  options?.onProgress?.({
    bytesStored,
    bytesTotal,
    percent: bytesTotal === 0 ? 100 : Math.round((bytesStored / bytesTotal) * 100),
    phase,
  });
}

function streamWithProgress(
  blob: Blob,
  phase: DemoMediaBlobProgressPhase,
  options: PutDemoMediaBlobOptions | undefined,
): ReadableStream<Uint8Array> {
  const reader = blob.stream().getReader();
  let bytesStored = 0;

  reportProgress(options, bytesStored, blob.size, phase);

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      bytesStored += value.byteLength;
      reportProgress(options, bytesStored, blob.size, phase);
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

function createStoredRecord(assetId: string, file: File, blob: Blob = file): StoredDemoMedia {
  return {
    assetId,
    blob,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    updatedAt: new Date().toISOString(),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "assetId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local media storage."));
  });
}

export async function putDemoMediaBlob(
  assetId: string,
  file: File,
  options?: PutDemoMediaBlobOptions,
) {
  if (canUseCacheStorage()) {
    try {
      const cache = await globalThis.caches.open(CACHE_NAME);
      await cache.put(cacheKey(assetId), new Response(streamWithProgress(file, "cache", options), {
        headers: {
          "Content-Length": String(file.size),
          "Content-Type": file.type || "application/octet-stream",
          "X-Demo-Media-File-Name": encodeURIComponent(file.name),
          "X-Demo-Media-Updated-At": new Date().toISOString(),
        },
      }));
      memoryFallback.set(assetId, createStoredRecord(assetId, file));
      reportProgress(options, file.size, file.size, "complete");
      return { persistent: true };
    } catch {
      // Cache Storage can be disabled or quota-limited; retain the existing local fallbacks.
    }
  }

  try {
    const database = await openDatabase();
    const record = createStoredRecord(assetId, file);
    reportProgress(options, 0, file.size, "indexeddb");
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not store local media."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Local media storage was aborted."));
    });
    database.close();
    memoryFallback.set(assetId, record);
    reportProgress(options, file.size, file.size, "indexeddb");
    reportProgress(options, file.size, file.size, "complete");
    return { persistent: true };
  } catch {
    const record = createStoredRecord(assetId, file);
    memoryFallback.set(assetId, record);
    reportProgress(options, file.size, file.size, "memory");
    reportProgress(options, file.size, file.size, "complete");
    return { persistent: false };
  }
}

export async function getDemoMediaBlob(assetId: string): Promise<Blob | null> {
  const memoryRecord = memoryFallback.get(assetId);
  if (memoryRecord) return memoryRecord.blob;

  if (canUseCacheStorage()) {
    try {
      const cache = await globalThis.caches.open(CACHE_NAME);
      const response = await cache.match(cacheKey(assetId));
      if (response) {
        const blob = await response.blob();
        const encodedFileName = response.headers.get("X-Demo-Media-File-Name");
        const record: StoredDemoMedia = {
          assetId,
          blob,
          fileName: encodedFileName ? decodeURIComponent(encodedFileName) : assetId,
          mimeType: blob.type || "application/octet-stream",
          updatedAt: response.headers.get("X-Demo-Media-Updated-At") ?? new Date().toISOString(),
        };
        memoryFallback.set(assetId, record);
        return blob;
      }
    } catch {
      // IndexedDB remains available for browsers where Cache Storage cannot be read.
    }
  }

  try {
    const database = await openDatabase();
    const record = await new Promise<StoredDemoMedia | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(assetId);
      request.onsuccess = () => resolve(request.result as StoredDemoMedia | undefined);
      request.onerror = () => reject(request.error ?? new Error("Could not read local media."));
    });
    database.close();
    if (record) memoryFallback.set(assetId, record);
    return record?.blob ?? null;
  } catch {
    return null;
  }
}

export function useDemoMediaObjectUrl(assetId: string | null) {
  const [media, setMedia] = useState<{ assetId: string; objectUrl: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    async function loadMedia() {
      if (!assetId || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
      const blob = await getDemoMediaBlob(assetId);
      if (!blob || cancelled) return;
      createdUrl = URL.createObjectURL(blob);
      setMedia({ assetId, objectUrl: createdUrl });
    }

    void loadMedia();
    return () => {
      cancelled = true;
      if (createdUrl && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(createdUrl);
    };
  }, [assetId]);

  return media?.assetId === assetId ? media.objectUrl : null;
}
