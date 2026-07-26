import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

export const DEFAULT_MEDIA_ROOT = "/volume1/media";

const UPLOAD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveMediaRoot(value = process.env.NAS_MEDIA_ROOT): string {
  return resolve(
    /* turbopackIgnore: true */ value?.trim() || DEFAULT_MEDIA_ROOT
  );
}

export function requireConfiguredMediaRoot(
  value = process.env.NAS_MEDIA_ROOT
): string {
  const configured = value?.trim();
  if (!configured) {
    throw new Error("NAS_MEDIA_ROOT must be explicitly configured for media writes");
  }
  if (!isAbsolute(configured)) {
    throw new Error("NAS_MEDIA_ROOT must be an absolute path");
  }
  return resolve(/* turbopackIgnore: true */ configured);
}

export function uploadStagingDirectory(
  mediaRoot = resolveMediaRoot()
): string {
  return join(/* turbopackIgnore: true */ mediaRoot, ".tus-uploads");
}

export function ensureUploadStagingDirectory(
  mediaRoot = requireConfiguredMediaRoot()
): string {
  const directory = uploadStagingDirectory(mediaRoot);
  if (!existsSync(/* turbopackIgnore: true */ directory)) {
    mkdirSync(/* turbopackIgnore: true */ directory, { recursive: true });
  }
  return directory;
}

export function transcodeOutputDirectories(
  mediaRoot = resolveMediaRoot()
): { proxyRoot: string; thumbnailRoot: string } {
  return {
    proxyRoot: resolveMediaPath("proxies", mediaRoot),
    thumbnailRoot: resolveMediaPath("thumbnails", mediaRoot),
  };
}

export function ensureTranscodeOutputDirectories(
  mediaRoot = resolveMediaRoot()
): { proxyRoot: string; thumbnailRoot: string } {
  const directories = transcodeOutputDirectories(mediaRoot);
  for (const directory of Object.values(directories)) {
    if (!existsSync(/* turbopackIgnore: true */ directory)) {
      mkdirSync(/* turbopackIgnore: true */ directory, { recursive: true });
    }
  }
  return directories;
}

export function resolveMediaPath(
  relativePath: string,
  mediaRoot = resolveMediaRoot()
): string {
  if (!relativePath.trim() || isAbsolute(relativePath)) {
    throw new Error("Media path must be a non-empty relative path");
  }

  const root = resolve(/* turbopackIgnore: true */ mediaRoot);
  const target = resolve(/* turbopackIgnore: true */ root, relativePath);
  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error("Media path escapes the configured storage root");
  }
  return target;
}

export function isSafeUploadId(uploadId: string): boolean {
  return UPLOAD_ID_PATTERN.test(uploadId);
}
