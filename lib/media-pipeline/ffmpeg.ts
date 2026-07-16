/* eslint-disable @typescript-eslint/ban-ts-comment */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { MediaPipelineError } from "./errors.ts";
import type { MediaProbe } from "./types.ts";

export interface MediaProcessorCallbacks {
  shouldCancel: () => Promise<boolean>;
  onProgress: (ratio: number) => Promise<void>;
}

export interface CaptionExtraction {
  path: string | null;
  status: "extracted" | "pending_transcription";
  detail: string;
}

export interface MediaProcessor {
  probe(inputPath: string, callbacks: Pick<MediaProcessorCallbacks, "shouldCancel">): Promise<MediaProbe>;
  transcodeHls(
    inputPath: string,
    outputDirectory: string,
    probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<string>;
  generateThumbnail(
    inputPath: string,
    outputPath: string,
    probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<string | null>;
  generateWaveform(
    inputPath: string,
    outputPath: string,
    probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<string | null>;
  extractCaptions(
    inputPath: string,
    outputPath: string,
    probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<CaptionExtraction>;
}

export interface LocalMediaProcessorOptions {
  ffmpegPath: string;
  ffprobePath: string;
  timeoutMs: number;
}

interface CommandOptions {
  timeoutMs: number;
  shouldCancel: () => Promise<boolean>;
  onProgress?: (seconds: number) => Promise<void>;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number | string;
  height?: number | string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
}

interface FfprobePayload {
  streams?: FfprobeStream[];
  format?: {
    duration?: string;
    format_name?: string;
  };
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null;
  const [numerator, denominator] = value.split("/", 2);
  const top = Number(numerator);
  const bottom = denominator === undefined ? 1 : Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) return null;
  const result = top / bottom;
  return Number.isFinite(result) && result > 0 ? result : null;
}

function progressSeconds(chunk: string): number | null {
  const match = chunk.match(/^out_time_(?:us|ms)=(\d+)$/m);
  if (!match) return null;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw)) return null;
  // FFmpeg's historical out_time_ms value is microseconds despite its label.
  return raw / 1_000_000;
}

function commandFailure(
  command: string,
  code: number | null,
  stderr: string
): MediaPipelineError {
  if (code === null) {
    return new MediaPipelineError(
      "PIPELINE_FFMPEG_UNAVAILABLE",
      "Media processor could not start: " + command
    );
  }
  const detail = stderr.split(/\r?\n/).filter(Boolean).slice(-3).join(" ").slice(0, 600);
  return new MediaPipelineError(
    "PIPELINE_FFMPEG_FAILED",
    detail ? "Media processor failed: " + detail : "Media processor failed with exit code " + code
  );
}

async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions
): Promise<{ stdout: string; stderr: string }> {
  if (await options.shouldCancel()) {
    throw new MediaPipelineError("PIPELINE_CANCELLED", "Media processing was cancelled");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let cancelled = false;
    let timedOut = false;
    let stopping = false;
    let checkingCancellation = false;
    let forceStop: NodeJS.Timeout | null = null;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(cancelPoll);
      if (forceStop) clearTimeout(forceStop);
      callback();
    };

    const stop = (reason: "cancelled" | "timeout") => {
      if (stopping || settled) return;
      stopping = true;
      if (reason === "cancelled") cancelled = true;
      if (reason === "timeout") timedOut = true;
      child.kill("SIGTERM");
      forceStop = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 2_000);
      forceStop.unref();
    };

    const timeout = setTimeout(() => stop("timeout"), options.timeoutMs);
    const cancelPoll = setInterval(() => {
      if (checkingCancellation || settled) return;
      checkingCancellation = true;
      options
        .shouldCancel()
        .then((requested) => {
          if (requested) stop("cancelled");
        })
        .catch(() => stop("cancelled"))
        .finally(() => {
          checkingCancellation = false;
        });
    }, 400);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      const seconds = progressSeconds(text);
      if (seconds !== null && options.onProgress) {
        void options.onProgress(seconds);
      }
    });
    child.once("error", (error) => {
      finish(() => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(
            new MediaPipelineError(
              "PIPELINE_FFMPEG_UNAVAILABLE",
              "Media processor executable is unavailable: " + command
            )
          );
          return;
        }
        reject(new MediaPipelineError("PIPELINE_FFMPEG_FAILED", "Media processor failed to start", true));
      });
    });
    child.once("close", (code) => {
      finish(() => {
        if (cancelled) {
          reject(new MediaPipelineError("PIPELINE_CANCELLED", "Media processing was cancelled"));
          return;
        }
        if (timedOut) {
          reject(
            new MediaPipelineError(
              "PIPELINE_TIMEOUT",
              "Media processor exceeded its configured time limit",
              true
            )
          );
          return;
        }
        if (code !== 0) {
          reject(commandFailure(command, code, stderr));
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  });
}

export class LocalMediaProcessor implements MediaProcessor {
  private readonly options: LocalMediaProcessorOptions;

  constructor(options: LocalMediaProcessorOptions) {
    this.options = options;
  }

  async probe(
    inputPath: string,
    callbacks: Pick<MediaProcessorCallbacks, "shouldCancel">
  ): Promise<MediaProbe> {
    const result = await runCommand(
      this.options.ffprobePath,
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        inputPath,
      ],
      {
        timeoutMs: this.options.timeoutMs,
        shouldCancel: callbacks.shouldCancel,
      }
    );
    let payload: FfprobePayload;
    try {
      payload = JSON.parse(result.stdout) as FfprobePayload;
    } catch {
      throw new MediaPipelineError("PIPELINE_UNSUPPORTED_MEDIA", "Media probe returned invalid data");
    }

    const streams = payload.streams ?? [];
    const video = streams.find((stream) => stream.codec_type === "video");
    const audio = streams.find((stream) => stream.codec_type === "audio");
    const subtitle = streams.find((stream) => stream.codec_type === "subtitle");
    const duration = numeric(payload.format?.duration) ?? 0;
    return {
      durationSeconds: Math.max(0, duration),
      width: numeric(video?.width),
      height: numeric(video?.height),
      frameRate: parseFrameRate(video?.avg_frame_rate ?? video?.r_frame_rate),
      videoCodec: video?.codec_name ?? null,
      audioCodec: audio?.codec_name ?? null,
      hasVideo: Boolean(video),
      hasAudio: Boolean(audio),
      hasSubtitle: Boolean(subtitle),
      formatName: payload.format?.format_name ?? null,
    };
  }

  async transcodeHls(
    inputPath: string,
    outputDirectory: string,
    probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<string> {
    await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    const playlistPath = join(outputDirectory, "playlist.m3u8");
    const segmentPath = join(outputDirectory, "segment_%05d.ts");
    const args = [
      "-nostdin",
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0?",
      "-map",
      "0:a:0?",
    ];

    if (probe.hasVideo) {
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p"
      );
    } else {
      args.push("-vn");
    }

    if (probe.hasAudio) {
      args.push("-c:a", "aac", "-b:a", "128k");
    } else {
      args.push("-an");
    }

    args.push(
      "-f",
      "hls",
      "-hls_time",
      "4",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      segmentPath,
      "-progress",
      "pipe:2",
      "-nostats",
      playlistPath
    );
    await runCommand(this.options.ffmpegPath, args, {
      timeoutMs: this.options.timeoutMs,
      shouldCancel: callbacks.shouldCancel,
      onProgress: async (seconds) => {
        const ratio = probe.durationSeconds > 0 ? Math.min(1, seconds / probe.durationSeconds) : 0;
        await callbacks.onProgress(ratio);
      },
    });
    return playlistPath;
  }

  async generateThumbnail(
    inputPath: string,
    outputPath: string,
    probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<string | null> {
    if (!probe.hasVideo) return null;
    const offset = Math.max(0, Math.min(2, probe.durationSeconds * 0.1));
    await runCommand(
      this.options.ffmpegPath,
      [
        "-nostdin",
        "-y",
        "-ss",
        offset.toFixed(3),
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        outputPath,
      ],
      {
        timeoutMs: this.options.timeoutMs,
        shouldCancel: callbacks.shouldCancel,
      }
    );
    return outputPath;
  }

  async generateWaveform(
    inputPath: string,
    outputPath: string,
    probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<string | null> {
    if (!probe.hasAudio) return null;
    await runCommand(
      this.options.ffmpegPath,
      [
        "-nostdin",
        "-y",
        "-i",
        inputPath,
        "-filter_complex",
        "aformat=channel_layouts=mono,showwavespic=s=1200x220:colors=0x2563eb",
        "-frames:v",
        "1",
        outputPath,
      ],
      {
        timeoutMs: this.options.timeoutMs,
        shouldCancel: callbacks.shouldCancel,
      }
    );
    return outputPath;
  }

  async extractCaptions(
    inputPath: string,
    outputPath: string,
    probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<CaptionExtraction> {
    if (!probe.hasSubtitle) {
      return {
        path: null,
        status: "pending_transcription",
        detail: "No embedded subtitle stream was found",
      };
    }
    try {
      await runCommand(
        this.options.ffmpegPath,
        [
          "-nostdin",
          "-y",
          "-i",
          inputPath,
          "-map",
          "0:s:0",
          "-c:s",
          "webvtt",
          outputPath,
        ],
        {
          timeoutMs: this.options.timeoutMs,
          shouldCancel: callbacks.shouldCancel,
        }
      );
      return {
        path: outputPath,
        status: "extracted",
        detail: "First embedded subtitle stream extracted as WebVTT",
      };
    } catch (error) {
      if (error instanceof MediaPipelineError && error.code === "PIPELINE_CANCELLED") throw error;
      return {
        path: null,
        status: "pending_transcription",
        detail: "Embedded subtitle extraction was unavailable",
      };
    }
  }
}
