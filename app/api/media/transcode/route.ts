/**
 * Legacy transcode API.
 *
 * User requests may enqueue or inspect authorized asset jobs. The dedicated
 * media worker token is the only authority allowed to claim and process work.
 */

import { timingSafeEqual } from "node:crypto";

import { NextRequest } from "next/server";
import { apiJson } from "@/lib/api/responses";

import { getAssetAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import {
  claimNextJob,
  enqueueTranscode,
  type TranscodeJob,
} from "@/lib/workers/queue";
import { processJob } from "@/lib/workers/transcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JSON_BODY_BYTES = 8 * 1024;
const MAX_MEDIA_PATH_BYTES = 4_096;
const MAX_MEDIA_PATH_SEGMENT_BYTES = 255;
const MAX_WORKER_TOKEN_BYTES = 512;
const WORKER_TOKEN_HEADER = "x-codeliver-media-worker-token";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/;
const SAFE_JOB_SELECTION =
  "id, asset_id, version_id, status, duration_seconds, resolution, codec, fps, started_at, completed_at, created_at";

type SafeTranscodeJob = Pick<
  TranscodeJob,
  | "id"
  | "asset_id"
  | "version_id"
  | "status"
  | "duration_seconds"
  | "resolution"
  | "codec"
  | "fps"
  | "started_at"
  | "completed_at"
  | "created_at"
>;

class JsonRequestError extends Error {
  constructor(readonly status: 400 | 413 | 415) {
    super("Invalid JSON request");
  }
}

function json(body: Record<string, unknown>, status = 200) {
  const normalized = "error" in body && typeof body.error === "string" && !("code" in body)
    ? { ...body, code: status >= 500 ? "BACKEND_UNAVAILABLE" : status === 401 ? "UNAUTHORIZED" : "INVALID_REQUEST" }
    : body;
  return apiJson(normalized, {
    status,
    headers: {
      "X-Content-Type-Options": "nosniff",
      Vary: `Cookie, Authorization, ${WORKER_TOKEN_HEADER}`,
    },
  });
}

function accessFailure(status: number) {
  return status >= 500
    ? json({ error: "Transcode request is unavailable" }, 503)
    : json({ error: "Transcode resource not found" }, 404);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function safeJob(job: SafeTranscodeJob): SafeTranscodeJob {
  return {
    id: job.id,
    asset_id: job.asset_id,
    version_id: job.version_id,
    status: job.status,
    duration_seconds: job.duration_seconds,
    resolution: job.resolution,
    codec: job.codec,
    fps: job.fps,
    started_at: job.started_at,
    completed_at: job.completed_at,
    created_at: job.created_at,
  };
}

function authorizedWorker(req: NextRequest): boolean {
  const expected = process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
  const supplied = req.headers.get(WORKER_TOKEN_HEADER);
  if (
    !expected ||
    !supplied ||
    expected.length > MAX_WORKER_TOKEN_BYTES ||
    supplied.length > MAX_WORKER_TOKEN_BYTES
  ) {
    return false;
  }

  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

async function readJsonObject(req: NextRequest): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType?.toLowerCase() !== "application/json") {
    throw new JsonRequestError(415);
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new JsonRequestError(400);
    const declaredLength = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength > MAX_JSON_BODY_BYTES
    ) {
      throw new JsonRequestError(413);
    }
  }

  if (!req.body) throw new JsonRequestError(400);
  const reader = req.body.getReader();
  const bytes = new Uint8Array(MAX_JSON_BODY_BYTES);
  let offset = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new JsonRequestError(413);
      }
      bytes.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, offset)));
  } catch {
    throw new JsonRequestError(400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new JsonRequestError(400);
  }
  return parsed as Record<string, unknown>;
}

function normalizeStoredInputPath(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_MEDIA_PATH_BYTES ||
    value.startsWith("/") ||
    CONTROL_OR_BACKSLASH.test(value)
  ) {
    return null;
  }

  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.length > MAX_MEDIA_PATH_SEGMENT_BYTES
    )
  ) {
    return null;
  }
  return segments.join("/");
}

function storedStreamPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(value, "https://legacy-media.invalid");
    const paths = url.searchParams.getAll("path");
    if (url.pathname !== "/api/media/stream" || paths.length !== 1) return null;
    return normalizeStoredInputPath(paths[0]);
  } catch {
    return null;
  }
}

function assetInputPath(asset: { nas_path: unknown; file_url: unknown }): string | null {
  const nasPath = normalizeStoredInputPath(asset.nas_path);
  const streamPath = storedStreamPath(asset.file_url);
  if (nasPath && streamPath && nasPath !== streamPath) return null;
  return nasPath ?? streamPath;
}

