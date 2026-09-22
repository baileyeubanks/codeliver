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
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Element = { type: unknown; props: Record<string, any>; key?: unknown };

type Cleanup = (() => void) | void;
type Effect = () => Cleanup;

function sameDependencies(left: readonly unknown[] | undefined, right: readonly unknown[] | undefined) {
  return left?.length === right?.length && left.every((value, index) => Object.is(value, right[index]));
}

function allElements(node: unknown): Element[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(allElements);
  const element = node as Element;
  return [element, ...allElements(element.props?.children)];
}

class FakeVideo {
  buffered = { length: 0, end: () => 0 };
  currentTime = 0;
  duration = 0;
  muted = false;
  paused = true;
  playbackRate = 1;
  src = "";
  videoHeight = 1;
  videoWidth = 1;
  volume = 1;
  readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(name: string, listener: () => void) {
    const listeners = this.listeners.get(name) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: () => void) {
    this.listeners.get(name)?.delete(listener);
  }

  emit(name: string) {
    for (const listener of this.listeners.get(name) ?? []) listener();
  }

  load() {}

  pause() {
    this.paused = true;
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }
}

type HlsHandler = (event: string, data: { fatal?: boolean }) => void;

class FakeHls {
  static instances: FakeHls[] = [];
  static Events = { ERROR: "error" };
  static supported = false;
  readonly handlers = new Map<string, Set<HlsHandler>>();
  destroyed = 0;
  source = "";

  static isSupported() {
    return FakeHls.supported;
  }

  constructor() {
    FakeHls.instances.push(this);
  }

  attachMedia() {}

  destroy() {
    this.destroyed += 1;
  }

  emit(name: string, data: { fatal?: boolean }) {
    for (const handler of this.handlers.get(name) ?? []) handler(name, data);
  }

  loadSource(source: string) {
    this.source = source;
  }

  off(name: string, handler: HlsHandler) {
    this.handlers.get(name)?.delete(handler);
  }

  on(name: string, handler: HlsHandler) {
    const handlers = this.handlers.get(name) ?? new Set<HlsHandler>();
    handlers.add(handler);
    this.handlers.set(name, handlers);
  }
}

function transpile(path: string) {
  return ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
  }).outputText;
}

function videoPlayerHarness() {
  const slots: unknown[] = [];
  const effectSlots = new Map<number, { cleanup: Cleanup; dependencies: readonly unknown[] | undefined }>();
  let cursor = 0;
  const pendingEffects: Array<{ effect: Effect; index: number; dependencies: readonly unknown[] | undefined }> = [];
  const video = new FakeVideo();
  const transport = { bufferedEnd: 20, currentTime: 7, duration: 90, playing: true };
  const resetCalls: string[] = [];

  const playerStore = {
    get bufferedEnd() { return transport.bufferedEnd; },
    get currentTime() { return transport.currentTime; },
    frameRate: 24,
    get playing() { return transport.playing; },
    muted: false,
    playbackRate: 1,
    seekStepSeconds: 5,
    volume: 1,
    setBufferedEnd(value: number) { transport.bufferedEnd = value; resetCalls.push(`buffered:${value}`); },
    setCurrentTime(value: number) { transport.currentTime = value; resetCalls.push(`time:${value}`); },
    setDuration(value: number) { transport.duration = value; resetCalls.push(`duration:${value}`); },
    setMuted() {},
    setPlaybackRate() {},
    setPlaying(value: boolean) { transport.playing = value; resetCalls.push(`playing:${value}`); },
    toggleMute() {},
  };
  const usePlayerStore = () => playerStore;
  Object.assign(usePlayerStore, { getState: () => playerStore });

  const hooks = {
    useCallback<T>(callback: T) {
      cursor += 1;
      return callback;
    },
    useEffect(effect: Effect, dependencies?: readonly unknown[]) {
      const index = cursor++;
      const previous = effectSlots.get(index);
      if (!previous || !sameDependencies(previous.dependencies, dependencies)) {
        pendingEffects.push({ effect, index, dependencies });
      }
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: T };
    },
  };

  function imports(specifier: string): unknown {
    if (specifier === "react") return hooks;
    if (specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "hls.js") return FakeHls;
    if (specifier === "@/lib/stores/playerStore") return { usePlayerStore };
    if (specifier === "@/lib/review/player-policy") return {
      normalizeReviewShortcutKey: (key: string) => key,
      projectPointIntoMedia: () => null,
      shouldIgnoreReviewShortcut: () => true,
    };
    if (specifier === "@/lib/review/frame-review") return {
      nextShuttleRate: (rate: number) => rate,
      stepFrames: (time: number) => time,
    };
    throw new Error(`Unexpected VideoPlayer import ${specifier}`);
  }

  const moduleRecord = { exports: {} as Record<string, unknown> };
  runInNewContext(
    `(function(require,module,exports){${transpile(resolve(repositoryRoot, "components/player/VideoPlayer.tsx"))}\n})`,
    {
      document: { fullscreenElement: null, exitFullscreen() {} },
      window: { addEventListener() {}, removeEventListener() {} },
    },
  )(imports, moduleRecord, moduleRecord.exports);
  const VideoPlayer = (moduleRecord.exports as { default: (props: Record<string, unknown>) => Element }).default;

  function commitEffects() {
    const effects = pendingEffects.splice(0);
    for (const pending of effects) {
      effectSlots.get(pending.index)?.cleanup?.();
      effectSlots.set(pending.index, {
        cleanup: pending.effect(),
        dependencies: pending.dependencies,
      });
    }
  }

  function render(src: string, onPlaybackError: () => void) {
    cursor = 0;
    VideoPlayer({ src, videoRef: { current: video }, onPlaybackError });
    commitEffects();
  }

  return {
    hlsInstances: () => [...FakeHls.instances],
    resetCalls,
    render,
    transport: () => ({ ...transport }),
    unmount() {
      for (const effect of effectSlots.values()) effect.cleanup?.();
      effectSlots.clear();
    },
    video,
  };
}

