/**
 * P26 Asset Library — curated demo seeds.
 *
 * Honesty rules:
 * - Only formats backed by a real file under public/demo/ are "available".
 * - Sizes come from `stat`, durations/resolutions from `ffprobe`, and every
 *   SHA-256 below was computed once with `node:crypto` over the real file
 *   (see tests/assets.test.ts, which re-verifies them against disk).
 * - Everything else reports "Not produced for this asset" — never a fake
 *   download.
 */

import type { MediaAsset } from "../../components/projects/MediaCard";
import { buildInternalDemoAssetHref } from "../demo/workspace";
import { NOT_PRODUCED_REASON } from "./formats";
import type {
  LibraryAssetMeta,
  LibraryFormatEntry,
  LibraryFormatKey,
  LibraryPackage,
} from "./types";

/* Real files (measured 2026-07-25; verified against disk by tests). */
const REAL_FILES = {
  ceoPreview: {
    href: "/demo/ica-ceo-preview.mp4",
    size_bytes: 727_711,
    sha256: "53300e99341e99cd6ad6c536301aacf5b9ae36aa011661ad3edc1591f48f1526",
    resolution: "1920x1080",
    duration_seconds: 5.005,
  },
  ambientProducts: {
    href: "/demo/ambient-products.mp4",
    size_bytes: 3_555_540,
    sha256: "7694bb0f87b03cd82c74d1fe57d3c1c6d622dadb9e68f59bc2c27f910181f3f5",
    resolution: "1920x1080",
    duration_seconds: 3.042,
  },
  interviewSource: {
    href: "/demo/interview-source.mp4",
    size_bytes: 28_545_903,
    sha256: "52029586273f013b12be20dcfa934e9f87426a8295f5a5151e5e16a8a577c1ae",
    resolution: "960x540",
    duration_seconds: 150,
  },
  ceraweekSpeaker: {
    href: "/demo/ceraweek-speaker.jpg",
    size_bytes: 252_481,
    sha256: "1cc51b9754f27d04c124ed6977b5f856f8a7418325c5711f55a575e49eeb050a",
    resolution: "1920x1300",
  },
  controlRoom: {
    href: "/demo/control-room.jpg",
    size_bytes: 288_188,
    sha256: "bee115f8b96b27aa84bc7cf007b9b3291c3587556116f987df746573ee7b82b4",
    resolution: "1920x1280",
  },
  crewFieldShoot: {
    href: "/demo/crew-field-shoot.jpg",
    size_bytes: 661_219,
    sha256: "02ee9a142c351342839eedca8945af35eff2e84b9d568e6dd409500dc66a9b6d",
    resolution: "1920x1280",
  },
  refinerySunset: {
    href: "/demo/refinery-sunset.jpg",
    size_bytes: 234_056,
    sha256: "23195ba916bd98b2c657fe1c705517096c394629afce20e82dc15bc3383d0df8",
    resolution: "1920x1080",
  },
} as const;

function videoMaster(file: {
  href: string;
  size_bytes: number;
  sha256: string;
  resolution: string;
}): LibraryFormatEntry {
  return {
    format: "master",
    available: true,
    href: file.href,
    size_bytes: file.size_bytes,
    sha256: file.sha256,
    resolution: file.resolution,
  };
}

function thumbnailFile(file: {
  href: string;
  size_bytes: number;
  sha256: string;
  resolution: string;
}): LibraryFormatEntry {
  return {
    format: "thumbnail",
    available: true,
    href: file.href,
    size_bytes: file.size_bytes,
    sha256: file.sha256,
    resolution: file.resolution,
  };
}

/** All formats except the available ones report the honest reason. */
function formatRows(...available: LibraryFormatEntry[]): LibraryFormatEntry[] {
  const availableKeys = new Set(available.map((entry) => entry.format));
  const missing: LibraryFormatKey[] = [
    "master",
    "web",
    "vertical",
    "square",
    "captioned",
    "clean",
    "audio_only",
    "thumbnail",
    "transcript",
  ].filter((key) => !availableKeys.has(key as LibraryFormatKey)) as LibraryFormatKey[];
  return [...available, ...missing.map((format) => ({ format, available: false as const, reason: NOT_PRODUCED_REASON }))];
}

/**
 * New demo workspace assets appended by the store (append-only; the existing
 * seeds in lib/demo/workspace.ts are untouched). Each is backed by a real
 * file in public/demo/.
 */
