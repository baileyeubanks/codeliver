export type SelectedMediaKind = "video" | "audio" | "image" | "unknown";

export type MediaInspectionReason =
  | "unsupported-media"
  | "browser-api-unavailable"
  | "metadata-timeout"
  | "metadata-load-failed"
  | "metadata-unavailable"
  | "thumbnail-timeout"
  | "thumbnail-load-failed"
  | "thumbnail-unavailable"
  | "thumbnail-encoding-failed";

export type MediaDuration =
  | { status: "available"; seconds: number }
  | { status: "not-applicable"; reason: "image-has-no-duration" }
  | { status: "unavailable"; reason: MediaInspectionReason };

export type MediaThumbnail =
  | {
      status: "available";
      blob: Blob;
      mimeType: "image/jpeg";
      width: number;
      height: number;
    }
  | { status: "not-applicable"; reason: "audio-has-no-visual-frame" }
  | { status: "unavailable"; reason: MediaInspectionReason };

export interface MediaInspection {
  kind: SelectedMediaKind;
  duration: MediaDuration;
  thumbnail: MediaThumbnail;
}

interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface MediaElementLike extends EventTargetLike {
  src: string;
  preload: string;
  duration: number;
  muted?: boolean;
  playsInline?: boolean;
  currentTime?: number;
  videoWidth?: number;
  videoHeight?: number;
  load?: () => void;
}

interface ImageElementLike extends EventTargetLike {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}

interface CanvasContextLike {
  drawImage(
    source: MediaElementLike | ImageElementLike,
    x: number,
    y: number,
    width: number,
    height: number
  ): void;
}

