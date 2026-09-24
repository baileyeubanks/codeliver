# Co-VideoPro phone nav — design comp (Opus 5.5)

Design comp only. Nothing here is imported by the app, and the live app shell, player, auth, and review UI are untouched. To view it, open `index.html` in a browser. The hamburger opens the drawer, and the scrim, the panel button, or Esc closes it. Loading `index.html#drawer` renders the open state without animation.

| State | Screenshot |
| --- | --- |
| A: Projects home with a thin bottom rail | `A-projects-bottom-rail.png` (390×844) and `@2x` |
| B: hamburger opens the slide-in left drawer | `B-drawer-open.png` (390×844) and `@2x` |

## Rationale

1. **Projects is home.** After login you land on a Projects list with search, filters, a four-segment pipeline meter, and a due-date health dot, not a widget dashboard. The meter is sapphire-only and each phase is named in words, so health keeps its own colour and there is no rainbow.
2. **One persistent nav per axis.** A phone gets a single always-visible bar, the thin bottom rail, and no left column. That removes the "rail plus bottom bar" double chrome while keeping everything in the thumb zone.
3. **The rail is the pipeline.** Five slots at most: Projects, then Brief, Shoot, Cut, and Delivery, separated by a hairline divider. From home each stage tab shows work across projects at that stage; inside a project it jumps to that stage. The only badge is a count of cuts waiting for review.
4. **Deep tools live in a Claude Code–style drawer.** Library, Team, Review links, Templates, Recent projects, Settings, Billing, and an owner-only Admin group sit in a 314px sheet that slides in on a `cubic-bezier(0.32, 0.72, 0, 1)` curve. The page nudges 28px right under a soft scrim, and there is a panel-toggle close button, a workspace switcher, and an account footer. It stays out of the way until you ask for it.
5. **Quiet sapphire chrome that leaves the player alone.** Colours are white and `#f7f9fc` surfaces with `#0057ff` used only for the active tab, primary action, and badge, set in Inter with 8/12px radii, mirroring `app/brand-tokens.css`. The rail is 54px plus the safe area and never overlays video. Inside the player or review view it can hide so the thin player and click-to-comment keep the full height.
