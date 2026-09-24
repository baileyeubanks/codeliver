# FABLE — Co-VideoPro phone navigation mock

**Design comp only.** Nothing in this folder is imported by the app. The live
shell, player, auth, and review UI are untouched.

Phone target: **390 × 844** (iPhone 12/13/14 class). Chrome is the quiet
sapphire CVP language from `app/brand-tokens.css` (sapphire `#0057FF`, ink
`#040F1C`, canvas `#F7F9FC`, 12/8 radii, Inter), copied inline so the mock is
self-contained.

| State | Screenshot |
| --- | --- |
| **A — Default.** After login → Projects home. Thin bottom rail only. | `screenshots/a-default-projects-bottom-rail.png` |
| **B — Drawer open.** ☰ / More → Claude Code–style slide-in left drawer. | `screenshots/b-drawer-open-deep-tools.png` |

<p>
  <img alt="A — Projects home with bottom rail" src="screenshots/a-default-projects-bottom-rail.png" width="300" />
  &nbsp;&nbsp;
  <img alt="B — Left drawer open over Projects" src="screenshots/b-drawer-open-deep-tools.png" width="300" />
</p>

## Rationale

- **One persistent nav, not two.** A phone can't afford a permanent left rail *and* a bottom bar — that's the "feels weird" Bailey called out. The bottom rail is the only always-on navigation; the left rail exists only as a transient drawer, so it never steals horizontal space from the list or the thin player.
- **The bottom rail is the pipeline.** Five items, no more: **Projects · Brief · Shoot · Cut · Delivery.** That's where a producer lives every day, so it gets the thumb-reach position. Badges (e.g. `Cut · 3`) surface what needs you without a dashboard.
- **Projects is home.** After login you land on a scannable list of productions, not a widget dashboard. Each card carries the thin-player thumbnail, client + date, a four-segment pipeline strip, the phase named *in words* (sapphire ink only — no rainbow phase colours), and one health dot (green / amber / grey = delivered).
- **Deep tools live in the drawer.** ☰ (or an edge swipe) slides a 304 px panel in from the left over a dimmed scrim — same motion curve as the app (`240ms cubic-bezier(.2,.8,.2,1)`), respects `prefers-reduced-motion`. It holds Library, Team, Settings, and Admin — the things you visit weekly, not hourly. The rail stays put underneath so the mental model ("rail = where I work, drawer = where I configure") holds.
- **Quiet sapphire, Wistia/Wipster restraint.** Sapphire appears only as the active state, the 2 px hairline atop the app bar, the progress strip, and the mark. Everything else is white, cool-gray, ink, and hairline borders — the review surface's dark stage stays the most saturated thing on screen when you tap into a project.

## Files

- `index.html` — the interactive mock. Renders the 390 × 844 screen; on wider windows it's framed in a phone bezel. `?state=drawer` opens the drawer immediately (used for screenshot B).
- `compare.html` — both states side by side in live iframes.
- `screenshot.sh` — regenerates the PNGs with headless Chrome at 2× (780 × 1688).
- `screenshots/` — A and B captures.

## Viewing

Open `index.html` directly in a browser (no build step). Tap ☰ to open the
drawer; close with ✕, the scrim, `Esc`, or a swipe left. Edge-swipe from the
left opens it.

```bash
./mocks/cvp-phone-nav-fable/screenshot.sh          # regenerate PNGs
CHROME=/path/to/chrome ./mocks/cvp-phone-nav-fable/screenshot.sh
```

## Open questions for Bailey

- Should the rail's pipeline items be *global* views (all projects in Cut) or scoped to the last opened project? The mock assumes global with a project filter chip.
- "Field" (shoot-day tools) currently maps to **Shoot**; confirm that's the right home for releases and clearances.
- Drawer "Admin" is owner/producer-gated in the real nav model; reviewers would see Library + Team + Settings only.
