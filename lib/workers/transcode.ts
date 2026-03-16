/**
 * FFmpeg Transcode Worker
 *
 * Processes uploaded media files into web-playable formats:
 * - Video → HLS segments (H.264 via VideoToolbox) + thumbnail strip + waveform
 * - Audio → waveform PNG + metadata extraction
 * - Image → thumbnail generation
 *
 * Outputs go to NAS proxy/thumbnail directories.
 * Asset and transcode_job records are updated on completion.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import {
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
} from "fs";
import { join, basename, extname } from "path";
import { getSupabase } from "@/lib/supabase";
import type { TranscodeJob } from "./queue";
import { completeJob, failJob } from "./queue";

const execFileAsync = promisify(execFile);

const MEDIA_ROOT = process.env.NAS_MEDIA_ROOT || "/volume1/media";
const PROXY_ROOT = join(MEDIA_ROOT, "proxies");
const THUMB_ROOT = join(MEDIA_ROOT, "thumbnails");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

// Ensure output directories exist
[PROXY_ROOT, THUMB_ROOT].forEach((dir) => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  codec: string;
  fps: number;
  hasAudio: boolean;
}

/**
 * Probe a media file with ffprobe to extract metadata.
 */
async function probeFile(inputPath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    inputPath,
  ], { timeout: 30000 });

  const info = JSON.parse(stdout);
  const videoStream = info.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "video"
  );
  const audioStream = info.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "audio"
  );

  const fps = videoStream?.r_frame_rate
    ? eval(videoStream.r_frame_rate) // "30000/1001" → 29.97
    : 0;

  return {
    duration: parseFloat(info.format?.duration || "0"),
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    codec: videoStream?.codec_name || audioStream?.codec_name || "unknown",
    fps: typeof fps === "number" ? fps : 0,
    hasAudio: !!audioStream,
  };
}

/**
 * Generate HLS output from a video file using FFmpeg.
 * Uses VideoToolbox for hardware-accelerated H.264 encoding on Apple Silicon.
 */
async function transcodeToHLS(
  inputPath: string,
  outputDir: string,
  probe: ProbeResult
): Promise<string> {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const playlistPath = join(outputDir, "playlist.m3u8");

  // Determine target resolution (cap at 1080p for proxy)
  const scale =
    probe.height > 1080
      ? "-vf scale=-2:1080"
      : "";

  const args = [
    "-i", inputPath,
    "-codec:v", "h264_videotoolbox",   // Apple Silicon HW encoder
    "-b:v", "4000k",                   // Reasonable bitrate for review proxy
    "-codec:a", "aac",
    "-b:a", "128k",
    "-ac", "2",
    ...(scale ? scale.split(" ") : []),
    "-f", "hls",
    "-hls_time", "6",                  // 6-second segments
    "-hls_list_size", "0",             // Keep all segments in playlist
    "-hls_segment_filename", join(outputDir, "seg_%04d.ts"),
    "-hls_playlist_type", "vod",
    playlistPath,
  ];

  try {
    await execFileAsync(FFMPEG, args, {
      timeout: 600000, // 10 minutes max
    });
  } catch (err) {
    // Fallback to software encoding if VideoToolbox isn't available
    console.warn("[transcode] HW encode failed, falling back to libx264");
    const swArgs = args.map((a) =>
      a === "h264_videotoolbox" ? "libx264" : a
    );
    // Add preset for reasonable speed
    const presetIdx = swArgs.indexOf("-codec:v") + 2;
    swArgs.splice(presetIdx, 0, "-preset", "fast");
    await execFileAsync(FFMPEG, swArgs, { timeout: 1200000 });
  }

  return playlistPath;
}

/**
 * Generate a thumbnail sprite sheet (timeline thumbnails) from a video.
 * Creates thumbnails at regular intervals for timeline scrubbing.
 */
async function generateThumbnails(
  inputPath: string,
  outputDir: string,
  duration: number
): Promise<string> {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  // Generate one thumbnail per 5 seconds (or at least 10 thumbnails)
  const interval = Math.max(1, Math.min(5, duration / 20));
  const posterPath = join(outputDir, "poster.jpg");
  const stripPath = join(outputDir, "strip_%04d.jpg");

  // Poster: frame at 10% into the video
  const posterTime = Math.min(duration * 0.1, 10);
  await execFileAsync(FFMPEG, [
    "-ss", String(posterTime),
    "-i", inputPath,
    "-vframes", "1",
    "-vf", "scale=640:-2",
    "-q:v", "3",
    "-y",
    posterPath,
  ], { timeout: 30000 });

  // Thumbnail strip for timeline scrubbing
  await execFileAsync(FFMPEG, [
    "-i", inputPath,
    "-vf", `fps=1/${interval},scale=160:-2`,
    "-q:v", "5",
    "-y",
    stripPath,
  ], { timeout: 120000 });

  return posterPath;
}

