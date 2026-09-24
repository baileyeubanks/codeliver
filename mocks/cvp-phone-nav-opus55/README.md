# Co-VideoPro nav — design comp (Opus 5.5)

Design comp only. Nothing here is imported by the app, and the live app shell, player, auth, and review UI are untouched. The phone and desktop mocks share one information architecture: Projects is home, the pipeline is Brief → Shoot → Cut → Delivery, and deep tools (Library, Team, Settings, Admin) sit one step away.

| Mock | State | Screenshot |
| --- | --- | --- |
| Phone (`index.html`) | A: Projects home with a thin bottom rail | `A-projects-bottom-rail.png` (390×844) and `@2x` |
| Phone (`index.html#drawer`) | B: hamburger opens the slide-in left drawer | `B-drawer-open.png` (390×844) and `@2x` |
| Desktop (`desktop.html`) | A: Projects hub with the thin left tools rail | `desktop-A-projects-hub.png` (1440×900) and `@2x` |
| Desktop (`desktop.html#project`) | B: inside a project, with pipeline steps and the player | `desktop-B-inside-project.png` (1440×900) and `@2x` |

On the phone, the hamburger opens the drawer, and the scrim, the panel button, or Esc closes it. On desktop, clicking the Northwind card opens the project and the Projects rail item or breadcrumb goes back. The hash URLs render each state directly.

## Rationale (phone)

1. **Projects is home.** After login you land on a Projects list with search, filters, a four-segment pipeline meter, and a due-date health dot, not a widget dashboard. The meter is sapphire-only and each phase is named in words, so health keeps its own colour and there is no rainbow.
2. **One persistent nav per axis.** A phone gets a single always-visible bar, the thin bottom rail, and no left column. That removes the "rail plus bottom bar" double chrome while keeping everything in the thumb zone.
3. **The rail is the pipeline.** Five slots at most: Projects, then Brief, Shoot, Cut, and Delivery, separated by a hairline divider. From home each stage tab shows work across projects at that stage; inside a project it jumps to that stage. The only badge is a count of cuts waiting for review.
4. **Deep tools live in a Claude Code–style drawer.** Library, Team, Review links, Templates, Recent projects, Settings, Billing, and an owner-only Admin group sit in a 314px sheet that slides in on a `cubic-bezier(0.32, 0.72, 0, 1)` curve. The page nudges 28px right under a soft scrim, and there is a panel-toggle close button, a workspace switcher, and an account footer. It stays out of the way until you ask for it.
5. **Quiet sapphire chrome that leaves the player alone.** Colours are white and `#f7f9fc` surfaces with `#0057ff` used only for the active tab, primary action, and badge, set in Inter with 8/12px radii, mirroring `app/brand-tokens.css`. The rail is 54px plus the safe area and never overlays video. Inside the player or review view it can hide so the thin player and click-to-comment keep the full height.

## Rationale (desktop)

1. **One persistent nav, on the left.** A 72px icon-and-label rail holds global tools only: Projects, Library, Team, and Reviews at the top, with Admin, Settings, and the account at the bottom. There is no bottom bar on desktop; the dual-nav problem only exists on phones.
2. **Login lands on the Projects hub.** A four-column card grid with a 16:9 thumbnail, a version tag, a "Needs review" flag, the pipeline meter plus stage name, and a due-date health dot. The filter chips reuse the pipeline stages, so the phone's stage tabs map to desktop filters.
3. **The pipeline lives inside the project, not in the chrome.** Brief, Shoot, Cut, and Delivery appear as a quiet stepper under the project title. Done steps get a sapphire check, the current step gets an underline, and each step carries a short status ("v3 in review", "4 masters"). The stepper is both progress and in-project navigation.
4. **The player gets the room.** The Cut view gives the frame most of the width with a single 44px control strip. Timeline dots match comment timecodes, a pin marks the selected comment on the frame, and a dashed ghost pin with a hint shows click-to-comment. The comments panel on the right is a fixed 360px with the composer at the frame's timecode.
5. **Same quiet sapphire as the phone.** White and `#f7f9fc` surfaces, `#0057ff` only for the active rail item, the current step, pins, and primary buttons, Inter with 8/12px radii. Health colours (green, amber, red) stay separate from phase, which is always named in words.
