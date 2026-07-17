# Co-VideoPro — Metronic v9.5.0 Port Plan

**Date:** 2026-07-16 · **Source:** `~/Desktop/Projects/metronic-v9.5.0` (6-subagent swarm audit) · **Rule (mission §4):** Metronic is a component/pattern/token source ONLY — never IA, navigation, hierarchy, project model, or visual identity.

---

## 0. License gate (read before shipping anything)

- Metronic is **Envato/ThemeForest proprietary** — not open source. Only `LICENSE-REMINDER.txt` ships locally; it defers to the Keenthemes license page.
- Porting components/tokens into Co-VideoPro is **permitted use** (one end product), **no attribution required**.
- **Extended license is mandatory** because Co-VideoPro is (or will be) a paid product; Regular license forbids charging end users. **Action: confirm the purchase tier before any paid deployment.**
- **This repo must stay private.** Ported Metronic code may not be redistributed publicly (no public repo, no public npm package).
- `figma/Metronic_v9.5.0.fig` is a 140MB binary with no machine-readable tokens — code packages are the token source.

## 1. What the package actually is

| Subpackage | Value to us |
|---|---|
| `metronic-tailwind-react-demos/typescript/nextjs` | Richest component source (Next 16 + React 19 + TanStack Table/Query, dnd-kit) |
| `metronic-tailwind-react-concepts/typescript/nextjs` | 7 mini-apps (mail, crm, todo, store-inventory, calendar, real-estate, ai) — interaction archetypes |
| `metronic-tailwind-html-demos/dist` | Monolithic built HTML — CSS technique reference only (class-level, no JS) |
| `metronic-tailwind-html-starter-kit/src` | Token config (98 lines) + ~330 lines of hand-written utilities; primitives live in an absent ktui package |
| `metronic-tailwind-nextjs-landings/saas`, `react-starter-kit` | Next 16 + next-themes + Tailwind v4 integration skeletons |
| `figma/` | Visual reference only |

## 2. Port priorities

### Wave 1 — token & utility layer (cheap, done first)

- [x] **Dense type tokens** `--text-2sm` (0.8125rem) / `--text-2xs` (0.6875rem) — professional density Tailwind lacks. From `html-starter-kit/src/css/config.ktui.css:93-98`. → `app/globals.css` (ported as utility classes)
- [x] **Derived radius scale** (calc offsets from one `--radius`). Same source. → `app/globals.css`
- [x] **Scrollable utility family** (thin/hover-reveal scrollbars) `html-starter-kit/src/css/components/scrollable.css` → adapted into `app/globals.css`
- [x] **Cross-browser range/slider styling** `components/range.css` (for scrub/volume controls) → adapted
- [x] **`@custom-variant` state idiom** (state-as-utility-prefix) — adopted as our own `data-state` selectors

### Wave 2 — interaction archetypes (port with our data layer)

| Element | Source path (react-demos/concepts nextjs) | Maps to | Effort |
|---|---|---|---|
| **DataGrid family** (~1,700 lines: server-driven mode, faceted filters, column visibility, row select, dnd) | `react-demos/typescript/nextjs/components/ui/data-grid*` | Assets, deliverables, crew, contacts tables | M |
| **Mail master/detail queue** (selected-row state, hover actions, reading pane) | `react-concepts/nextjs/app/mail/` + `components/layouts/mail/` | Review inbox: version → preview → approve/request-changes | M |
| **Kanban primitive** (dnd-kit, drag overlay, keyboard) | `components/ui/kanban.tsx` (523 lines) | Production stage board (ingest→edit→review→delivery) | M |
| **Wide edit sheet** (~940px, scroll body, sticky summary) | `store-admin/components/create-shipping-label-sheet/` | Asset/deliverable detail editing over lists | S |
| **Track-shipping stepper sheet** | `store-inventory/components/track-shipping-sheet.tsx` | Per-deliverable stage tracker drawer | S |
| **CRM record tabs** (activity/files/notes/tasks + threads) | `app/crm/company/company-records-*.tsx` | Client project room | M |
| **Activity timeline** (16 event variants) | `components/partials/activities/` | Project activity feed | S |
| **Upload hook + multi-file progress** (387 + 552 lines) | `hooks/use-file-upload.ts`, `store-inventory .../product-form-image-upload.tsx` | Ingest uploader (adapt onto our tus flow) | S–M |
| **Hover-scrub asset cards** | `real-estate/pages/card.tsx` | Video preview-on-hover in asset grids | S |
| **Tree primitive** | `components/ui/tree.tsx` (161 lines, @headless-tree) | Bins/folders browser | S |
| **Search dialog / notifications sheet / chat sheet** | `app/components/partials/{dialogs/search,topbar}` | We have equivalents; mine for states | S |

### Wave 2 — CSS techniques from html-demos (class-level only; re-implement in React)

- **Floating drawer**: `kt-drawer-end` with `top-5 bottom-5 end-5 rounded-xl` inset — media inspector / activity panel geometry.
- **Context menu on cards** (`kt-context-menu`, `search-results-grid.html:2753`) — right-click asset actions; differentiator for a pro tool.
- **Sticky header border-on-scroll** (`data-kt-sticky-class`) — polish for dense pages.
- **Datatable density**: fixed 60px rails, two-line cells, `kt-badge-dot`, icon-only ghost actions, `kt-scrollable-x-auto`.
- **Empty-state recipe**: dual-theme illustration + heading + subline + single CTA (py-9 gap-5). Keep our art, adopt geometry.

### Small ports on demand

`ui/sonner.tsx` (theme-synced toaster, 15 lines), `hooks/use-mounted.ts`, `use-mobile.tsx`, `use-copy-to-clipboard.ts`.

## 3. Explicitly skipped (anti-targets)

- All nav/layout chrome, 39 demo layouts, mega-menus, sidebar variants — **identity/IA is ours**.
- Dashboards demo1–5, stat-card marketing grids, store-client e-commerce, public-profile personas, auth pages.
- Imperative KTUI JS (`data-kt-*`, `KTComponent` widgets) — fights React 19; ideas only.
- Plugin skins (fullcalendar, apexcharts, leaflet, dropzone, date-picker), keenicons.
- `components/ui/file-upload.tsx` (0-line stub), card primitive (hollow shell), `zod` v3, `framer-motion` (use `motion` if ever), `next lint` (removed in Next 16), `generateMetadata` in client files (invalid pattern).

## 4. Port rules (standing)

1. Interaction structure and CSS technique port; **their routes, menus, page inventory never do**.
2. Re-theme every port to our tokens (`--ink/--muted/--accent/--cockpit-*`), not their zinc palette.
3. Wire every port to the real data layer (record store / API) — Metronic mocks never ship.
4. Keep this repo private (license), and verify **Extended** tier before charging users.
