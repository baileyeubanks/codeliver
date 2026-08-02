# Lane 2 — Theme Conflict Audit (READ-ONLY)

**Date:** 2026-07-25 · **App:** http://localhost:4103 (running) · **Truth app (design donor):** http://localhost:4321
**Rule compliance:** no existing file was edited; no git/DB/dependency mutations. New files only under `audit/`: `audit/scripts/measure.mjs`, `audit/shots/theme-compare-*.png`, this section.

## 0. The open conflict (documented, not resolved)

| Position | Source | Palette |
|---|---|---|
| **A. Dark graphite editorial** | `docs/COPROVIDEO_DESIGN_BIBLE.md` ("binding on every shipped surface"; tranche 3 = migrate light-admin → graphite) | `--graphite #121417`, `--charcoal #1a1d21`, `--ivory #f2ede2`, `--cobalt #4a7dff`, `--sage #7fa88c`, `--amber-cp #c98a3d`, `--crimson #a14a4a` |
| **B. Cool light** | Truth app (localhost:4321): "app chrome always light; dark confined to media/player chrome/thumbnails" | canvas `#F7F9FC`, surface `#FFFFFF`, primary `#2E6BF0`, text `#0F172A` |
| **C. Current live state** | Measured (§2): warm **cream/parchment** light (`#f0ebe0` / `#faf6ef` / navy `#1e4d8c`) — matches **neither** A nor B | cream editorial |
| Owner signal | 2026-07-25: *"I do like the look and light feel of the other one with the white and blue."* | → B |

The app is stranded: the Bible demands dark, the live build is warm-cream light, and the owner's latest stated preference is a *cool* light that the live build also does not match (warm cream ≠ cool white; navy `#1e4d8c` ≠ blue `#2E6BF0`).

## 1. Token inventory

All runtime tokens live in **`app/globals.css`** (5,997 lines). Tailwind v4 (`tailwindcss ^4.2.1`, `postcss.config.mjs` → `@tailwindcss/postcss`) is utility-only; no tailwind.config theme tokens. Three parallel token families exist:

### Family 1 — Cream editorial (what actually renders)
`:root` at `app/globals.css:8-51`:
- `--bg: #f0ebe0` (:9), `--bg-elevated/--surface: #faf6ef` (:10-11), `--surface-2: #f3ede0` (:12), `--surface-3: #ece4d3` (:13)
- `--ink: #0b1928` (:16), `--ink-secondary: #2c3a4d` (:17), `--muted: #5f6b78` (:18), `--dim: #8a7f6c` (:19)
- `--accent: #1e4d8c` (:23), `--accent-hover: #2861ab` (:24), `--blue: #3a6db0` (:27)
- `--orange: #c4722a` (:30), `--red: #a14a4a` (:32), `--green: #5b7a5e` (:39), plus radii/shadows (:40-50)
- Header comment (:4-6): *"Default: warm cream, parchment cards, deep navy ink, sapphire signal. Dark is opt-in (stage surfaces only), never the shell."* — directly contradicts the Bible.

### Family 2 — Bible graphite (defined, gated, never activated in app shell)
- `html[data-theme="dark"]` block, `app/globals.css:54-99`: dark overrides of family-1 names (`--bg #121417` :55, `--surface #1a1d21` :57, `--ink #f2ede2` :62, `--accent #4a7dff` :69, `--green #7fa88c` :85 …). **No code anywhere sets `data-theme="dark"`** — grep across `app/ components/ lib/ packages/` finds the selector only at `app/globals.css:54`. The live `<html>` carries `data-theme="light"` (measured, §2).
- Bible material tokens `:root`, `app/globals.css:5589-5602`: `--graphite #121417` (:5590), `--charcoal #1a1d21` (:5591), `--charcoal-2 #22262b` (:5592), `--ivory #f2ede2` (:5593), `--ivory-dim #b8b2a4` (:5594), `--stone #2a2e34` (:5595), `--midnight #0a0d12` (:5596), `--cobalt #4a7dff` (:5597), `--sage #7fa88c` (:5598), `--amber-cp #c98a3d` (:5599), `--crimson #a14a4a` (:5600), `--hairline-cp` (:5601), `--chrome-edge` (:5602). Used mainly by `.cv-*` media components and `app/welcome/page.tsx` (:41,62).
- Stage palette `:root`, `app/globals.css:5648-5660` (`--stage-*`).

### Family 3 — Cockpit porcelain (per-component overrides)
`.cockpit-shell`, `app/globals.css:2947-2959`: `--cockpit-accent: #1e4d8c` (:2949), `--cockpit-ink: #0b1928` (:2952), `--cockpit-panel: #ffffff`, `--cockpit-canvas: #f5f3ec`. 159 `var(--cockpit-*)` references across `components/cockpit/*.module.css`, each with hardcoded light fallbacks (e.g. `var(--cockpit-border, #dfe4ec)`). `components/review/PublicReviewWorkspace.module.css:5-7` re-declares its own `--bg/--surface` locally.

