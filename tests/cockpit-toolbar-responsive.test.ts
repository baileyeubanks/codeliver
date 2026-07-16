import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const toolbarSource = readFileSync(
  resolve(repositoryRoot, "components/cockpit/CockpitToolbar.tsx"),
  "utf8",
);
const toolbarStyles = readFileSync(
  resolve(repositoryRoot, "components/cockpit/CockpitToolbar.module.css"),
  "utf8",
);

const mobileStyles = toolbarStyles.match(
  /@media \(max-width: 900px\) \{([\s\S]*)\n\}\n\n@media \(max-width: 390px\)/,
)?.[1];
const overflowSource = toolbarSource.slice(toolbarSource.indexOf("<div ref={overflowRootRef}"));

test("desktop retains every toolbar contract and the lifecycle ReactNode", () => {
  assert.match(toolbarSource, /lifecycleControl\?: ReactNode;/);
  assert.match(toolbarSource, /<div className=\{styles\.desktopControls\}>/);
  assert.match(toolbarSource, /onClick=\{onToggleRail\}/);
  assert.match(toolbarSource, /onClick=\{onToggleDock\}/);
  assert.match(toolbarSource, /onClick=\{onOpenCommandPalette\}/);
  assert.match(toolbarSource, /onClick=\{onSave\}/);
  assert.match(toolbarSource, /<div className=\{styles\.lifecycle\}>\{lifecycleControl\}<\/div>/);
  assert.match(toolbarSource, /className=\{styles\.presence\}/);
  assert.match(toolbarStyles, /\.desktopControls \{\s*display: contents;/);
});

test("the 900px toolbar exposes only three modes, lifecycle, and overflow", () => {
  assert.ok(mobileStyles, "the mobile toolbar breakpoint is missing");
  assert.equal(toolbarSource.match(/\{ id: "(?:review|edit|focus)"/g)?.length, 3);
  assert.match(mobileStyles, /grid-template-columns: repeat\(3, minmax\(58px, 1fr\)\)/);
  assert.match(mobileStyles, /width: min\(56vw, 210px\)/);
  assert.match(
    mobileStyles,
    /\.modes button \{[\s\S]*?min-width: 58px;[\s\S]*?height: 40px;/,
  );
  assert.match(
    mobileStyles,
    /\.modes button span \{[\s\S]*?display: inline;/,
  );
  assert.match(
    mobileStyles,
    /\.desktopControls,[\s\S]*?\.presence \{\s*display: none;/,
  );
  assert.match(
    mobileStyles,
    /\.lifecycle \{[\s\S]*?width: 42px;[\s\S]*?height: 42px;[\s\S]*?flex: 0 0 42px;/,
  );
  assert.match(
    mobileStyles,
    /\.overflow \{[\s\S]*?width: 42px;[\s\S]*?height: 42px;[\s\S]*?display: block;/,
  );
});

test("mobile overflow owns secondary actions and excludes the project rail", () => {
  assert.match(toolbarSource, /const \[overflowOpen, setOverflowOpen\] = useState\(false\)/);
  assert.match(overflowSource, /<strong>Operator dock<\/strong>/);
  assert.match(overflowSource, /onClick=\{\(\) => runOverflowAction\(onToggleDock\)\}/);
  assert.match(overflowSource, /<strong>Commands<\/strong>/);
  assert.match(overflowSource, /onClick=\{openCommandsFromOverflow\}/);
  assert.match(overflowSource, /<strong>Save layout<\/strong>/);
  assert.match(overflowSource, /onClick=\{\(\) => runOverflowAction\(onSave\)\}/);
  assert.doesNotMatch(overflowSource, /onToggleRail|project rail/i);
});

test("overflow state and keyboard behavior follow the accessible menu pattern", () => {
  assert.match(toolbarSource, /aria-haspopup="menu"/);
  assert.match(toolbarSource, /aria-expanded=\{overflowOpen\}/);
  assert.match(toolbarSource, /aria-controls=\{overflowMenuId\}/);
  assert.match(toolbarSource, /role="menu"/);
  assert.match(toolbarSource, /role="menuitemcheckbox"/);
  assert.match(toolbarSource, /aria-checked=\{dockOpen\}/);
  assert.match(toolbarSource, /className=\{styles\.menuStatus\} role="group"/);
  assert.match(toolbarSource, /event\.key === "Escape"/);
  assert.match(toolbarSource, /event\.key === "ArrowDown"/);
  assert.match(toolbarSource, /event\.key === "ArrowUp"/);
  assert.match(toolbarSource, /event\.key === "Home"/);
  assert.match(toolbarSource, /event\.key === "End"/);
  assert.match(toolbarSource, /overflowButtonRef\.current\?\.focus\(\)/);
  assert.match(toolbarSource, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
});

test("pressed states and command-palette focus return stay bound to visible controls", () => {
  assert.match(toolbarSource, /aria-pressed=\{mode === id\}/);
  assert.match(toolbarSource, /aria-label=\{`\$\{label\} workspace`\}/);
  assert.match(toolbarSource, /className=\{styles\.modes\} role="group" aria-label="Workspace mode"/);
  assert.match(toolbarSource, /aria-pressed=\{railExpanded\}/);
  assert.match(toolbarSource, /aria-pressed=\{dockOpen\}/);
  assert.match(
    toolbarSource,
    /commandButtonRef\.current = mobile[\s\S]*?\? overflowButton[\s\S]*?: desktopCommandButton/,
  );
  assert.match(toolbarSource, /commandButtonRef\.current = overflowButtonRef\.current;\s*onOpenCommandPalette\(\)/);
  assert.match(toolbarStyles, /\.overflowButton:focus-visible \{[\s\S]*?outline: 2px solid var\(--cockpit-accent/);
  assert.match(toolbarStyles, /\.modes button:focus-visible \{[\s\S]*?outline: 2px solid var\(--cockpit-accent/);
});
