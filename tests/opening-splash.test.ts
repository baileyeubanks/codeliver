import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("components/brand/OpeningSplash.tsx", "utf8");
const styles = readFileSync("components/brand/OpeningSplash.module.css", "utf8");
const globals = readFileSync("app/globals.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const motionAsset = readFileSync("public/brand/co-videopro-opening-motion.mp4");
const desktopMotionAsset = readFileSync("public/brand/co-videopro-opening-desktop.mp4");
const desktopPosterAsset = readFileSync("public/brand/co-videopro-opening-desktop-poster.jpg");
const mobilePosterAsset = readFileSync("public/brand/co-videopro-opening-mobile-poster.jpg");

test("the exact desktop and mobile opening media remain bounded", () => {
  assert.equal(
    createHash("sha256").update(motionAsset).digest("hex"),
    "eb7ce0facb752944537c52714a8e18e578e3e592be4c34a3102220f0dbd09677",
  );
  assert.equal(
    createHash("sha256").update(desktopMotionAsset).digest("hex"),
    "38c22d646c15daad8691c097c5b6891c484c1c17ef47d0905119bc4c916214a1",
  );
  assert.equal(motionAsset.subarray(4, 8).toString("ascii"), "ftyp");
  assert.equal(desktopMotionAsset.subarray(4, 8).toString("ascii"), "ftyp");
  assert.ok(motionAsset.byteLength < 2_500_000);
  assert.ok(desktopMotionAsset.byteLength < 2_500_000);
});

test("each viewport uses a matching video and poster", () => {
  assert.equal(
    createHash("sha256").update(desktopPosterAsset).digest("hex"),
    "9041f10c31ee93b7a75695567a0437443f19b986b11d0629c90d8dce72139d11",
  );
  assert.equal(
    createHash("sha256").update(mobilePosterAsset).digest("hex"),
    "34895744decd5432d7267f1f4d49e59b986fd90fa42e0ebfc232a23171676f13",
  );
  assert.ok(desktopPosterAsset.byteLength < 100_000);
  assert.ok(mobilePosterAsset.byteLength < 100_000);
  assert.match(component, /desktop:[\s\S]*?co-videopro-opening-desktop\.mp4[\s\S]*?co-videopro-opening-desktop-poster\.jpg/);
  assert.match(component, /mobile:[\s\S]*?co-videopro-opening-motion\.mp4[\s\S]*?co-videopro-opening-mobile-poster\.jpg/);
  assert.match(component, /src=\{media\.src\}/);
  assert.match(component, /poster=\{media\.poster\}/);
});

test("repeat visits are suppressed before hydration without mounting media", () => {
  assert.match(layout, /strategy="beforeInteractive"/);
  assert.match(layout, /sessionStorage\.getItem\(key\) === "true"/);
  assert.match(layout, /seen \? "seen" : "pending"/);
  assert.match(layout, /data-opening-splash="pending"/);
  assert.match(component, /useState<SplashState>\("checking"\)/);
  assert.match(component, /if \(state === "checking" \|\| state === "hidden"/);
  assert.match(globals, /html\[data-opening-splash="pending"\] body::before/);
});

test("breakpoint and motion changes update the active opening", () => {
  assert.match(component, /matchMedia\("\(max-width: 640px\)"\)/);
  assert.match(component, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(component, /mobileQuery\.addEventListener\("change", syncVariant\)/);
  assert.match(component, /reducedMotionQuery\.addEventListener\("change", syncMotionPreference\)/);
  assert.match(component, /key=\{variant\}/);
  assert.match(component, /window\.performance\.now\(\) - visibleStartedAtRef\.current/);
});

test("the opening traps focus over an inert application root", () => {
  assert.match(layout, /id="co-videopro-app-root"/);
  assert.match(component, /appRoot\.setAttribute\("inert", ""\)/);
  assert.match(component, /appRoot\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(component, /skipButtonRef\.current\?\.focus/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /event\.key === "Escape"/);
});

test("the opening remains bounded, skippable, and non-looping", () => {
  assert.match(component, /const MOBILE_MAX_VISIBLE_MS = 6_000/);
  assert.match(component, /const DESKTOP_MAX_VISIBLE_MS = 16_000/);
  assert.match(component, /aria-label="Skip opening animation"/);
  assert.match(component, /onEnded=\{close\}/);
  assert.match(component, /onError=\{handleVideoError\}/);
  assert.match(component, /\bautoPlay\b/);
  assert.match(component, /\bmuted\b/);
  assert.match(component, /\bplaysInline\b/);
  assert.doesNotMatch(component, /\bloop\b/);
});

test("the splash preserves stable desktop and mobile geometry", () => {
  assert.match(styles, /width:\s*min\(960px, 92vw, 82dvh\)/);
  assert.match(styles, /aspect-ratio:\s*16 \/ 9/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /aspect-ratio:\s*9 \/ 16/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /border-radius:\s*8px/);
});
