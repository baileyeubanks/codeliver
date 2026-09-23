import assert from "node:assert/strict";
import test from "node:test";

import {
  clientReviewFileUrl,
  isStaffHlsPlaylistUrl,
  projectPlaybackFileUrl,
} from "../lib/media-pipeline/hls-playback-url.ts";

const assetId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const admissionId = "33333333-3333-4333-8333-333333333333";
const staffUrl = `/api/assets/${assetId}/versions/${versionId}/hls/playlist.m3u8`;
const viewerUrl = `/api/media/versions/${versionId}/hls/playlist.m3u8`;
const reviewUrl = `/api/review/media/${admissionId}/hls/playlist.m3u8`;

test("client and guest playback never receive a staff HLS playlist", () => {
  assert.equal(isStaffHlsPlaylistUrl(staffUrl), true);
  assert.equal(isStaffHlsPlaylistUrl(`${staffUrl}?download=1`), true);
  assert.equal(isStaffHlsPlaylistUrl(viewerUrl), false);

  assert.equal(
    projectPlaybackFileUrl({
      audience: "staff",
      published: true,
      assetId,
      versionId,
      storedFileUrl: "/api/media/versions/source",
    }),
    staffUrl,
  );
  assert.equal(
    projectPlaybackFileUrl({
      audience: "client",
      published: true,
      assetId,
      versionId,
      storedFileUrl: staffUrl,
    }),
    viewerUrl,
  );
  assert.equal(
    projectPlaybackFileUrl({
      audience: "client",
      published: true,
      assetId,
      versionId,
      storedFileUrl: "/api/media/versions/source",
      admissionId,
    }),
    reviewUrl,
  );
  assert.equal(
    projectPlaybackFileUrl({
      audience: "client",
      published: false,
      assetId,
      versionId,
      storedFileUrl: staffUrl,
      admissionId,
    }),
    `/api/review/media/${admissionId}`,
  );
  assert.equal(clientReviewFileUrl(staffUrl, admissionId), reviewUrl);
  assert.equal(clientReviewFileUrl(reviewUrl, admissionId), reviewUrl);
});
