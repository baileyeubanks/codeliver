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
      const overview = {
        id: "overview",
        icon: "home",
        label: "Overview",
        shortLabel: "Home",
      };
      return {
        COCKPIT_NAVIGATION: [overview],
        MOBILE_COCKPIT_NAVIGATION: [overview],
      };
    }
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

const navigation = loadNavigationModule();
const baseProps = {
  activeSection: "overview",
  dueTodayCount: 0,
  onSelect: () => undefined,
};

test("cockpit rail defaults Settings and Team links to production URLs", () => {
  assert.deepEqual(
    renderedHrefs(navigation.CockpitProjectNavigation, baseProps),
    ["/settings", "/settings?section=organization"],
  );
});

test("cockpit rail preserves demo queries only when demo mode is explicit", () => {
  assert.deepEqual(
    renderedHrefs(navigation.CockpitProjectNavigation, {
      ...baseProps,
      demoMode: true,
    }),
    ["/settings?demo=1", "/settings?section=organization&demo=1"],
  );
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

test("drawer forwards demo mode while the mobile bar stays route-free", () => {
  const drawerProps = {
    ...baseProps,
    onClose: () => undefined,
    open: true,
  };
  assert.deepEqual(
    renderedHrefs(navigation.CockpitProjectNavigationDrawer, drawerProps),
    ["/settings", "/settings?section=organization"],
  );
  assert.deepEqual(
    renderedHrefs(navigation.CockpitProjectNavigationDrawer, {
      ...drawerProps,
      demoMode: true,
    }),
    ["/settings?demo=1", "/settings?section=organization&demo=1"],
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