## 2. Measured reality (Playwright getComputedStyle)

Script: `node audit/scripts/measure.mjs` (output verbatim below, run 2026-07-25). Auth = demo button, no credentials. `/review/[token]` not reachable without a share token (route exists at `app/review/[token]/page.tsx`).

| Surface | body bg | card bg | primary btn | text | `data-theme` |
|---|---|---|---|---|---|
| `/` (demo) | `rgb(240,235,224)` = **#f0ebe0** | `#faf6ef` | `rgb(30,77,140)` = **#1e4d8c** / #fff | `#0b1928` | `light` |
| `/projects` | #f0ebe0 | (sidebar #faf6ef) | #1e4d8c | #0b1928 | `light` |
| `/library` | #f0ebe0 | — | #1e4d8c | #0b1928 | `light` |
| `/field` | #f0ebe0 | — | #1e4d8c | #0b1928 | `light` |
| truth `/` | `rgb(247,249,252)` = **#F7F9FC** | ≈#F9FBFD | `rgb(46,107,240)` = **#2E6BF0** | **#0F172A** | — |

**Distance (Euclidean in RGB, lower = closer):**

| Pair | bg Δ | accent Δ | text Δ |
|---|---|---|---|
| Live vs (a) Bible dark (`#121417`/`#4a7dff`/`#f2ede2`) | **≈375** (polar opposite) | ≈135 | ≈325 (inverted) |
| Live vs (b) truth light (`#F7F9FC`/`#2E6BF0`/`#0F172A`) | **≈32** (warm vs cool cast) | ≈106 (navy vs royal blue) | **≈5** (text already matches) |

Verdict: structurally the live app is already a light app; the gap to B is a *re-hue* (cream→cool white, navy→blue), while the gap to A is a full inversion.

## 3. Hardcoded color literals

- `app/globals.css`: 235 hex matches + 139 `rgb()/hsl()` (many are token definitions, but dozens are one-off literals in rules).
- CSS modules: **422** hex-literal lines across `components/**/ *.module.css`.
- TS/TSX source: **77** hex literals (excluding `app/api`), incl. inline `style={{}}` props.
- Total files containing color literals (app+components, excl. api): **27**; including rgba: **30**.

**10 worst offenders** (count = hex-literal lines):
1. `app/globals.css` — 235 (e.g. `.badge-approved` `rgba(34,197,94,.2)/#4ade80` :708; `.review-player-area background:#000` :804)
2. `components/cockpit/CoProduceLifecycleDrawer.module.css` — 84 (e.g. `:27 var(--cockpit-border, #dfe4ec)`)
3. `components/cockpit/CockpitReviewTimeline.module.css` — 65 (`:11 var(--cockpit-panel, #ffffff)`)
4. `components/cockpit/CockpitToolbar.module.css` — 43 (`:10 background: rgba(255,255,255,0.97)`)
5. `components/review/PublicReviewWorkspace.module.css` — 36 (`:5-7` local token re-declaration)
6. `components/navigation/WorkspaceNavigation.module.css` — 30 (`:25 color: var(--ink, #18223e)`)
7. `app/api/analytics/export/pdf/route.ts` — 25 (PDF output, likely exempt)
8. `components/cockpit/VersionCompareDock.module.css` — 23
9. `components/projects/ProjectCockpit.module.css` / `components/navigation/CommandPalette.module.css` — 21 each
10. `components/auth/IdentitySettings.tsx` — 12 (swatch palette `:50-52`); plus `components/review/InternalAssetReviewPage.tsx:197,201,210` Tailwind arbitrary values `bg-[#f0ebe0]`, `border-t-[#1e4d8c]` (asserted by test, §5).

**Lint rule forbidding literals: NO.** `eslint.config.mjs` contains only `next/core-web-vitals` + `next/typescript` + ignores — no color/hex restriction. (The truth app forbids them entirely.) The only enforcement here is inverse: `tests/exterior-states.test.ts:44` asserts the error page does **not** contain `#0f172a|#f1f5f9|#94a3b8` (slate — i.e. it actively guards *against* the truth-app palette).

## 4. Theme-hostile surfaces (stay dark in EITHER direction)

