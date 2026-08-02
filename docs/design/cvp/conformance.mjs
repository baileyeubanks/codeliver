#!/usr/bin/env node
// Deterministic brand-conformance gate for CVP surfaces.
// Machine-checks the rendered DOM against CO_VIDEOPRO_CANON.md colour + type law.
// Complements audit.mjs (geometry/contrast); this one checks BRAND discipline.
//
// Usage: node conformance.mjs [path/to/page.html]
// Exit 0 = zero violations. Exit 1 = violations found.

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] || path.join(here, 'orchestration-cockpit.html');
const pageUrl = pathToFileURL(target).href;

// ── Canon law (CO_VIDEOPRO_CANON.md §2) ──────────────────────────────
const CANON = {
  sapphire: '#0057FF', deepBlue: '#0033A0', gradFrom: '#0003CC', sky: '#4DA3FF',
  pale: '#BCC2FF', ice: '#EAF2FF', ink: '#040F1C', slate: '#1A2233',
  gray700: '#334155', gray500: '#8B94A3', gray300: '#CBD5E1',
  gray100: '#F1F5F9', white: '#FFFFFF', canvas: '#F7F9FC',
  green: '#16A34A', amber: '#F59E0B', red: '#DC2626',
};
// Gray-500 is dots/icons/dividers only — never text (3.0:1 on white).
const TEXT_FORBIDDEN = new Set([CANON.gray500.toLowerCase()]);
const ALLOWED = new Set(Object.values(CANON).map((h) => h.toLowerCase()));
// Superseded systems that must not reappear.
const BANNED = {
  '#ff6b35': 'signal-orange (superseded)',
  '#f97316': 'orange (superseded)',
  '#8b5cf6': 'violet AI accent (superseded → Sky #4DA3FF)',
  '#e82820': 'four-colour mark red (superseded)',
  '#f8b000': 'four-colour mark yellow (superseded)',
  '#08a068': 'four-colour mark green (superseded)',
  '#1060c0': 'four-colour mark blue (superseded)',
};

const rgbToHex = (s) => {
  const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (!m) return null;
  return '#' + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, '0')).join('');
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
await page.goto(pageUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const raw = await page.evaluate(() => {
  const out = { fonts: [], colours: [], gradients: [], darkFills: [] };
  const seen = new Set();
  const label = (el) => {
    const t = (el.textContent || '').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}${t ? ` "${t}"` : ''}`;
  };
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());

    out.fonts.push(cs.fontFamily);

    if (hasText) out.colours.push({ hex: cs.color, where: label(el), role: 'text' });
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)')
      out.colours.push({ hex: cs.backgroundColor, where: label(el), role: 'bg' });
    if (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none')
      out.colours.push({ hex: cs.borderTopColor, where: label(el), role: 'border' });

    const bi = cs.backgroundImage || '';
    if (bi.includes('gradient')) {
      const area = r.width * r.height;
      const key = label(el) + area;
      if (!seen.has(key)) { seen.add(key); out.gradients.push({ where: label(el), w: Math.round(r.width), h: Math.round(r.height), area: Math.round(area), css: bi.slice(0, 90) }); }
    }
    // large dark fills — dark is player chrome only
    const bg = cs.backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      const lum = (+m[1] * 0.299 + +m[2] * 0.587 + +m[3] * 0.114);
      if (lum < 60 && r.width * r.height > 40000) out.darkFills.push({ where: label(el), w: Math.round(r.width), h: Math.round(r.height), bg });
    }
  }
  return out;
});
await browser.close();

const V = [];

// 1 ── Typeface: Inter only, no Archivo
const badFonts = [...new Set(raw.fonts)].filter((f) => {
  const l = f.toLowerCase();
  if (l.includes('archivo')) return true;
  return !(l.includes('inter') || l.includes('monospace') || l === '' );
});
badFonts.forEach((f) => V.push({ rule: 'TYPE', msg: `non-Inter family in use: ${f}` }));

// 2 ── Palette: every rendered colour must be canon
const offPalette = new Map();
for (const c of raw.colours) {
  const hex = rgbToHex(c.hex);
  if (!hex) continue;
  const h = hex.toLowerCase();
  if (BANNED[h]) { V.push({ rule: 'BANNED', msg: `${h} (${BANNED[h]}) on ${c.where}` }); continue; }
  if (!ALLOWED.has(h)) {
    if (!offPalette.has(h)) offPalette.set(h, []);
    if (offPalette.get(h).length < 3) offPalette.get(h).push(`${c.role} · ${c.where}`);
  }
  if (c.role === 'text' && TEXT_FORBIDDEN.has(h))
    V.push({ rule: 'GRAY500-TEXT', msg: `gray-500 carrying text on ${c.where} (3.0:1 — dots/icons/dividers only)` });
}
for (const [h, wheres] of offPalette)
  V.push({ rule: 'PALETTE', msg: `off-canon ${h} — ${wheres.join(' | ')}` });

// 3 ── Gradient confined to the logo mark
const LOGO_MAX_AREA = 6000; // a mark, not a panel
for (const g of raw.gradients)
  if (g.area > LOGO_MAX_AREA)
    V.push({ rule: 'GRADIENT', msg: `gradient on ${g.w}×${g.h}px (${g.area}px²) at ${g.where} — logo/hero accent only` });

// 4 ── Dark surfaces are player chrome only
for (const d of raw.darkFills)
  V.push({ rule: 'DARK-FILL', msg: `large dark fill ${d.w}×${d.h} ${d.bg} on ${d.where} — dark is player chrome only` });

// ── Report ───────────────────────────────────────────────────────────
const byRule = V.reduce((a, v) => ((a[v.rule] = (a[v.rule] || 0) + 1), a), {});
console.log(JSON.stringify({
  page: target,
  violationCount: V.length,
  byRule,
  violations: V,
  observed: {
    fontFamilies: [...new Set(raw.fonts)],
    gradientElements: raw.gradients,
    distinctColours: [...new Set(raw.colours.map((c) => rgbToHex(c.hex)).filter(Boolean))].sort(),
  },
}, null, 2));

process.exit(V.length === 0 ? 0 : 1);
