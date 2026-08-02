"use client";

import { useEffect, useState } from "react";

const DATABASE_NAME = "co-deliver-demo-media";
const DATABASE_VERSION = 1;
const STORE_NAME = "media";

interface StoredDemoMedia {
  assetId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  updatedAt: string;
}

const memoryFallback = new Map<string, StoredDemoMedia>();

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

export async function putDemoMediaBlob(assetId: string, file: File) {
  const record: StoredDemoMedia = {
    assetId,
    blob: file,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    updatedAt: new Date().toISOString(),
  };
  memoryFallback.set(assetId, record);

  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not store local media."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Local media storage was aborted."));
    });
    database.close();
    return { persistent: true };
  } catch {
    return { persistent: false };
  }
}

export async function getDemoMediaBlob(assetId: string): Promise<Blob | null> {
  const memoryRecord = memoryFallback.get(assetId);
  if (memoryRecord) return memoryRecord.blob;

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
