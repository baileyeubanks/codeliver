import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import React, { type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { hashShareLinkPassword } from "../lib/sharing/share-link-settings.ts";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function transpileTsModule(modulePath: string): string {
  return ts.transpileModule(readFileSync(modulePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: modulePath,
  }).outputText;
}

function evaluateModule(output: string, mockRequire: (specifier: string) => unknown) {
  const loadedModule = { exports: {} as Record<string, unknown> };
  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${output}\n })`,
  ) as (
    loader: typeof mockRequire,
    moduleRecord: typeof loadedModule,
    exports: Record<string, unknown>,
  ) => void;
  evaluate(mockRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);

function loadSettingsModule() {
  return evaluateModule(
    transpileTsModule(resolve(repositoryRoot, "lib/sharing/share-link-settings.ts")),
    () => {
      throw new Error("share-link-settings.ts must stay dependency-free");
    },
  );
}

function loadReceiptsModule() {
  return evaluateModule(
    transpileTsModule(resolve(repositoryRoot, "lib/sharing/share-view-receipts.ts")),
    () => {
      throw new Error("share-view-receipts.ts must stay dependency-free");
    },
  );
}

function loadComponent(
  relativePath: string,
  extraMocks: Record<string, unknown> = {},
): { default: ComponentType<never> } {
  const settingsModule = loadSettingsModule();
  const receiptsModule = loadReceiptsModule();

  function mockRequire(specifier: string): unknown {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") {
      return { Eye: Icon, X: Icon, Lock: Icon, Clock: Icon };
    }
    if (specifier === "@/lib/sharing/share-link-settings") return settingsModule;
    if (specifier === "@/lib/sharing/share-view-receipts") return receiptsModule;
    if (specifier in extraMocks) return extraMocks[specifier];
    throw new Error(`Unexpected import in ${relativePath}: ${specifier}`);
  }

  return evaluateModule(
    transpileTsModule(resolve(repositoryRoot, relativePath)),
    mockRequire,
  ) as unknown as { default: ComponentType<never> };
}

test("ShareWatermark tiles the reviewer identity at low opacity without intercepting input", () => {
  const watermark = loadComponent("components/sharing/ShareWatermark.tsx");
  const markup = renderToStaticMarkup(
    React.createElement(watermark.default, {
      reviewerLabel: "morgan@ica.example",
      timestamp: "2026-07-25T12:00:00.000Z",
    } as never),
  );

  assert.match(markup, /data-testid="share-watermark"/);
  assert.match(markup, /aria-hidden="true"/);
  assert.match(markup, /pointer-events:none/);
  // Tiled: the identity shows up many times, not once.
  const occurrences = markup.split("morgan@ica.example").length - 1;
  assert.ok(occurrences >= 8, `expected a tiled watermark, saw ${occurrences} tiles`);
  // Low opacity so the review stays watchable.
  assert.match(markup, /opacity:0\.0?[0-9]/);
});

test("SharePasswordGate renders a real brand form — password input, submit, honest demo note", () => {
  const gate = loadComponent("components/sharing/SharePasswordGate.tsx");
  const markup = renderToStaticMarkup(
    React.createElement(gate.default, {
      shareName: "ICA roadshow final",
      passwordHash: hashShareLinkPassword("cvp-review-2026"),
      onUnlock: () => undefined,
    } as never),
  );

  assert.match(markup, /data-testid="share-password-gate"/);
  assert.match(markup, /type="password"/);
  assert.match(markup, /<button[^>]*type="submit"/);
  assert.match(markup, /Open review/);
  assert.match(markup, /ICA roadshow final/);
  assert.match(markup, /Protected review link/);
  // Honesty: the gate admits being a browser-local demo, not real security.
  assert.match(markup, /not production-grade security/);
});

test("SharePasswordGate is a form, never an alert()", () => {
  const source = readFileSync(
    resolve(repositoryRoot, "components/sharing/SharePasswordGate.tsx"),
    "utf8",
  );
  assert.equal(source.includes("alert("), false);
  assert.match(source, /onSubmit=\{handleSubmit\}/);
  // Wrong attempts verify against the stored fingerprint, not a plaintext.
  assert.match(source, /verifyShareLinkPassword/);
});

test("ShareLinkExpired tells the truth: expired, dated, no fake grace", () => {
  const expired = loadComponent("components/sharing/ShareLinkExpired.tsx");
  const markup = renderToStaticMarkup(
    React.createElement(expired.default, {
      shareName: "CERAWeek speaker cuts",
      expiresAt: "2026-07-20T12:00:00.000Z",
    } as never),
  );

  assert.match(markup, /data-testid="share-link-expired"/);
  assert.match(markup, /This review link has expired/);
  assert.match(markup, /CERAWeek speaker cuts/);
  assert.match(markup, /July 20, 2026/);
  assert.match(markup, /Expired links do not reopen/);
});

test("ShareSettingsDialog renders every setting with honest states plus receipts", () => {
  const record = {
    settings: {
      name: "Client review — roadshow final",
      allow_approvals: true,
      current_version_only: true,
      enable_downloading: false,
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
      has_password: true,
      password_hash: hashShareLinkPassword("cvp-review-2026"),
    },
    receipts: [
      { id: "r2", viewer_label: "Morgan (ICA)", viewed_at: new Date().toISOString() },
      { id: "r1", viewer_label: "Anonymous viewer", viewed_at: new Date(Date.now() - 60_000).toISOString() },
    ],
  };
  const dialog = loadComponent("components/sharing/ShareSettingsDialog.tsx", {
    "@/lib/sharing/share-link-store": {
      readShareLinkRecord: () => record,
      saveShareLinkSettings: () => {
        throw new Error("save is not exercised by a static render");
      },
    },
  });
  const markup = renderToStaticMarkup(
    React.createElement(dialog.default, { shareToken: "demo-ica-final" } as never),
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /Share link settings/);
  assert.match(markup, /value="Client review — roadshow final"/);
  // Every model setting has a visible, honest control.
  assert.match(markup, /Allow approvals/);
  assert.match(markup, /Enable downloading/);
  assert.match(markup, /Password protection/);
  assert.match(markup, /Link expiry/);
  // current_version_only is marked as the honest stub it is.
  assert.match(markup, /Current version only/);
  assert.match(markup, /Applies when versions exist/);
  assert.match(markup, /Coming with P19/);
  // Expiry countdown is shown for the saved expiry.
  assert.match(markup, /data-testid="share-expiry-countdown"/);
  assert.match(markup, /Expires in 3 days/);
  // Receipts: count + latest viewers, labeled as local preview.
  assert.match(markup, /2 views recorded/);
  assert.match(markup, /Morgan \(ICA\)/);
  assert.match(markup, /local preview, this browser only/);
  // Existing password is kept unless replaced — no plaintext anywhere.
  assert.match(markup, /blank keeps current/);
  assert.equal(markup.includes("cvp-review-2026"), false);
});

test("ShareSettingsDialog without a record shows defaults and an empty receipt state", () => {
  const dialog = loadComponent("components/sharing/ShareSettingsDialog.tsx", {
    "@/lib/sharing/share-link-store": {
      readShareLinkRecord: () => null,
      saveShareLinkSettings: () => {
        throw new Error("save is not exercised by a static render");
      },
    },
  });
  const markup = renderToStaticMarkup(
    React.createElement(dialog.default, {
      shareToken: "demo-ceraweek-cuts",
      shareName: "CERAWeek cuts",
    } as never),
  );

  assert.match(markup, /No views recorded yet/);
  assert.match(markup, /No expiry/);
  assert.equal(markup.includes("share-expiry-countdown"), false);
});