/**
 * Generate a waveform PNG from audio/video file.
 */
async function generateWaveform(
  inputPath: string,
  outputPath: string
): Promise<string> {
  await execFileAsync(FFMPEG, [
    "-i", inputPath,
    "-filter_complex", "showwavespic=s=1200x120:colors=#6366f1",
    "-frames:v", "1",
    "-y",
    outputPath,
  ], { timeout: 60000 });
  return outputPath;
}

/**
 * Process a single transcode job.
 */
export async function processJob(job: TranscodeJob): Promise<void> {
  const inputPath = join(MEDIA_ROOT, job.input_path);

  if (!existsSync(inputPath)) {
    await failJob(job.id, `Input file not found: ${job.input_path}`);
    await updateAssetStatus(job.asset_id, "failed");
    return;
  }

  try {
    // 1. Probe the file
    const probe = await probeFile(inputPath);
    const assetSlug = job.asset_id.slice(0, 8);
    const isVideo = probe.width > 0 && probe.height > 0;
    const isAudio = !isVideo && probe.duration > 0;

    let hlsPath: string | undefined;
    let thumbnailPath: string | undefined;
    let waveformPath: string | undefined;

    if (isVideo) {
      // 2a. Transcode video to HLS
      const hlsDir = join(PROXY_ROOT, assetSlug);
      const playlistFile = await transcodeToHLS(inputPath, hlsDir, probe);
      hlsPath = `proxies/${assetSlug}/playlist.m3u8`;

      // 2b. Generate thumbnails
      const thumbDir = join(THUMB_ROOT, assetSlug);
      const posterFile = await generateThumbnails(
        inputPath,
        thumbDir,
        probe.duration
      );
      thumbnailPath = `thumbnails/${assetSlug}/poster.jpg`;

      // 2c. Generate waveform if has audio
      if (probe.hasAudio) {
        const waveFile = join(THUMB_ROOT, assetSlug, "waveform.png");
        await generateWaveform(inputPath, waveFile);
        waveformPath = `thumbnails/${assetSlug}/waveform.png`;
      }
    } else if (isAudio) {
      // Audio only — generate waveform
      const waveDir = join(THUMB_ROOT, assetSlug);
      if (!existsSync(waveDir)) mkdirSync(waveDir, { recursive: true });
      const waveFile = join(waveDir, "waveform.png");
      await generateWaveform(inputPath, waveFile);
      waveformPath = `thumbnails/${assetSlug}/waveform.png`;
    }

    // 3. Mark job complete
    await completeJob(job.id, {
      hlsPath,
      thumbnailPath,
      waveformPath,
      duration: probe.duration,
      resolution: isVideo ? `${probe.width}x${probe.height}` : undefined,
      codec: probe.codec,
      fps: probe.fps || undefined,
    });

    // 4. Update asset record with proxy info
    const updates: Record<string, unknown> = {
      status: "ready",
      duration_seconds: probe.duration || null,
      updated_at: new Date().toISOString(),
      metadata: {
        resolution: isVideo ? `${probe.width}x${probe.height}` : null,
        codec: probe.codec,
        fps: probe.fps || null,
        has_audio: probe.hasAudio,
        transcode_job_id: job.id,
      },
    };

    if (hlsPath) {
      updates.proxy_url = `/api/media/stream?path=${encodeURIComponent(hlsPath)}`;
    }
    if (thumbnailPath) {
      updates.thumbnail_url = `/api/media/stream?path=${encodeURIComponent(thumbnailPath)}`;
    }

    await getSupabase()
      .from("assets")
      .update(updates)
      .eq("id", job.asset_id);

    console.log(
      `[transcode] Job ${job.id} complete: ${isVideo ? "video" : isAudio ? "audio" : "other"} ` +
        `(${probe.duration.toFixed(1)}s, ${probe.codec})`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown transcode error";
    console.error(`[transcode] Job ${job.id} failed:`, msg);
    await failJob(job.id, msg);
    await updateAssetStatus(job.asset_id, "failed");
  }
}

async function updateAssetStatus(
  assetId: string,
  status: string
): Promise<void> {
  await getSupabase()
    .from("assets")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", assetId);
}
