#!/usr/bin/env node
// CVP flagship capture harness — 1920x1200 @2x, fonts settled.
// Usage: node capture.mjs [outPath]
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = pathToFileURL(path.join(here, 'orchestration-cockpit.html')).href;
const out = process.argv[2] || path.join(here, 'cvp-orchestration-cockpit.png');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1200 },
  deviceScaleFactor: 2,
});
await page.goto(page_url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
console.log(`captured: ${out}`);
