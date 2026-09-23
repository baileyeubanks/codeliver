import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cockpitSource = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.tsx"),
  "utf8",
);
const cockpitStyles = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.module.css"),
  "utf8",
);
const globalStyles = readFileSync(resolve(repositoryRoot, "app/globals.css"), "utf8");

function phonePlayerCss(styles: string) {
  const start = styles.indexOf("@media (max-width: 767px), (orientation: landscape) and (max-height: 520px)");
  assert.ok(start >= 0, "phone player media query is missing");
  const next = styles.indexOf("@media", start + 10);
  return styles.slice(start, next === -1 ? undefined : next);
}

test("desktop single-stage playbar stays a full-width seek row inside the frame", () => {
  const desktopSeek = cockpitStyles.slice(
    cockpitStyles.indexOf(".playerSeekTrack {"),
    cockpitStyles.indexOf(".playerControls:global(.cockpit-video-controls) .playerSeek {"),
  );
  assert.match(desktopSeek, /position:\s*relative;/);
  assert.match(desktopSeek, /flex:\s*0 0 100%;/);
  assert.match(desktopSeek, /height:\s*26px;/);
  assert.match(
    cockpitStyles.slice(0, cockpitStyles.indexOf("@media (max-width: 767px)")),
    /\.playerControls:global\(\.cockpit-video-controls\) button,[\s\S]*?min-height:\s*36px;/,
  );
  assert.doesNotMatch(
    cockpitStyles.slice(0, cockpitStyles.indexOf("@media (max-width: 767px)")),
    /max-height:\s*52px/,
  );
});

test("phone controls are a 6% absolute overlay, not a deck under the film", () => {
  const phone = phonePlayerCss(cockpitStyles);
  assert.match(phone, /position:\s*absolute;/);
  assert.match(phone, /top:\s*auto;/);
  assert.match(phone, /bottom:\s*0;/);
  assert.match(phone, /height:\s*6%;/);
  assert.match(phone, /max-height:\s*6%;/);
  assert.match(phone, /min-height:\s*0;/);
  assert.match(phone, /flex-wrap:\s*nowrap;/);
  assert.doesNotMatch(phone, /height:\s*44px/);
  assert.doesNotMatch(phone, /min-height:\s*4[248]px/);
  assert.match(phone, /\.playerSeekTrack\s*\{[^}]*flex:\s*1 1 auto;/);
  assert.doesNotMatch(phone, /\.playerSeekTrack\s*\{[^}]*flex:\s*0 0 100%;/);
  assert.match(phone, /::-webkit-slider-runnable-track\s*\{[^}]*height:\s*2px;/);
  assert.match(phone, /> select,[\s\S]*?display:\s*none;/);
  assert.match(phone, /\.playerDownload\s*\{[^}]*display:\s*inline-flex;/);
  const phoneGlobals = globalStyles.slice(
    globalStyles.indexOf("/* Phone film:"),
  );
  assert.match(
    phoneGlobals,
    /\.cockpit-video-frame > video,[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;/,
  );
  assert.match(
    phoneGlobals,
    /\.cockpit-video-frame > \.cockpit-video-controls\s*\{[^}]*position:\s*absolute;[^}]*height:\s*6%;[^}]*max-height:\s*6%;/,
  );
  assert.match(phoneGlobals, /\.cockpit-video-frame > \* \{\s*position:\s*absolute;\s*\}/);
  assert.doesNotMatch(
    globalStyles,
    /@media \(max-width: 640px\) \{[\s\S]*?\.cockpit-video-controls \{[^}]*min-height:\s*42px/,
  );
  assert.doesNotMatch(
    globalStyles,
    /@media \(max-width: 640px\) \{[\s\S]*?\.cockpit-video-controls button \{[^}]*height:\s*28px/,
  );
  assert.match(phone, /\.playerDownload\s*\{[^}]*order:\s*4;/);
});

test("download stays out of the desktop bar and the phone stage is full-bleed", () => {
  assert.match(cockpitStyles, /\.playerDownload\s*\{\s*display:\s*none;\s*\}/);
  assert.match(cockpitSource, /aria-label="Download video"/);
  assert.match(cockpitSource, /reviewPlayerDownloadHref\(activeMediaUrl, hlsMediaActive\)/);
  assert.match(cockpitSource, /params\.set\("download", "1"\)/);
  assert.match(cockpitSource, /if \(!url \|\| streamPlaylist\) return null;/);
  assert.match(cockpitSource, /data-transport-time-compact/);
  assert.match(cockpitSource, /aria-label="Review playback position"/);
  assert.match(cockpitSource, /styles\.playerCommentMarker/);
  assert.match(
    globalStyles,
    /@media \(max-width: 767px\), \(orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*?\.cockpit-review-stage\s*\{[^}]*border-radius:\s*0;[^}]*margin-inline:\s*-16px;/,
  );
  assert.match(
    globalStyles,
    /@media \(max-width: 640px\) \{\s*\.cockpit-review-stage \{ margin-inline: -12px; \}/,
  );
  assert.match(
    globalStyles,
    /@media \(orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*?max-height:\s*calc\(100dvh - 140px\);/,
  );
});