function reviewMediaSurfaceHarness() {
  const state: unknown[] = [];
  let cursor = 0;
  const hooks = {
    useCallback<T>(callback: T) {
      cursor += 1;
      return callback;
    },
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (value: unknown) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      }];
    },
  };
  function MockLayers3() {
    return React.createElement("svg");
  }
  function MockPlayerControls() {
    return React.createElement("player-controls");
  }
  const moduleRecord = { exports: {} as Record<string, unknown> };
  function imports(specifier: string): unknown {
    if (specifier === "react") return hooks;
    if (specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") return { Layers3: MockLayers3 };
    if (specifier === "@/components/player/VideoPlayer") return "video-player";
    if (specifier === "@/components/player/PlayerControls") return MockPlayerControls;
    throw new Error(`Unexpected ReviewMediaSurface import ${specifier}`);
  }
  runInNewContext(
    `(function(require,module,exports){${transpile(resolve(repositoryRoot, "components/review/ReviewMediaSurface.tsx"))}\n})`,
    {},
  )(imports, moduleRecord, moduleRecord.exports);
  const ReviewMediaSurface = (moduleRecord.exports as { default: (props: Record<string, unknown>) => Element }).default;
  function render(assetUrl: string, fallbackAction?: React.ReactNode) {
    cursor = 0;
    return ReviewMediaSurface({
      assetTitle: "Review master",
      assetType: "video",
      assetUrl,
      fallbackAction,
      overlay: null,
      pinMode: false,
      videoRef: { current: null },
    });
  }
  return { render };
}

test("VideoPlayer reports a native failure once, clears transport, and rebinds for a new source", () => {
  FakeHls.instances = [];
  FakeHls.supported = false;
  const app = videoPlayerHarness();
  let failures = 0;
  const onPlaybackError = () => { failures += 1; };

  app.render("/media/first.mp4", onPlaybackError);
  app.video.emit("error");
  assert.equal(failures, 1);
  assert.deepEqual(app.transport(), {
    bufferedEnd: 0,
    currentTime: 0,
    duration: 0,
    playing: false,
  });
  app.video.emit("error");
  assert.equal(failures, 1, "the same native source reports only one terminal failure");

  app.render("/media/second.mp4", onPlaybackError);
  app.video.emit("error");
  assert.equal(failures, 2, "a replacement source receives its own error listener");
  app.unmount();
  app.video.emit("error");
  assert.equal(failures, 2, "cleanup detaches the native error listener");
});

test("VideoPlayer reports fatal HLS failures and ignores a stale transport after cleanup", () => {
  FakeHls.instances = [];
  FakeHls.supported = true;
  const app = videoPlayerHarness();
  let failures = 0;
  const onPlaybackError = () => { failures += 1; };

  app.render("/media/review.m3u8", onPlaybackError);
  const hls = app.hlsInstances()[0];
  assert.ok(hls, "the HLS source attaches a real HLS transport");
  hls.emit(FakeHls.Events.ERROR, { fatal: false });
  assert.equal(failures, 0, "recoverable HLS notices do not replace the player");
  hls.emit(FakeHls.Events.ERROR, { fatal: true });
  assert.equal(failures, 1, "a fatal HLS error reaches the recovery surface");

  app.render("/media/replacement.mp4", onPlaybackError);
  assert.equal(hls.destroyed, 1, "source replacement destroys the old HLS transport");
  hls.emit(FakeHls.Events.ERROR, { fatal: true });
  assert.equal(failures, 1, "a stale HLS transport cannot fail the replacement source");
});

test("ReviewMediaSurface exposes retry after playback failure and only renders an approved fallback", () => {
  const fallback = React.createElement("a", { download: true, href: "/api/review/media/allowed" }, "Download file");
  const app = reviewMediaSurfaceHarness();
  const initial = app.render("/media/first.mp4", fallback);
  const firstPlayer = allElements(initial).find((element) => element.type === "video-player");
  assert.ok(firstPlayer, "the healthy video surface mounts the real player boundary");
  assert.equal(typeof firstPlayer.props.onPlaybackError, "function", "the player can report a terminal playback failure");
  firstPlayer.props.onPlaybackError();

  const failed = app.render("/media/first.mp4", fallback);
  assert.equal(allElements(failed).some((element) => element.props.role === "alert"), true);
  assert.equal(allElements(failed).some((element) => element.type === "a"), true, "an allowed fallback remains available");
  const retry = allElements(failed).find((element) => element.props["aria-label"] === "Retry playback");
  assert.ok(retry, "the failed player offers an explicit retry");
  retry.props.onClick();
  const retried = app.render("/media/first.mp4", fallback);
  const retriedPlayer = allElements(retried).find((element) => element.type === "video-player");
  assert.ok(retriedPlayer, "retry remounts the player instead of leaving a blank frame");
  assert.notEqual(firstPlayer.key, retriedPlayer.key, "retry starts a new media transport instance");

  retriedPlayer.props.onPlaybackError();
  const switched = app.render("/media/second.mp4");
  assert.equal(allElements(switched).some((element) => element.props.role === "alert"), false, "a new version source clears the prior failure");
  assert.equal(allElements(switched).some((element) => element.type === "a"), false, "no download link is invented when the caller did not authorize one");
});