- `.review-player-area` `background: #000` — `app/globals.css:800-806`
- `.player-container` `background: #000` — `app/globals.css:853-861`
- `.card-media-overlay`/`duration` chips `rgba(0,0,0,…)` — `app/globals.css:645,657`
- `PublicReviewWorkspace.module.css` `.media { background: #050505 }` — pinned by `tests/public-recipient-review-shell.test.ts:45`
- `.cv-media-thumb` / `.cv-project-card__media` `var(--midnight,#0a0d12)` — `app/globals.css:5492,5533` (Bible "video wells")
- Annotation pins over video `border: 2px solid #fff` — `app/globals.css:945`
- Manifest/JSON `<pre>` viewers `#0b0f14` — `components/projects/ProjectRecordSections.tsx:555,1190`

These are content/media surfaces; both the Bible (`--midnight` wells) and the truth app ("dark confined to media/player chrome/thumbnails") agree they stay dark. Any migration cost should exclude them.

## 5. Costed comparison — three options (question for the owner, no recommendation)

Real counts from §3: ~27 files with literals (excl. `app/api`), 422 module-css hex lines, 77 tsx hex literals, ~235+139 in globals.css; 138 `var(--bg/surface/ink/accent)` usages in globals.css.

### Option A — Go dark per Bible (tranche 3)
- **Files touched:** ~30+ (globals.css :root flip or activate `[data-theme="dark"]` on shell; every cockpit module fallback `#dfe4ec/#ffffff/#18223e` becomes wrong-on-dark; Welcome/auth already dark-adjacent).
- **Effort: XL.** The dark token block *exists* (`globals.css:54-99`) so the base flip is cheap, but: 159 `var(--cockpit-*, <light fallback>)` fallbacks, `PublicReviewWorkspace.module.css:5-7` local light re-declarations, and white-on-cream assumptions in TSX inline styles all silently break.
- **Risk: high.** Breaks `tests/public-recipient-review-shell.test.ts:43` (asserts `--surface: #ffffff`), `tests/internal-review-canonical-route.test.ts:131` (asserts `bg-[#f0ebe0]`), `tests/cockpit-review-timeline.test.ts:233-234` + `tests/co-produce-lifecycle-drawer.test.ts:114-116` (assert light cockpit fallbacks `#dfe4ec`/`#18223e` — these pass only if fallbacks stay, which then look wrong dark), `tests/covideopro-documents.test.ts:107-108` (document cover `#ffffff`/`#07090c`). Contrast re-audit needed on every badge/hairline. Directly contradicts the owner's 2026-07-25 statement.

### Option B — Go cool-light per owner's stated preference (adopt truth palette)
- **Files touched:** ~15-20. Core is ~10 lines: `:root` in `globals.css:9-39` (`--bg #f0ebe0→#F7F9FC`, `--surface #faf6ef→#FFFFFF`, `--ink #0b1928→#0F172A` (Δ≈5, nearly free), `--accent #1e4d8c→#2E6BF0`, warm ambers/dim `#8a7f6c` re-hue) + `.cockpit-shell` block `:2949-2959`. Hardcoded literals (§3) mostly stay as-is since they're already light; worst offenders would ideally be tokenized but that is optional hygiene, not required.
- **Effort: M.** It's a re-hue within the same light structure; measured distances (bg Δ32, text Δ5) confirm it.
- **Risk: low-medium.** Breaks `tests/internal-review-canonical-route.test.ts:131` (`bg-[#f0ebe0]` literal), `tests/exterior-states.test.ts:44` (currently *forbids* `#0f172a` — would need reversing), brand-contrast checks in `tests/brand-governance.test.ts` unaffected (tenant colors). Requires amending/retiring Bible tranche 3 and the `globals.css:4-6` "cream editorial law" comment. Media surfaces (§4) untouched.

### Option C — Stay (warm cream light)
- **Files touched:** 0. **Effort: S (none).**
- **Risk: none technical**, but the conflict stays open: Bible tranche 3 remains unshipped (docs/code drift), and the build contradicts the owner's most recent expressed taste. `globals.css:4-6` comment already contradicts the Bible today.

**Question for the owner:** the Bible says dark, you said you like the other app's white-and-blue light, and the app is currently a third thing (warm cream). Which is canonical — (A) dark graphite per the Bible, (B) cool light like the truth app, or (C) current cream? If B, should the Bible be amended (tranche 3 retired) and should `tests/exterior-states.test.ts`'s anti-slate guard be reversed?

## 6. Side-by-side screenshots

- `audit/shots/theme-compare-app-home-1440x900.png` — live app home: cream canvas, parchment cards, navy Upload button
- `audit/shots/theme-compare-app-projects-1440x900.png`
- `audit/shots/theme-compare-app-library-1440x900.png`
- `audit/shots/theme-compare-truth-home-1440x900.png` — truth app home: cool white canvas, white cards, royal-blue primary
- Prior smoke shots: `audit/shots/smoke-1440x900.png`, `smoke2-375x812.png`

Visual read: same information architecture family, different temperature — warm/cream/navy vs cool/white/blue. Neither is dark.
