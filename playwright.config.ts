import { defineConfig, devices } from "@playwright/test";

/**
 * Co-VideoPro E2E harness (docs/COVIDEOPRO_IMPROVEMENT_LOOP.md — G4).
 *
 * Runs against the local demo-mode dev server (no Supabase env vars). The
 * parent process owns the server on http://localhost:4115 — this config never
 * starts or stops one.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  // Next.js dev compiles routes on first hit — leave headroom.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:4115",
    navigationTimeout: 60_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
