const STAFF_HLS_PLAYLIST_PATH =
  /^\/api\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/versions\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/hls\/playlist\.m3u8$/i;

export function isStaffHlsPlaylistUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return STAFF_HLS_PLAYLIST_PATH.test(value.split(/[?#]/, 1)[0] ?? "");
}

export function staffHlsPlaylistUrl(assetId: string, versionId: string): string {
  return `/api/assets/${assetId}/versions/${versionId}/hls/playlist.m3u8`;
}

export function viewerHlsPlaylistUrl(versionId: string): string {
  return `/api/media/versions/${versionId}/hls/playlist.m3u8`;
}

export function reviewHlsPlaylistUrl(admissionId: string): string {
  return `/api/review/media/${admissionId}/hls/playlist.m3u8`;
}

export function reviewMediaUrl(admissionId: string): string {
  return `/api/review/media/${admissionId}`;
}

/**
 * Staff sessions may receive the staff HLS ladder. Client and guest sessions
 * never do: an admitted review plays the public review rung, and a signed-in
 * client plays the viewer HLS rung authorized by asset access.
 */
export function projectPlaybackFileUrl(input: {
  audience: "staff" | "client";
  published: boolean;
  assetId: string;
  versionId: string;
  storedFileUrl: string | null;
  admissionId?: string | null;
}): string | null {
  if (input.admissionId) {
    return input.published
      ? reviewHlsPlaylistUrl(input.admissionId)
      : reviewMediaUrl(input.admissionId);
  }

  if (input.published) {
    return input.audience === "staff"
      ? staffHlsPlaylistUrl(input.assetId, input.versionId)
      : viewerHlsPlaylistUrl(input.versionId);
  }

  if (input.audience !== "staff" && isStaffHlsPlaylistUrl(input.storedFileUrl)) {
    return `/api/media/versions/${input.versionId}`;
  }

  return input.storedFileUrl;
}

/** Guest review must not keep a staff playlist even if a payload still has one. */
export function clientReviewFileUrl(
  fileUrl: string | null | undefined,
  admissionId: string | null | undefined,
): string | null {
  if (typeof fileUrl !== "string" || !fileUrl) return fileUrl ?? null;
  if (!isStaffHlsPlaylistUrl(fileUrl) || !admissionId) return fileUrl;
  return reviewHlsPlaylistUrl(admissionId);
}
