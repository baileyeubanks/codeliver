import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

import React, { type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const navigationPath = resolve(
  repositoryRoot,
  "components/cockpit/CockpitNavigation.tsx",
);

interface NavigationModule {
  CockpitMobileNavigation: ComponentType<Record<string, unknown>>;
  CockpitProjectNavigation: ComponentType<Record<string, unknown>>;
  CockpitProjectNavigationDrawer: ComponentType<Record<string, unknown>>;
}

function loadNavigationModule(): NavigationModule {
  const output = ts.transpileModule(readFileSync(navigationPath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: navigationPath,
  }).outputText;
  const loadedModule = { exports: {} as NavigationModule };
  const Icon = ({ size }: { size?: number }) => React.createElement("svg", {
    height: size,
    width: size,
  });
  const Link = ({ children, href, ...props }: {
    children?: ReactNode;
    href: string;
    [key: string]: unknown;
  }) => React.createElement("a", { ...props, href }, children);
  const Image = (props: Record<string, unknown>) => React.createElement("img", props);
  const styles = new Proxy({}, {
    get: (_target, key) => String(key),
  });

  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "next/image") return Image;
    if (specifier === "next/link") return Link;
    if (specifier === "@/components/brand/CoProductionBrand") {
      return { __esModule: true, default: () => React.createElement("span", { "data-brand-variant": "horizontal" }) };
    }
    if (specifier === "lucide-react") {
      return new Proxy({}, { get: () => Icon });
    }
    if (specifier === "@/components/navigation/useDialogFocus") {
      return { useDialogFocus: () => undefined };
    }
    if (specifier === "./cockpit-navigation") {
      const overview = { id: "overview", icon: "home", label: "Review", shortLabel: "Review" };
      const media = { id: "media", icon: "media", label: "Media", shortLabel: "Media" };
      const plan = { id: "plan", icon: "plan", label: "Plan", shortLabel: "Plan" };
      const delivery = { id: "delivery", icon: "delivery", label: "Delivery", shortLabel: "Delivery" };
      const creative = { id: "creative", icon: "creative", label: "Creative", shortLabel: "Creative" };
      const proposal = { id: "proposal", icon: "proposal", label: "Proposal", shortLabel: "Proposal" };
      const sequences = { id: "sequences", icon: "sequences", label: "Sequences", shortLabel: "Sequence" };
      const reviews = { id: "reviews", icon: "reviews", label: "Reviews", shortLabel: "Reviews" };
      const approvals = { id: "approvals", icon: "approvals", label: "Approvals", shortLabel: "Approve" };
      const versions = { id: "versions", icon: "versions", label: "Versions", shortLabel: "Versions" };
      const tasks = { id: "tasks", icon: "tasks", label: "Tasks", shortLabel: "Tasks" };
      const metadata = { id: "metadata", icon: "metadata", label: "Metadata", shortLabel: "Info" };
      return {
        COCKPIT_NAVIGATION: [overview, creative, proposal, plan, media, sequences, reviews, approvals, delivery, tasks, versions, metadata],
        MOBILE_COCKPIT_NAVIGATION: [overview, media, plan, delivery],
      };
    }
    if (specifier === "./CockpitNavigation.module.css") return styles;
    throw new Error(`Unexpected CockpitNavigation import: ${specifier}`);
  }

  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${output}\n })`,
    { URLSearchParams },
  ) as (loader: typeof mockRequire, moduleRecord: typeof loadedModule, exports: NavigationModule) => void;
  evaluate(mockRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function renderedHrefs(
  Component: ComponentType<Record<string, unknown>>,
  props: Record<string, unknown>,
): string[] {
  const markup = renderToStaticMarkup(React.createElement(Component, props));
  return [...markup.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) =>
    match[1].replaceAll("&amp;", "&")
  );
}

function renderedMarkup(
  Component: ComponentType<Record<string, unknown>>,
  props: Record<string, unknown>,
): string {
  return renderToStaticMarkup(React.createElement(Component, props));
}

const navigation = loadNavigationModule();
const baseProps = {
  activeSection: "overview",
  dueTodayCount: 0,
  onSelect: () => undefined,
};

test("cockpit rail keeps Settings as its only global destination", () => {
  assert.deepEqual(
    renderedHrefs(navigation.CockpitProjectNavigation, baseProps),
    ["/settings"],
  );
});

test("cockpit rail preserves demo queries only when demo mode is explicit", () => {
  assert.deepEqual(
    renderedHrefs(navigation.CockpitProjectNavigation, {
      ...baseProps,
      demoMode: true,
    }),
    ["/settings?demo=1"],
  );
});

test("Review is a navigation destination, not a disclosure pointing at removed content", () => {
  const desktop = renderedMarkup(navigation.CockpitProjectNavigation, {
    ...baseProps,
  });
  assert.doesNotMatch(desktop, /cockpit-project-overview/);

  const mobile = renderedMarkup(navigation.CockpitMobileNavigation, {
    ...baseProps,
    drawerOpen: false,
    onOpenDrawer: () => undefined,
  });
  assert.doesNotMatch(mobile, /cockpit-project-overview/);
});

test("drawer forwards demo mode while the mobile bar stays route-free", () => {
  const drawerProps = {
    ...baseProps,
    onClose: () => undefined,
    open: true,
  };
  assert.deepEqual(
    renderedHrefs(navigation.CockpitProjectNavigationDrawer, drawerProps),
    ["/settings"],
  );
  assert.deepEqual(
    renderedHrefs(navigation.CockpitProjectNavigationDrawer, {
      ...drawerProps,
      demoMode: true,
    }),
    ["/settings?demo=1"],
  );

  const mobileProps = {
    ...baseProps,
    demoMode: true,
    drawerOpen: false,
    onOpenDrawer: () => undefined,
  };
  assert.deepEqual(
    renderedHrefs(navigation.CockpitMobileNavigation, mobileProps),
    [],
  );
});

test("record and Whiteboard routes never mark Review as the active project surface", () => {
  const recordRail = renderedMarkup(navigation.CockpitProjectNavigation, {
    ...baseProps,
    projectId: "el-paso",
    activeRecordTab: "brief",
  });
  assert.match(recordRail, /<a[^>]*(?:href="\/projects\/el-paso\?tab=brief"[^>]*data-active="true"[^>]*aria-current="page"|data-active="true"[^>]*aria-current="page"[^>]*href="\/projects\/el-paso\?tab=brief")/);
  assert.doesNotMatch(recordRail, /data-active="true"[^>]*aria-current="page"[^>]*>.*Review/);

  const whiteboardRail = renderedMarkup(navigation.CockpitProjectNavigation, {
    ...baseProps,
    projectId: "el-paso",
    activeWhiteboard: true,
  });
  assert.match(whiteboardRail, /<a[^>]*(?:href="\/projects\/el-paso\/whiteboard"[^>]*data-active="true"[^>]*aria-current="page"|data-active="true"[^>]*aria-current="page"[^>]*href="\/projects\/el-paso\/whiteboard")/);
  assert.doesNotMatch(whiteboardRail, /data-active="true"[^>]*aria-current="page"[^>]*>.*Review/);

  const mobileRecordRail = renderedMarkup(navigation.CockpitMobileNavigation, {
    ...baseProps,
    activeRecordTab: "brief",
    drawerOpen: false,
    onOpenDrawer: () => undefined,
  });
  assert.doesNotMatch(mobileRecordRail, /aria-current="page"/);
});

test("compact More is transient while the expanded rail retains its saved disclosure", () => {
  const source = readFileSync(navigationPath, "utf8");
  assert.match(source, /const \[compactSecondaryOpen, setCompactSecondaryOpen\] = useState\(false\)/);
  assert.match(source, /const secondaryVisible = compact\s*\? compactSecondaryOpen\s*:/);
  assert.match(source, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /if \(compact\) setCompactSecondaryOpen\(false\);/);
  assert.match(source, /if \(compact\) \{\s*setCompactSecondaryOpen\(\(open\) => !open\);/);
});

test("all active navigation links receive the primary active treatment", () => {
  const styles = readFileSync(resolve(repositoryRoot, "components/cockpit/CockpitNavigation.module.css"), "utf8");
  assert.match(styles, /\.primary a\[data-active="true"\]/);
  assert.match(styles, /\.recordLinks a\[data-active="true"\]/);
});

test("the compact rail exposes an accurate expansion control", () => {
  const markup = renderedMarkup(navigation.CockpitProjectNavigation, {
    ...baseProps,
    compact: true,
    onCollapse: () => undefined,
  });
  assert.match(markup, /aria-label="Expand rail"/);
  assert.match(markup, />Expand rail</);
});

test("mounted rail and drawer navigation use distinct More disclosure targets", () => {
  const props = {
    ...baseProps,
    projectId: "el-paso",
    activeRecordTab: "brief",
  };
  const markup = renderToStaticMarkup(
    React.createElement(React.Fragment, null,
      React.createElement(navigation.CockpitProjectNavigation, props),
      React.createElement(navigation.CockpitProjectNavigationDrawer, { ...props, open: true, onClose: () => undefined }),
    ),
  );
  const controls = [...markup.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
  const ids = [...markup.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(controls.length, 2);
  assert.equal(new Set(controls).size, 2);
  assert.deepEqual(new Set(ids), new Set(controls));
});