export const demoLibrarySeedAssets: MediaAsset[] = [
  {
    id: "ica-ceo-hero-v1",
    project_id: "ica",
    title: "ICA CEO Hero Cut_v1",
    file_url: "/demo/ica-ceo-preview.mp4",
    thumbnail_url: "/demo/ceraweek-speaker.jpg",
    file_type: "video",
    duration_seconds: 5.005,
    status: "approved",
    version_count: 1,
    reviewer_count: 2,
    reviewer_done: 2,
    comment_count: 0,
    created_at: "2026-07-10T15:00:00.000Z",
    href: buildInternalDemoAssetHref("ica", "ica-ceo-hero-v1"),
  },
  {
    id: "ambient-product-loop-v1",
    project_id: "schneider-epc",
    title: "Ambient Product Loop_v1",
    file_url: "/demo/ambient-products.mp4",
    thumbnail_url: "/demo/refinery-sunset.jpg",
    file_type: "video",
    duration_seconds: 3.042,
    status: "approved",
    version_count: 1,
    reviewer_count: 1,
    reviewer_done: 1,
    comment_count: 0,
    created_at: "2026-07-09T12:30:00.000Z",
    href: buildInternalDemoAssetHref("schneider-epc", "ambient-product-loop-v1"),
  },
];

export const demoLibraryAssetMeta: LibraryAssetMeta[] = [
  {
    asset_id: "denie-mcdonald-v4",
    campaign: "CERAWeek 2026",
    platforms: ["linkedin", "youtube"],
    format: "speaker cut",
    orientation: "landscape",
    product: "CERAWeek speaker series",
    talent: ["Denie McDonald"],
    tags: ["ceraweek", "speaker", "keynote"],
    rights: { kind: "paid_until", label: "Paid usage until 2027-07", expires_at: "2027-07-31" },
    resolution: null,
    duration_seconds: 71,
    file_size_bytes: null,
    formats: formatRows(thumbnailFile(REAL_FILES.ceraweekSpeaker)),
  },
  {
    asset_id: "charles-drummond-v5",
    campaign: "CERAWeek 2026",
    platforms: ["linkedin"],
    format: "speaker cut",
    orientation: "landscape",
    product: "CERAWeek speaker series",
    talent: ["Charles Drummond"],
    tags: ["ceraweek", "speaker", "panel"],
    rights: { kind: "paid_until", label: "Paid usage until 2026-12", expires_at: "2026-12-31" },
    resolution: null,
    duration_seconds: 70,
    file_size_bytes: null,
    formats: formatRows(thumbnailFile(REAL_FILES.crewFieldShoot)),
  },
  {
    asset_id: "kevin-bowers-v2",
    campaign: "CERAWeek 2026",
    platforms: ["internal"],
    format: "speaker cut",
    orientation: "landscape",
    product: "CERAWeek speaker series",
    talent: ["Kevin Bowers"],
    tags: ["ceraweek", "speaker", "internal"],
    rights: { kind: "internal_only", label: "Internal only", expires_at: null },
    resolution: null,
    duration_seconds: 72,
    file_size_bytes: null,
    formats: formatRows(thumbnailFile(REAL_FILES.controlRoom)),
  },
  {
    asset_id: "ica-roadshow-final",
    campaign: "ICA Roadshow",
    platforms: ["youtube", "linkedin", "instagram"],
    format: "hero film",
    orientation: "landscape",
    product: "Roadshow hero",
    talent: ["Denie McDonald", "Charles Drummond"],
    tags: ["roadshow", "hero", "final"],
    rights: { kind: "unlimited", label: "Unlimited usage — buyout", expires_at: null },
    resolution: null,
    duration_seconds: 60,
    file_size_bytes: null,
    formats: formatRows(thumbnailFile(REAL_FILES.refinerySunset)),
  },
  {
    asset_id: "ica-ceo-hero-v1",
    campaign: "ICA Roadshow",
    platforms: ["youtube", "linkedin"],
    format: "hero film",
    orientation: "landscape",
    product: "Roadshow hero",
    talent: ["ICA CEO"],
    tags: ["roadshow", "ceo", "hero"],
    rights: { kind: "paid_until", label: "Paid usage until 2027-07", expires_at: "2027-07-31" },
    resolution: REAL_FILES.ceoPreview.resolution,
    duration_seconds: REAL_FILES.ceoPreview.duration_seconds,
    file_size_bytes: REAL_FILES.ceoPreview.size_bytes,
    formats: formatRows(
      videoMaster(REAL_FILES.ceoPreview),
      thumbnailFile(REAL_FILES.ceraweekSpeaker),
    ),
  },
  {
    asset_id: "mclaren-podcast-v3",
    campaign: "McLaren Podcast S1",
    platforms: ["youtube", "spotify"],
    format: "podcast episode",
    orientation: "landscape",
    product: "Podcast S1E12",
    talent: ["Dana Whitfield", "McLaren Racing"],
    tags: ["podcast", "interview", "mclaren"],
    rights: { kind: "paid_until", label: "Paid usage until 2027-03", expires_at: "2027-03-31" },
    resolution: REAL_FILES.interviewSource.resolution,
    duration_seconds: REAL_FILES.interviewSource.duration_seconds,
    file_size_bytes: REAL_FILES.interviewSource.size_bytes,
    formats: formatRows(
      videoMaster(REAL_FILES.interviewSource),
      thumbnailFile(REAL_FILES.crewFieldShoot),
    ),
  },
  {
    asset_id: "epc-recap-v6",
    campaign: "EPC Brand 2026",
    platforms: ["linkedin", "youtube"],
    format: "recap",
    orientation: "landscape",
    product: "EPC recap series",
    talent: [],
    tags: ["recap", "epc", "brand"],
    rights: { kind: "unlimited", label: "Unlimited usage — buyout", expires_at: null },
    resolution: null,
    duration_seconds: 122,
    file_size_bytes: null,
    formats: formatRows(thumbnailFile(REAL_FILES.controlRoom)),
  },
  {
    asset_id: "ambient-product-loop-v1",
    campaign: "EPC Brand 2026",
    platforms: ["instagram", "linkedin"],
    format: "product loop",
    orientation: "landscape",
    product: "Ambient product set",
    talent: [],
    tags: ["ambient", "product", "loop"],
    rights: { kind: "unlimited", label: "Unlimited usage — buyout", expires_at: null },
    resolution: REAL_FILES.ambientProducts.resolution,
    duration_seconds: REAL_FILES.ambientProducts.duration_seconds,
    file_size_bytes: REAL_FILES.ambientProducts.size_bytes,
    formats: formatRows(
      videoMaster(REAL_FILES.ambientProducts),
      thumbnailFile(REAL_FILES.refinerySunset),
    ),
  },
  {
    asset_id: "bp-rodeo-v2",
    campaign: "BP Rodeo 2026",
    platforms: ["internal"],
    format: "recap",
    orientation: "landscape",
    product: "Rodeo recap",
    talent: [],
    tags: ["rodeo", "recap", "field"],
    rights: { kind: "internal_only", label: "Internal only", expires_at: null },
    resolution: null,
    duration_seconds: 94,
    file_size_bytes: null,
    formats: formatRows(thumbnailFile(REAL_FILES.refinerySunset)),
  },
  {
    asset_id: "conexon-workshop-v1",
    campaign: "Conexon Workshops",
    platforms: ["internal"],
    format: "interview select",
    orientation: "landscape",
    product: "Workshop series",
    talent: ["Workshop participants"],
    tags: ["workshop", "interviews", "source"],
    rights: { kind: "internal_only", label: "Internal only — unreleased", expires_at: null },
    resolution: null,
    duration_seconds: 912,
    file_size_bytes: null,
    formats: formatRows(thumbnailFile(REAL_FILES.crewFieldShoot)),
  },
];

export const demoLibraryMetaById: Record<string, LibraryAssetMeta> = Object.fromEntries(
  demoLibraryAssetMeta.map((meta) => [meta.asset_id, meta]),
);

export const demoLibraryPackages: LibraryPackage[] = [
  {
    id: "pkg-ica-roadshow",
    title: "ICA Roadshow — Delivery Package",
    campaign: "ICA Roadshow",
    description: "Approved roadshow hero film plus the CEO hero cut for launch placements.",
    asset_ids: ["ica-roadshow-final", "ica-ceo-hero-v1"],
  },
  {
    id: "pkg-mclaren-podcast",
    title: "McLaren Podcast — Episode Package",
    campaign: "McLaren Podcast S1",
    description: "Interview master and ambient product loop for the episode delivery.",
    asset_ids: ["mclaren-podcast-v3", "ambient-product-loop-v1"],
  },
];
