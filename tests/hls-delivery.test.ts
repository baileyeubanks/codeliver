import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";

import {
  readAndRewritePublishedHlsPlaylist,
  selectPublishedHlsPublication,
} from "../lib/media-pipeline/hls-delivery.ts";

const assetId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const provider = "local";
const providerVersionId = `fs-v1:${"f".repeat(64)}`;
const originalObjectKeys = [
  "tenants/private/objects/playlist/playlist.m3u8",
  "tenants/private/objects/segment-a/segment000.ts",
  "tenants/private/objects/segment-b/segment001.ts",
];
const validPlaylist = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:6",
  "#EXT-X-MEDIA-SEQUENCE:0",
  "#EXT-X-PLAYLIST-TYPE:VOD",
  "#EXTINF:6.000000,",
  "segment000.ts",
  "#EXTINF:4.000000,",
  "segment001.ts",
  "#EXT-X-ENDLIST",
  "",
].join("\n");

function digest(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function artifact(
  kind: "hls_playlist" | "hls_segment" | "hls_manifest",
  filename: string,
  objectKey: string,
  bytes: string | Buffer,
) {
  return {
    kind,
    filename,
    objectKey,
    contentType:
      kind === "hls_playlist"
        ? "application/vnd.apple.mpegurl"
        : kind === "hls_segment"
          ? "video/mp2t"
          : "application/json",
    size: Buffer.byteLength(bytes),
    sha256: digest(bytes),
    provider,
    providerVersionId,
  };
}

function metadata(playlist = validPlaylist) {
  return {
    media_pipeline: {
      schemaVersion: 1,
      currentVersionId: versionId,
      versions: {
        [versionId]: {
          schemaVersion: 1,
          pipelineVersion: "co-deliver-media-pipeline/v1",
          status: "published",
          versionId,
          artifacts: {
            hls: {
              playlist: artifact(
                "hls_playlist",
                "playlist.m3u8",
                originalObjectKeys[0],
                playlist,
              ),
              segments: [
                artifact(
                  "hls_segment",
                  "segment000.ts",
                  originalObjectKeys[1],
                  "segment-a",
                ),
                artifact(
                  "hls_segment",
                  "segment001.ts",
                  originalObjectKeys[2],
                  "segment-b",
                ),
              ],
              manifest: artifact(
                "hls_manifest",
                "hls-manifest.json",
                "tenants/private/objects/manifest/hls-manifest.json",
                "{}",
              ),
            },
          },
        },
      },
    },
  };
}

function select(value: unknown = metadata()) {
  return selectPublishedHlsPublication({
    assetId,
    assetMetadata: value,
    versionId,
    versionAssetId: assetId,
  });
}

function playlistReader(playlist: string, overrides: { size?: number; sha256?: string } = {}) {
  const calls: Array<{
    objectKey: string;
    expectation?: { size: number; sha256?: string; providerVersionId: string };
  }> = [];
  const selected = select(metadata(playlist));
  assert.ok(selected);
  if (overrides.size !== undefined) selected.playlist.size = overrides.size;
  if (overrides.sha256 !== undefined) selected.playlist.sha256 = overrides.sha256;
  return {
    selected,
    calls,
    adapter: {
      kind: provider,
      async openStoredObjectReadStream(
        objectKey: string,
        _range?: { start: number; end: number },
        expectation?: { size: number; sha256?: string; providerVersionId: string },
      ) {
        calls.push({ objectKey, expectation });
        return Readable.from(Buffer.from(playlist));
      },
    },
  };
}

test("selects only exact published HLS metadata for the asset/version identity", () => {
  const selected = select();
  assert.ok(selected);
  assert.equal(selected.versionId, versionId);
  assert.equal(selected.assetId, assetId);
  assert.deepEqual(
    selected.segments.map((segment) => segment.filename),
    ["segment000.ts", "segment001.ts"],
  );

  assert.equal(
    selectPublishedHlsPublication({
      assetId,
      assetMetadata: metadata(),
      versionId,
      versionAssetId: "33333333-3333-4333-8333-333333333333",
    }),
    null,
  );
  const wrongPublication = structuredClone(metadata());
  wrongPublication.media_pipeline.versions[versionId].versionId =
    "33333333-3333-4333-8333-333333333333";
  assert.equal(select(wrongPublication), null);
});

test("reads the exact immutable playlist receipt and rewrites only segment lines", async () => {
  const fixture = playlistReader(validPlaylist);
  const rewritten = await readAndRewritePublishedHlsPlaylist({
    publication: fixture.selected,
    adapter: fixture.adapter,
    segmentRoutePrefix: "segments",
  });

  assert.match(rewritten, /^#EXTM3U\n/);
  assert.match(rewritten, /#EXT-X-PLAYLIST-TYPE:VOD/);
  assert.match(rewritten, /#EXTINF:6\.000000,\nsegments\/0\n/);
  assert.match(rewritten, /#EXTINF:4\.000000,\nsegments\/1\n/);
  assert.deepEqual(fixture.calls, [
    {
      objectKey: originalObjectKeys[0],
      expectation: {
        size: Buffer.byteLength(validPlaylist),
        sha256: digest(validPlaylist),
        providerVersionId,
      },
    },
  ]);
  for (const secret of [
    ...originalObjectKeys,
    "segment000.ts",
    "segment001.ts",
    providerVersionId,
  ]) {
    assert.equal(rewritten.includes(secret), false, secret);
  }
});

test("rejects missing, extra, duplicate, and unknown segment mappings", async () => {
  const unsafePlaylists = [
    validPlaylist.replace("#EXTINF:4.000000,\nsegment001.ts\n", ""),
    validPlaylist.replace(
      "#EXT-X-ENDLIST",
      "#EXTINF:1.000000,\nunknown.ts\n#EXT-X-ENDLIST",
    ),
    validPlaylist.replace("segment001.ts", "segment000.ts"),
  ];

  for (const playlist of unsafePlaylists) {
    const fixture = playlistReader(playlist);
    await assert.rejects(() =>
      readAndRewritePublishedHlsPlaylist({
        publication: fixture.selected,
        adapter: fixture.adapter,
        segmentRoutePrefix: "segments",
      }),
    );
  }

  const duplicateMetadata = structuredClone(metadata());
  duplicateMetadata.media_pipeline.versions[versionId].artifacts.hls.segments[1].filename =
    "segment000.ts";
  assert.equal(select(duplicateMetadata), null);
});

test("rejects absolute, traversal, query, fragment, and URI-bearing playlist entries", async () => {
  const replacements = [
    "https://media.example/segment000.ts",
    "../segment000.ts",
    "segment000.ts?token=secret",
    "segment000.ts#fragment",
  ];
  for (const replacement of replacements) {
    const playlist = validPlaylist.replace("segment000.ts", replacement);
    const fixture = playlistReader(playlist);
    await assert.rejects(() =>
      readAndRewritePublishedHlsPlaylist({
        publication: fixture.selected,
        adapter: fixture.adapter,
        segmentRoutePrefix: "segments",
      }),
    );
  }

  const withUriTag = validPlaylist.replace(
    "#EXTINF:6.000000,",
    '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:6.000000,',
  );
  const fixture = playlistReader(withUriTag);
  await assert.rejects(() =>
    readAndRewritePublishedHlsPlaylist({
      publication: fixture.selected,
      adapter: fixture.adapter,
      segmentRoutePrefix: "segments",
    }),
  );
});

test("rejects non-VOD playlists, unsafe route prefixes, and receipt drift", async () => {
  for (const playlist of [
    validPlaylist.replace("#EXT-X-PLAYLIST-TYPE:VOD\n", ""),
    validPlaylist.replace("#EXT-X-ENDLIST\n", ""),
  ]) {
    const fixture = playlistReader(playlist);
    await assert.rejects(() =>
      readAndRewritePublishedHlsPlaylist({
        publication: fixture.selected,
        adapter: fixture.adapter,
        segmentRoutePrefix: "segments",
      }),
    );
  }

  const unsafePrefix = playlistReader(validPlaylist);
  await assert.rejects(() =>
    readAndRewritePublishedHlsPlaylist({
      publication: unsafePrefix.selected,
      adapter: unsafePrefix.adapter,
      segmentRoutePrefix: "https://storage.example/private",
    }),
  );

  const badHash = playlistReader(validPlaylist, { sha256: "0".repeat(64) });
  await assert.rejects(() =>
    readAndRewritePublishedHlsPlaylist({
      publication: badHash.selected,
      adapter: badHash.adapter,
      segmentRoutePrefix: "segments",
    }),
  );

  const badSize = playlistReader(validPlaylist, {
    size: Buffer.byteLength(validPlaylist) + 1,
  });
  await assert.rejects(() =>
    readAndRewritePublishedHlsPlaylist({
      publication: badSize.selected,
      adapter: badSize.adapter,
      segmentRoutePrefix: "segments",
    }),
  );
});

test("rejects malformed HLS artifact receipts before any object can be read", () => {
  const scenarios = [
    (value: ReturnType<typeof metadata>) => {
      value.media_pipeline.versions[versionId].artifacts.hls.playlist.objectKey =
        "../playlist.m3u8";
    },
    (value: ReturnType<typeof metadata>) => {
      value.media_pipeline.versions[versionId].artifacts.hls.playlist.providerVersionId =
        null as unknown as string;
    },
    (value: ReturnType<typeof metadata>) => {
      value.media_pipeline.versions[versionId].artifacts.hls.segments[0].sha256 =
        "not-a-receipt";
    },
    (value: ReturnType<typeof metadata>) => {
      value.media_pipeline.versions[versionId].artifacts.hls.segments.push(
        artifact(
          "hls_segment",
          "segment002.ts",
          originalObjectKeys[1],
          "segment-c",
        ),
      );
    },
  ];

  for (const mutate of scenarios) {
    const value = structuredClone(metadata());
    mutate(value);
    assert.equal(select(value), null);
  }
});
