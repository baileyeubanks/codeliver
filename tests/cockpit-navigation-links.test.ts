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
const navigationDataPath = resolve(
  repositoryRoot,
  "components/cockpit/cockpit-navigation.ts",
);

interface CockpitNavigationItem {
  id: string;
  icon: string;
  label: string;
  shortLabel: string;
}

interface CockpitNavigationDataModule {
  COCKPIT_LIFECYCLE_NAVIGATION: CockpitNavigationItem[];
  COCKPIT_MORE_VIEWS_NAVIGATION: CockpitNavigationItem[];
  COCKPIT_NAVIGATION: CockpitNavigationItem[];
  MOBILE_COCKPIT_NAVIGATION: CockpitNavigationItem[];
}

interface NavigationModule {
  CockpitMobileNavigation: ComponentType<Record<string, unknown>>;
  CockpitProjectNavigation: ComponentType<Record<string, unknown>>;
  CockpitProjectNavigationDrawer: ComponentType<Record<string, unknown>>;
}

function loadNavigationDataModule(): CockpitNavigationDataModule {
  const output = ts.transpileModule(readFileSync(navigationDataPath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: navigationDataPath,
  }).outputText;
  const loadedModule = { exports: {} as CockpitNavigationDataModule };
  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${output}\n })`,
  ) as (
    loader: (specifier: string) => never,
    moduleRecord: typeof loadedModule,
    exports: CockpitNavigationDataModule,
  ) => void;

  evaluate(
    (specifier) => {
      throw new Error(`Unexpected cockpit navigation import: ${specifier}`);
    },
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
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
    if (specifier === "./cockpit-navigation") return navigationData;
    if (specifier === "./CockpitNavigation.module.css") return styles;
    throw new Error(`Unexpected CockpitNavigation import: ${specifier}`);
  }

  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${output}\n })`,
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

function navigationEntries(items: CockpitNavigationItem[]): string[][] {
  return Array.from(items, (item) => [item.id, item.label]);
}

function navigationIds(items: CockpitNavigationItem[]): string[] {
  return Array.from(items, (item) => item.id);
}

const navigationData = loadNavigationDataModule();
const navigation = loadNavigationModule();
const baseProps = {
  activeSection: "overview",
  dueTodayCount: 0,
  onSelect: () => undefined,
};

test("cockpit navigation keeps all deep-link sections while exporting lifecycle rail labels", () => {
  assert.deepEqual(
    navigationEntries(navigationData.COCKPIT_NAVIGATION),
    [
      ["overview", "Overview"],
      ["media", "Media"],
      ["sequences", "Sequences"],
      ["reviews", "Reviews"],
      ["approvals", "Approvals"],
      ["tasks", "Tasks"],
      ["versions", "Versions"],
      ["metadata", "Metadata"],
    ],
  );
  assert.deepEqual(
    navigationEntries(navigationData.COCKPIT_LIFECYCLE_NAVIGATION),
    [
      ["overview", "Overview"],
      ["tasks", "Plan"],
      ["media", "Edit"],
      ["reviews", "Review"],
    ],
  );
  assert.deepEqual(
    navigationEntries(navigationData.COCKPIT_MORE_VIEWS_NAVIGATION),
    [
      ["sequences", "Sequences"],
      ["versions", "Versions"],
      ["approvals", "Approvals"],
      ["metadata", "Details"],
    ],
  );
  assert.deepEqual(
    navigationIds(navigationData.MOBILE_COCKPIT_NAVIGATION),
    ["overview", "tasks", "media", "reviews"],
  );
});

test("project rail is lifecycle-first and excludes global shortcut clutter", () => {
  const markup = renderedMarkup(navigation.CockpitProjectNavigation, baseProps);
  assert.match(markup, />Overview</);
  assert.match(markup, />Plan</);
  assert.match(markup, />Edit</);
  assert.match(markup, />Review</);
  assert.match(markup, />More views</);
  assert.match(markup, /aria-controls="cockpit-project-more-views"/);
  assert.match(markup, />Sequences</);
  assert.match(markup, />Versions</);
  assert.match(markup, />Approvals</);
  assert.match(markup, />Details</);
  assert.doesNotMatch(markup, /Settings|Brand settings|Assets|Team|Project shortcuts/);
  assert.deepEqual(renderedHrefs(navigation.CockpitProjectNavigation, baseProps), []);
});

test("More views retains disclosure state and compact accessible labels", () => {
  const collapsed = renderedMarkup(navigation.CockpitProjectNavigation, baseProps);
  assert.match(
    collapsed,
    /aria-expanded="false" aria-controls="cockpit-project-more-views"/,
  );

  const activeMoreView = renderedMarkup(navigation.CockpitProjectNavigation, {
    ...baseProps,
    activeSection: "sequences",
  });
  assert.match(
    activeMoreView,
    /aria-expanded="true" aria-controls="cockpit-project-more-views"/,
  );

  const compact = renderedMarkup(navigation.CockpitProjectNavigation, {
    ...baseProps,
    compact: true,
  });
  assert.match(compact, /aria-label="Overview" title="Overview"/);
  assert.match(compact, /aria-label="More views" title="More views"/);
});

test("Overview exposes the same drawer state from desktop and mobile navigation", () => {
  const desktop = renderedMarkup(navigation.CockpitProjectNavigation, {
    ...baseProps,
    overviewOpen: true,
  });
  assert.match(desktop, /aria-expanded="true"/);
  assert.match(desktop, /aria-controls="cockpit-project-overview"/);

  const mobile = renderedMarkup(navigation.CockpitMobileNavigation, {
    ...baseProps,
    drawerOpen: false,
    overviewOpen: true,
    onOpenDrawer: () => undefined,
  });
  assert.match(mobile, /aria-expanded="true"/);
  assert.match(mobile, /aria-controls="cockpit-project-overview"/);
});

test("mobile exposes lifecycle items plus More and the drawer remains route-free", () => {
  const drawerProps = {
    ...baseProps,
    onClose: () => undefined,
    open: true,
  };
  const drawer = renderedMarkup(navigation.CockpitProjectNavigationDrawer, drawerProps);
  assert.match(drawer, /id="cockpit-project-navigation-drawer"/);
  assert.match(drawer, /aria-controls="cockpit-project-more-views-drawer"/);
  assert.deepEqual(
    renderedHrefs(navigation.CockpitProjectNavigationDrawer, drawerProps),
    [],
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
  const mobile = renderedMarkup(navigation.CockpitMobileNavigation, mobileProps);
  assert.match(mobile, />Overview</);
  assert.match(mobile, />Plan</);
  assert.match(mobile, />Edit</);
  assert.match(mobile, />Review</);
  assert.match(mobile, />More</);
  assert.doesNotMatch(mobile, /Sequences|Versions|Approvals|Details|Settings|Brand settings|Assets|Team/);
  assert.match(mobile, /aria-label="More project navigation"/);
  assert.match(
    mobile,
    /aria-controls="cockpit-project-navigation-drawer" aria-expanded="false"/,
  );
});
