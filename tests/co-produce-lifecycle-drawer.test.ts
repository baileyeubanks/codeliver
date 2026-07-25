import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const drawerSource = readFileSync(
  resolve(repositoryRoot, "components/cockpit/CoProduceLifecycleDrawer.tsx"),
  "utf8",
);
const drawerStyles = readFileSync(
  resolve(repositoryRoot, "components/cockpit/CoProduceLifecycleDrawer.module.css"),
  "utf8",
);

test("the lifecycle contract requires all four parent-owned phases and destinations", () => {
  for (const phaseId of [
    "pre-production",
    "production",
    "post-production",
    "delivery-assets",
  ]) {
    assert.match(drawerSource, new RegExp(`id: "${phaseId}"`));
  }

  assert.match(
    drawerSource,
    /Record<CoProduceLifecyclePhaseId, CoProduceLifecyclePhase>/,
  );
  assert.match(drawerSource, /href: string \| null;/);
  assert.match(drawerSource, /progress: number;/);
  assert.match(drawerSource, /progressLabel\?: string;/);
  assert.match(drawerSource, /agentStatus: CoProduceLifecycleStatus;/);
  assert.match(drawerSource, /humanStatus: CoProduceLifecycleStatus;/);
  assert.match(drawerSource, /links: readonly CoProduceLifecycleSurfaceLink\[\];/);
});

test("the compact disclosure is closed by default and keeps dialog focus safe", () => {
  assert.match(drawerSource, /open\?: boolean;/);
  assert.match(drawerSource, /onOpenChange\?: \(open: boolean\) => void;/);
  assert.match(drawerSource, /defaultOpen = false/);
  assert.match(drawerSource, /const isOpen = open \?\? internalOpen/);
  assert.match(drawerSource, /if \(open === undefined\) setInternalOpen\(nextOpen\)/);
  assert.match(drawerSource, /onOpenChange\?\.\(nextOpen\)/);
  assert.match(drawerSource, /aria-expanded=\{isOpen\}/);
  assert.match(drawerSource, /aria-haspopup="dialog"/);
  assert.match(drawerSource, /role="dialog"/);
  assert.match(drawerSource, /aria-modal="true"/);
  assert.match(
    drawerSource,
    /useDialogFocus\(dialogOpen, drawerRef, closeDrawer, closeRef, true, triggerRef\)/,
  );
  assert.match(drawerSource, /const dialogOpen = isOpen && portalTarget !== null/);
  assert.match(drawerSource, /useSyncExternalStore\(/);
  assert.match(drawerSource, /return document\.body/);
  assert.match(drawerSource, /function getServerPortalTarget\(\)/);
  assert.match(drawerSource, /\{isOpen && portalTarget/);
  assert.match(drawerSource, /createPortal\(/);
  assert.match(drawerSource, /portalTarget,/);
});

test("each phase exposes semantic progress, agent and human status, and route links", () => {
  for (const label of [
    "Pre-production",
    "Production",
    "Post-production",
    "Delivery & Assets",
  ]) {
    assert.match(drawerSource, new RegExp(`label: "${label.replace("&", "\\&")}"`));
  }

  assert.match(drawerSource, /<progress/);
  assert.match(drawerSource, /value=\{progress\}/);
  assert.match(drawerSource, /aria-label=\{`\$\{label\} record evidence`\}/);
  assert.match(drawerSource, /phase\.progressLabel/);
  assert.match(drawerSource, /<h3 id=\{phaseTitleId\}>\{label\}<\/h3>/);
  assert.match(drawerSource, /Agent/);
  assert.match(drawerSource, /Human in the loop/);
  assert.match(drawerSource, /href=\{phase\.href\}/);
  assert.match(drawerSource, /aria-disabled="true"/);
  assert.match(drawerSource, /data-available=\{phase\.href \? "true" : "false"\}/);
  assert.match(drawerSource, /<LockKeyhole size=\{13\} aria-hidden="true" \/>/);
  assert.match(drawerSource, />Unavailable<\/span>/);
  assert.doesNotMatch(drawerSource, /href=\{phase\.href \?\?/);
  assert.match(drawerSource, /href=\{link\.href\}/);
  assert.match(drawerSource, /aria-label=\{`\$\{label\} surfaces`\}/);
  assert.match(drawerSource, /kind: "phase"/);
  assert.match(drawerSource, /kind: "surface"/);
});

test("phase and checkpoint states use icon plus text instead of color alone", () => {
  for (const mapping of [
    "neutral: Minus",
    "active: CircleDot",
    "waiting: Clock3",
    "attention: TriangleAlert",
    "complete: Check",
  ]) {
    assert.match(drawerSource, new RegExp(mapping));
  }

  assert.match(drawerSource, /data-tone=\{phase\.status\.tone\}/);
  assert.match(drawerSource, /<StatusIcon tone=\{phase\.status\.tone\} \/>/);
  assert.match(drawerSource, /<StatusIcon tone=\{phase\.agentStatus\.tone\} \/>/);
  assert.match(drawerSource, /<StatusIcon tone=\{phase\.humanStatus\.tone\} \/>/);

  for (const tone of ["neutral", "active", "waiting", "attention", "complete"]) {
    assert.match(drawerStyles, new RegExp(`\\.status\\[data-tone="${tone}"\\]`));
  }
});

test("the drawer extends cockpit tokens as a dense connected lifecycle", () => {
  assert.match(drawerStyles, /var\(--cockpit-accent, #156bff\)/);
  assert.match(drawerStyles, /var\(--cockpit-ink, #18223e\)/);
  assert.match(drawerStyles, /var\(--cockpit-border, #dfe4ec\)/);
  assert.match(drawerStyles, /\.phaseItem:not\(:last-child\)::after/);
  assert.match(drawerStyles, /\.phaseItem\[data-tone="active"\]/);
  assert.match(drawerStyles, /\.phaseItem\[data-tone="waiting"\]/);
  assert.match(drawerStyles, /\.phaseItem\[data-tone="complete"\]/);
  assert.match(drawerStyles, /\.phaseDetails/);
  assert.match(drawerStyles, /border-radius: 50%/);
});

test("the lifecycle collapses cleanly at shell and narrow-mobile breakpoints", () => {
  assert.match(drawerStyles, /@media \(max-width: 900px\)/);
  assert.match(drawerStyles, /@media \(max-width: 520px\)/);
  assert.match(drawerStyles, /@media \(max-width: 360px\)/);
  assert.match(drawerStyles, /\.drawer \{[\s\S]*?width: 100%;[\s\S]*?border-left: 0;/);
  assert.match(
    drawerStyles,
    /@media \(max-width: 360px\)[\s\S]*?\.actors \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.match(drawerStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(drawerStyles, /gradient\(/i);
});