async function processNextJob(req: NextRequest) {
  if (!authorizedWorker(req)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const job = await claimNextJob();
    if (!job) return json({ job: null });

    void processJob(job).catch(() => {
      console.error("[legacy-transcode] Worker processing failed");
    });
    return json({ job: safeJob(job) });
  } catch {
    return json({ error: "Transcode worker is unavailable" }, 503);
  }
}

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  if (action === "process") return processNextJob(req);
  if (action !== null) return json({ error: "Invalid request" }, 400);

  let user;
  try {
    user = await requireAuth();
  } catch {
    return json({ error: "Transcode request is unavailable" }, 503);
  }
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req);
  } catch (error) {
    const status = error instanceof JsonRequestError ? error.status : 400;
    const message =
      status === 413
        ? "Request body is too large"
        : status === 415
          ? "JSON request required"
          : "Invalid request";
    return json({ error: message }, status);
  }

  if (
    !isUuid(body.assetId) ||
    (body.versionId !== undefined && !isUuid(body.versionId)) ||
    (body.inputPath !== undefined && typeof body.inputPath !== "string")
  ) {
    return json({ error: "Invalid request" }, 400);
  }

  let assetAccess;
  try {
    assetAccess = await getAssetAccess(body.assetId, user.id, "editor");
  } catch {
    return json({ error: "Transcode request is unavailable" }, 503);
  }
  if (!assetAccess.ok) return accessFailure(assetAccess.status);

  try {
    const supabase = getSupabase();
    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select("id, project_id, nas_path, file_url")
      .eq("id", assetAccess.data.id)
      .eq("project_id", assetAccess.data.project_id)
      .maybeSingle();
    if (assetError) {
      return json({ error: "Transcode request is unavailable" }, 503);
    }
    if (!asset) return json({ error: "Transcode resource not found" }, 404);

    let inputPath = assetInputPath(asset);
    let versionId: string | undefined;
    if (body.versionId !== undefined) {
      const { data: version, error: versionError } = await supabase
        .from("versions")
        .select("id, asset_id, file_url")
        .eq("id", body.versionId)
        .eq("asset_id", asset.id)
        .maybeSingle();
      if (versionError) {
        return json({ error: "Transcode request is unavailable" }, 503);
      }
      if (!version || version.asset_id !== asset.id) {
        return json({ error: "Transcode resource not found" }, 404);
      }

      const versionPath = storedStreamPath(version.file_url);
      if (versionPath) {
        inputPath = versionPath;
      } else if (version.file_url !== asset.file_url) {
        inputPath = null;
      }
      versionId = version.id;
    }

    if (!inputPath) {
      return json({ error: "Asset source is unavailable" }, 409);
    }

    const job = await enqueueTranscode({
      assetId: asset.id,
      versionId,
      inputPath,
    });
    if (!job || job.asset_id !== asset.id) {
      return json({ error: "Transcode request is unavailable" }, 503);
    }

    return json({ job: safeJob(job) }, 202);
  } catch {
    return json({ error: "Transcode request is unavailable" }, 503);
  }
}

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return json({ error: "Transcode request is unavailable" }, 503);
  }
  if (!user) return json({ error: "Unauthorized" }, 401);

  const assetId = req.nextUrl.searchParams.get("assetId");
  const jobId = req.nextUrl.searchParams.get("jobId");
  if ((assetId === null) === (jobId === null)) {
    return json({ error: "Invalid request" }, 400);
  }
  if ((assetId !== null && !isUuid(assetId)) || (jobId !== null && !isUuid(jobId))) {
    return json({ error: "Invalid request" }, 400);
  }

  try {
    const supabase = getSupabase();
    if (jobId) {
      const { data: job, error } = await supabase
        .from("transcode_jobs")
        .select(SAFE_JOB_SELECTION)
        .eq("id", jobId)
        .maybeSingle();
      if (error) return json({ error: "Transcode request is unavailable" }, 503);
      if (!job) return json({ error: "Transcode resource not found" }, 404);

      const access = await getAssetAccess(job.asset_id, user.id, "viewer");
      if (!access.ok) return accessFailure(access.status);
      return json({ job: safeJob(job as SafeTranscodeJob) });
    }

    const access = await getAssetAccess(assetId!, user.id, "viewer");
    if (!access.ok) return accessFailure(access.status);
    const { data: job, error } = await supabase
      .from("transcode_jobs")
      .select(SAFE_JOB_SELECTION)
      .eq("asset_id", access.data.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return json({ error: "Transcode request is unavailable" }, 503);
    return json({ job: job ? safeJob(job as SafeTranscodeJob) : null });
  } catch {
    return json({ error: "Transcode request is unavailable" }, 503);
  }
}
