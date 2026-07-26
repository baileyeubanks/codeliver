import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySelectedMedia,
  inspectSelectedMedia,
  type MediaInspectionEnvironment,
} from "../lib/demo/media-inspection.ts";

type Listener = () => void;

class FakeMediaElement {
  src = "";
  preload = "";
  muted = false;
  playsInline = false;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  private currentTimeValue = 0;
  private readonly loadBehavior: "metadata" | "error" | "never";
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(
    duration: number,
    loadBehavior: "metadata" | "error" | "never" = "metadata",
    dimensions: { width: number; height: number } = { width: 1920, height: 1080 }
  ) {
    this.duration = duration;
    this.loadBehavior = loadBehavior;
    this.videoWidth = dimensions.width;
    this.videoHeight = dimensions.height;
  }

  get currentTime(): number {
    return this.currentTimeValue;
  }

  set currentTime(value: number) {
    this.currentTimeValue = value;
    queueMicrotask(() => this.emit("seeked"));
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  load(): void {
    if (this.loadBehavior === "never") return;
    queueMicrotask(() => this.emit(this.loadBehavior === "error" ? "error" : "loadedmetadata"));
  }

  private emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

class FakeImageElement {
  naturalWidth: number;
  naturalHeight: number;
  private readonly loadBehavior: "load" | "error" | "never";
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(
    loadBehavior: "load" | "error" | "never" = "load",
    dimensions: { width: number; height: number } = { width: 800, height: 450 }
  ) {
    this.loadBehavior = loadBehavior;
    this.naturalWidth = dimensions.width;
    this.naturalHeight = dimensions.height;
  }

  set src(_value: string) {
    if (this.loadBehavior === "never") return;
    queueMicrotask(() => this.emit(this.loadBehavior));
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  private emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

class FakeCanvas {
  width = 0;
  height = 0;
  drawCalls: unknown[][] = [];

  getContext(type: string) {
    if (type !== "2d") return null;
    return {
      drawImage: (...args: unknown[]) => this.drawCalls.push(args),
    };
  }

  toBlob(callback: (blob: Blob | null) => void, type?: string): void {
    callback(new Blob(["actual thumbnail pixels"], { type }));
  }
}

function selectedFile(name: string, type: string): Blob & { name: string } {
  return Object.assign(new Blob(["selected media"], { type }), { name });
}

function createBrowserEnvironment(options: {
  video?: FakeMediaElement;
  audio?: FakeMediaElement;
  image?: FakeImageElement;
  canvas?: FakeCanvas;
  timeoutImmediately?: boolean;
} = {}) {
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  let nextUrl = 0;
  const canvas = options.canvas ?? new FakeCanvas();

  const browser: MediaInspectionEnvironment = {
    createObjectURL() {
      const url = `blob:test/${++nextUrl}`;
      createdUrls.push(url);
      return url;
    },
    revokeObjectURL(url) {
      revokedUrls.push(url);
    },
    createVideoElement() {
      return options.video ?? new FakeMediaElement(0);
    },
    createAudioElement() {
      return options.audio ?? new FakeMediaElement(0);
    },
    createImageElement() {
      return options.image ?? new FakeImageElement();
    },
    createCanvasElement() {
      return canvas;
    },
    setTimeout(callback) {
      if (options.timeoutImmediately) queueMicrotask(callback);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout() {},
  };

  return { browser, canvas, createdUrls, revokedUrls };
}

test("classifies selected media from normalized MIME type before extension fallback", () => {
  assert.equal(classifySelectedMedia(selectedFile("camera-original.bin", "Video/MP4; codecs=avc1")), "video");
  assert.equal(classifySelectedMedia(selectedFile("misnamed.mov", "audio/mpeg")), "audio");
  assert.equal(classifySelectedMedia(selectedFile("still.HEIC", "application/octet-stream")), "image");
  assert.equal(classifySelectedMedia(selectedFile("brief.pdf", "application/pdf")), "unknown");
});

test("reads the actual video duration and produces a canvas poster Blob", async () => {
  const video = new FakeMediaElement(137.25);
  const environment = createBrowserEnvironment({ video });

  const inspection = await inspectSelectedMedia(selectedFile("interview.mp4", "video/mp4"), {
    browser: environment.browser,
  });

  assert.equal(inspection.kind, "video");
  assert.deepEqual(inspection.duration, { status: "available", seconds: 137.25 });
  assert.equal(inspection.thumbnail.status, "available");
  if (inspection.thumbnail.status === "available") {
    assert.equal(inspection.thumbnail.blob.type, "image/jpeg");
    assert.equal(await inspection.thumbnail.blob.text(), "actual thumbnail pixels");
  }
  assert.equal(environment.canvas.drawCalls.length, 1);
  assert.deepEqual(environment.revokedUrls, environment.createdUrls);
});

test("reads the actual audio duration without inventing a visual thumbnail", async () => {
  const environment = createBrowserEnvironment({ audio: new FakeMediaElement(91.5) });

  const inspection = await inspectSelectedMedia(selectedFile("voiceover.wav", "audio/wav"), {
    browser: environment.browser,
  });

  assert.equal(inspection.kind, "audio");
  assert.deepEqual(inspection.duration, { status: "available", seconds: 91.5 });
  assert.deepEqual(inspection.thumbnail, {
    status: "not-applicable",
    reason: "audio-has-no-visual-frame",
  });
  assert.deepEqual(environment.revokedUrls, environment.createdUrls);
});

test("creates an image thumbnail Blob from loaded image dimensions", async () => {
  const environment = createBrowserEnvironment({
    image: new FakeImageElement("load", { width: 800, height: 450 }),
  });

  const inspection = await inspectSelectedMedia(selectedFile("frame.webp", "image/webp"), {
    browser: environment.browser,
  });

  assert.equal(inspection.kind, "image");
  assert.deepEqual(inspection.duration, { status: "not-applicable", reason: "image-has-no-duration" });
  assert.equal(inspection.thumbnail.status, "available");
  assert.equal(environment.canvas.width, 800);
  assert.equal(environment.canvas.height, 450);
  assert.deepEqual(environment.revokedUrls, environment.createdUrls);
});

test("returns explicit unavailable results and revokes the URL after a bounded metadata timeout", async () => {
  const environment = createBrowserEnvironment({
    video: new FakeMediaElement(0, "never"),
    timeoutImmediately: true,
  });

  const inspection = await inspectSelectedMedia(selectedFile("offline.mov", "video/quicktime"), {
    browser: environment.browser,
    timeoutMs: 1,
  });

  assert.equal(inspection.kind, "video");
  assert.deepEqual(inspection.duration, { status: "unavailable", reason: "metadata-timeout" });
  assert.deepEqual(inspection.thumbnail, { status: "unavailable", reason: "metadata-timeout" });
  assert.deepEqual(environment.revokedUrls, environment.createdUrls);
});
