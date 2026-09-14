import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
// Dynamic JSX and transpiled CommonJS exports are inspected only inside this test harness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Element = { type: unknown; props: Record<string, any> };

function harness() {
  const state: unknown[] = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  let resolveRequest: (response: Response) => void = () => {};
  let payload: Record<string, unknown> = {};
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (value: unknown) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      }];
    },
    useRef: () => ({ current: null }),
    useMemo: (fn: () => unknown) => fn(),
    useEffect: (fn: () => void) => { effects.push(fn); },
  };
  const cache = new Map<string, unknown>();
  const root = new URL("../", import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function load(relative: string): any {
    if (cache.has(relative)) return cache.get(relative);
    const output = ts.transpileModule(readFileSync(new URL(relative, root), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const loadedModule = { exports: {} };
    function imports(name: string): unknown {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "lucide-react") return new Proxy({}, { get: () => "svg" });
      if (name.endsWith(".css")) return new Proxy({}, { get: (_, key) => key });
      if (name === "@/lib/sharing/share-intent") return load("lib/sharing/share-intent.ts");
      if (name === "@/lib/surface-origins") return {
        getReviewSiteUrl: () => "https://co-videopro.com",
        buildSurfaceUrl: (origin: string, path: string) => origin + path,
      };
      if (name.includes("useDialogFocus")) return { useDialogFocus() {} };
      if (name.includes("NotificationAuthorityControl")) return {
        __esModule: true,
        default: "notification-controls",
        EMPTY_NOTIFICATION_AUTHORITY: { action: "none", channels: [] },
      };
      if (name.startsWith("@/components/")) return { __esModule: true, default: "test-child" };
      throw new Error(`Unexpected import ${name}`);
    }
    runInNewContext(`(function(require,module,exports){${output}\n})`, {
      window: { location: { origin: "https://co-videopro.com" } },
      fetch: async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          payload = JSON.parse(String(init.body));
          return new Promise<Response>((resolve) => { resolveRequest = resolve; });
        }
        return Response.json({ items: [{ id: "v1", version_number: 1, is_current: true }] });
      },
      setTimeout,
    })(imports, loadedModule, loadedModule.exports);
    cache.set(relative, loadedModule.exports);
    return loadedModule.exports;
  }
  const Modal = load("components/sharing/ShareModal.tsx").default;
  function render(): Element {
    cursor = 0;
    effects = [];
    const wrapper = Modal({ open: true, assetId: "fixture", assetTitle: "Fixture", onClose() {} });
    return wrapper.type(wrapper.props);
  }
  return {
    render,
    async mount() { render(); effects.forEach((effect) => effect()); await new Promise(setImmediate); },
    finish(ok = true) { resolveRequest(Response.json(ok ? { token: "fixture-token" } : { error: "Unavailable" }, { status: ok ? 200 : 503 })); },
    payload: () => payload,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function controls(node: any, disabled = false): Array<{ node: Element; disabled: boolean }> {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => controls(child, disabled));
  const inherited = disabled || (node.type === "fieldset" && node.props.disabled === true);
  const current = ["button", "input", "select", "notification-controls"].includes(node.type)
    ? [{ node, disabled: inherited || node.props.disabled === true }] : [];
  return [...current, ...controls(node.props?.children, inherited)];
}

for (const ok of [true, false]) {
  test(`share settings cannot drift during creation; controls recover after ${ok ? "success" : "failure"}`, async () => {
    const app = harness();
    await app.mount();
    const before = controls(app.render());
    const download = before.find(({ node }) => node.props["aria-label"] === "Allow downloads")!;
    assert.equal(download.disabled, false);
    const create = before.find(({ node }) => node.props.children === "Create link")!;
    const pending = create.node.props.onClick();
    const during = controls(app.render());
    const settings = during.filter(({ node }) => node.props["aria-label"] !== "Close share modal");
    assert.ok(settings.length > 10, "exercise recipient, version, permissions, purpose and notification controls");
    assert.deepEqual(settings.filter((control) => !control.disabled).map(({ node }) => node.type), [],
      "all settings and submit controls must be disabled until the request settles");
    assert.equal(app.payload().download_enabled, false);
    assert.deepEqual(app.payload().notification, { action: "none" });
    app.finish(ok);
    await pending;
    const after = controls(app.render());
    assert.equal(after.some(({ node, disabled }) => !disabled && node.props.children === (ok ? "Done" : "Create link")), true);
  });
}