interface CanvasElementLike {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasContextLike | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export interface MediaInspectionEnvironment {
  createObjectURL(file: Blob): string;
  revokeObjectURL(url: string): void;
  createVideoElement(): MediaElementLike;
  createAudioElement(): MediaElementLike;
  createImageElement(): ImageElementLike;
  createCanvasElement(): CanvasElementLike;
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export interface MediaInspectionOptions {
  /** Each browser operation is limited to this bounded duration. */
  timeoutMs?: number;
  /** Primarily for browser-adapter tests and non-DOM webviews. */
  browser?: MediaInspectionEnvironment;
}

type SelectedMediaFile = Blob & { name?: string };

type MetadataResult =
  | { status: "available"; seconds: number }
  | { status: "unavailable"; reason: "metadata-timeout" | "metadata-load-failed" | "metadata-unavailable" };

type FrameResult =
  | { status: "available" }
  | {
      status: "unavailable";
      reason: "thumbnail-timeout" | "thumbnail-load-failed" | "thumbnail-unavailable";
    };

const DEFAULT_TIMEOUT_MS = 8_000;
const MIN_TIMEOUT_MS = 250;
const MAX_TIMEOUT_MS = 30_000;
const MAX_THUMBNAIL_DIMENSION = 1_280;

const VIDEO_EXTENSIONS = new Set([
  "3g2",
  "3gp",
  "asf",
  "avi",
  "f4v",
  "flv",
  "m2ts",
  "m2v",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "mts",
  "ogv",
  "ts",
  "webm",
  "wmv",
]);

const AUDIO_EXTENSIONS = new Set([
  "aac",
  "aif",
  "aiff",
  "alac",
  "amr",
  "ape",
  "au",
  "caf",
  "flac",
  "m4a",
  "mid",
  "midi",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "ra",
  "wav",
  "weba",
  "wma",
]);

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jfif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);

const EXTENSION_FALLBACK_MIME_TYPES = new Set([
  "",
  "application/octet-stream",
  "application/binary",
  "application/x-binary",
  "application/ogg",
]);

/**
 * Uses a browser-provided MIME type when it is specific, then falls back to a
 * file extension only when browsers commonly report a generic type.
 */
export function classifySelectedMedia(file: SelectedMediaFile): SelectedMediaKind {
  const mimeType = normalizeMimeType(file.type);
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  if (!EXTENSION_FALLBACK_MIME_TYPES.has(mimeType)) return "unknown";

  const extension = fileExtension(file.name);
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return "unknown";
}

export async function inspectSelectedMedia(
  file: SelectedMediaFile,
  options: MediaInspectionOptions = {}
): Promise<MediaInspection> {
  const kind = classifySelectedMedia(file);
  if (kind === "unknown") return unavailableInspection(kind, "unsupported-media");

  const browser = options.browser ?? defaultBrowserEnvironment();
  if (!browser) return unavailableInspection(kind, "browser-api-unavailable");

  let objectUrl: string;
  try {
    objectUrl = browser.createObjectURL(file);
  } catch {
    return unavailableInspection(kind, "browser-api-unavailable");
  }

  const timeoutMs = boundedTimeout(options.timeoutMs);
  try {
    if (kind === "audio") {
      const metadata = await readMetadata(browser.createAudioElement(), objectUrl, browser, timeoutMs);
      return {
        kind,
        duration: metadata,
        thumbnail: { status: "not-applicable", reason: "audio-has-no-visual-frame" },
      };
    }

    if (kind === "image") {
      const thumbnail = await createImageThumbnail(
        browser.createImageElement(),
        objectUrl,
        browser,
        timeoutMs
      );
      return {
        kind,
        duration: { status: "not-applicable", reason: "image-has-no-duration" },
        thumbnail,
      };
    }

    const video = browser.createVideoElement();
    const metadata = await readMetadata(video, objectUrl, browser, timeoutMs);
    if (metadata.status === "unavailable") {
      return { kind, duration: metadata, thumbnail: { status: "unavailable", reason: metadata.reason } };
    }

    const thumbnail = await createVideoThumbnail(video, metadata.seconds, browser, timeoutMs);
    return { kind, duration: metadata, thumbnail };
  } catch {
    return unavailableInspection(kind, kind === "image" ? "thumbnail-unavailable" : "metadata-unavailable");
  } finally {
    browser.revokeObjectURL(objectUrl);
  }
}

function normalizeMimeType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function fileExtension(name: string | undefined): string {
  if (!name) return "";
  const normalized = name.split(/[?#]/, 1)[0]?.trim().toLowerCase() ?? "";
  const dot = normalized.lastIndexOf(".");
  return dot >= 0 ? normalized.slice(dot + 1) : "";
}

function boundedTimeout(requestedTimeout: number | undefined): number {
  if (!Number.isFinite(requestedTimeout)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(requestedTimeout!)));
}

function unavailableInspection(kind: SelectedMediaKind, reason: MediaInspectionReason): MediaInspection {
  return {
    kind,
    duration:
      kind === "image"
        ? { status: "not-applicable", reason: "image-has-no-duration" }
        : { status: "unavailable", reason },
    thumbnail:
      kind === "audio"
        ? { status: "not-applicable", reason: "audio-has-no-visual-frame" }
        : { status: "unavailable", reason },
  };
}

function defaultBrowserEnvironment(): MediaInspectionEnvironment | null {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return null;
  }

  return {
    createObjectURL: (file) => URL.createObjectURL(file),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createVideoElement: () => document.createElement("video") as unknown as MediaElementLike,
    createAudioElement: () => document.createElement("audio") as unknown as MediaElementLike,
    createImageElement: () => document.createElement("img") as unknown as ImageElementLike,
    createCanvasElement: () => document.createElement("canvas") as unknown as CanvasElementLike,
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    clearTimeout: (handle) => globalThis.clearTimeout(handle),
  };
}

async function readMetadata(
  media: MediaElementLike,
  objectUrl: string,
  browser: MediaInspectionEnvironment,
  timeoutMs: number
): Promise<MetadataResult> {
  media.preload = "metadata";
  return await new Promise<MetadataResult>((resolve) => {
    let timer: TimerHandle | undefined = undefined;
    let settled = false;
    const cleanup = () => {
      if (timer !== undefined) browser.clearTimeout(timer);
      media.removeEventListener("loadedmetadata", onMetadata);
      media.removeEventListener("error", onFailure);
      media.removeEventListener("abort", onFailure);
    };
    const settle = (result: MetadataResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onMetadata = () => {
      const duration = media.duration;
      settle(
        Number.isFinite(duration) && duration >= 0
          ? { status: "available", seconds: duration }
          : { status: "unavailable", reason: "metadata-unavailable" }
      );
    };
    const onFailure = () => settle({ status: "unavailable", reason: "metadata-load-failed" });

    media.addEventListener("loadedmetadata", onMetadata);
    media.addEventListener("error", onFailure);
    media.addEventListener("abort", onFailure);
    timer = browser.setTimeout(() => settle({ status: "unavailable", reason: "metadata-timeout" }), timeoutMs);

    try {
      media.src = objectUrl;
      media.load?.();
    } catch {
      settle({ status: "unavailable", reason: "metadata-load-failed" });
    }
  });
}

async function createVideoThumbnail(
  video: MediaElementLike,
  duration: number,
  browser: MediaInspectionEnvironment,
  timeoutMs: number
): Promise<MediaThumbnail> {
  if (duration <= 0) return { status: "unavailable", reason: "thumbnail-unavailable" };
  const frame = await seekToPosterFrame(video, Math.min(duration * 0.1, 1), browser, timeoutMs);
  if (frame.status === "unavailable") return frame;

  const width = video.videoWidth ?? 0;
  const height = video.videoHeight ?? 0;
  return await canvasThumbnail(video, width, height, browser);
}

async function createImageThumbnail(
  image: ImageElementLike,
  objectUrl: string,
  browser: MediaInspectionEnvironment,
  timeoutMs: number
): Promise<MediaThumbnail> {
  const loaded = await new Promise<"loaded" | "timeout" | "failed">((resolve) => {
    let timer: TimerHandle | undefined = undefined;
    let settled = false;
    const cleanup = () => {
      if (timer !== undefined) browser.clearTimeout(timer);
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onFailure);
      image.removeEventListener("abort", onFailure);
    };
    const settle = (result: "loaded" | "timeout" | "failed") => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onLoad = () => settle("loaded");
    const onFailure = () => settle("failed");

    image.addEventListener("load", onLoad);
    image.addEventListener("error", onFailure);
    image.addEventListener("abort", onFailure);
    timer = browser.setTimeout(() => settle("timeout"), timeoutMs);

    try {
      image.src = objectUrl;
    } catch {
      settle("failed");
    }
  });

  if (loaded === "timeout") return { status: "unavailable", reason: "thumbnail-timeout" };
  if (loaded === "failed") return { status: "unavailable", reason: "thumbnail-load-failed" };
  return await canvasThumbnail(image, image.naturalWidth, image.naturalHeight, browser);
}

async function seekToPosterFrame(
  video: MediaElementLike,
  time: number,
  browser: MediaInspectionEnvironment,
  timeoutMs: number
): Promise<FrameResult> {
  if (typeof video.currentTime !== "number") {
    return { status: "unavailable", reason: "thumbnail-unavailable" };
  }

  return await new Promise<FrameResult>((resolve) => {
    let timer: TimerHandle | undefined = undefined;
    let settled = false;
    const cleanup = () => {
      if (timer !== undefined) browser.clearTimeout(timer);
      video.removeEventListener("seeked", onFrame);
      video.removeEventListener("error", onFailure);
      video.removeEventListener("abort", onFailure);
    };
    const settle = (result: FrameResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onFrame = () => settle({ status: "available" });
    const onFailure = () => settle({ status: "unavailable", reason: "thumbnail-load-failed" });

    video.addEventListener("seeked", onFrame);
    video.addEventListener("error", onFailure);
    video.addEventListener("abort", onFailure);
    timer = browser.setTimeout(() => settle({ status: "unavailable", reason: "thumbnail-timeout" }), timeoutMs);

    try {
      video.currentTime = time;
    } catch {
      settle({ status: "unavailable", reason: "thumbnail-load-failed" });
    }
  });
}

async function canvasThumbnail(
  source: MediaElementLike | ImageElementLike,
  sourceWidth: number,
  sourceHeight: number,
  browser: MediaInspectionEnvironment
): Promise<MediaThumbnail> {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return { status: "unavailable", reason: "thumbnail-unavailable" };
  }

  const { width, height } = scaledDimensions(sourceWidth, sourceHeight);
  try {
    const canvas = browser.createCanvasElement();
    const context = canvas.getContext("2d");
    if (!context) return { status: "unavailable", reason: "thumbnail-unavailable" };

    canvas.width = width;
    canvas.height = height;
    context.drawImage(source, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, "image/jpeg");
    if (!blob) return { status: "unavailable", reason: "thumbnail-encoding-failed" };
    return { status: "available", blob, mimeType: "image/jpeg", width, height };
  } catch {
    return { status: "unavailable", reason: "thumbnail-encoding-failed" };
  }
}

function scaledDimensions(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_THUMBNAIL_DIMENSION / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(canvas: CanvasElementLike, type: "image/jpeg"): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.88));
}
