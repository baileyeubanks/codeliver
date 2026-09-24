# Co-VideoPro nav — design comp (Opus 5.5)

Design comp only. Nothing here is imported by the app, and the live app shell, player, auth, and review UI are untouched. Phone and desktop share one information architecture: Projects is home, the pipeline is Brief → Shoot → Cut → Delivery, and deep tools (Library, Team, Settings, Admin) sit one step away. The three-way debate with Fable and Grok 4.7 is in [`DEBATE.md`](DEBATE.md). The frame-by-frame rebuttal of Grok's confirmed renders is in [`PEER_REBUTTAL_GROK_NAV.md`](PEER_REBUTTAL_GROK_NAV.md).

**Bake-off set:** the round-1 frames in this folder, listed in [`PEER_NOTE_FABLE_GROK.md`](PEER_NOTE_FABLE_GROK.md). **Forge draft:** [`master/`](master/) already contains steals from both peers and is not part of the bake-off. Its phone-3 frame still draws the withdrawn scope rule. Round-1 state C keeps a comment dock under the film, which Bailey asked to kill. That failure stays on the record rather than being fixed, so the bake-off compares confirmed sets.

| Master frame | File |
| --- | --- |
| Phone: Projects home, drawer, inside a job | `master/phone-1-projects@2x.png`, `master/phone-2-drawer@2x.png`, `master/phone-3-job-cut@2x.png` (`master/phone.html`, `#drawer`, `#job`) |
| Phone: tap the film to comment, notes sheet, guest review | `master/phone-4-film-tap-comment@2x.png`, `master/phone-5-film-notes-sheet@2x.png`, `master/phone-6-guest-review@2x.png` (`master/phone-film.html`, `#tap`, `#notes`, `#guest`) |
| Desktop: Projects hub, project at Cut | `master/desktop-1-projects-hub.png`, `master/desktop-2-project-cut.png` (`master/desktop.html`, `#project`) |

Round-1 comps:

| Mock | State | Screenshot |
| --- | --- | --- |
| Phone (`index.html`) | A: Projects home with a thin bottom rail | `A-projects-bottom-rail.png` (390×844) and `@2x` |
| Phone (`index.html#drawer`) | B: hamburger opens the slide-in left drawer | `B-drawer-open.png` (390×844) and `@2x` |
| Phone (`phone-film.html`) | C: film route, no bottom rail | `C-film-route-no-rail.png` (390×844) and `@2x` |
| Desktop (`desktop.html`) | A: Projects hub with the thin left tools rail | `desktop-A-projects-hub.png` (1440×900) and `@2x` |
| Desktop (`desktop.html#project`) | B: inside a project, with pipeline steps and the player | `desktop-B-inside-project.png` (1440×900) and `@2x` |

On the phone, the hamburger opens the drawer, and the scrim, the panel button, or Esc closes it. On desktop, clicking the Northwind card opens the project and the Projects rail item or breadcrumb goes back. The hash URLs render each state directly.

## How the nav operates, and why

### 1. The five rail items and what each does for a producer

**Each stage tab is a queue across all projects, always** (see [`PEER_NOTE_FABLE_GROK.md`](PEER_NOTE_FABLE_GROK.md), which withdraws my round-3 "scope follows the header" rule). The Cut badge stays live from every screen, so a client comment on another job is never hidden while you work. Inside a job, the header names the job, a compact stepper switches its stages, and the rail keeps the tab you came from highlighted.

| Tab | What a producer does there day to day | Live route it absorbs |
| --- | --- | --- |
| **Projects** | Scan every production sorted by what needs you, open one, start a new one. | `/projects`, replacing `/` Overview |
| **Brief** | Chase client sign-off, send the brief link, approve scope changes, turn a client request into a brief. | project Brief tab, `/requests` intake |
| **Shoot** | Today's and upcoming shoot days: call sheet, shot list, releases and clearances, upload from set. | `/field`, Milestones, Calendar |
| **Cut** | Versions waiting on review, newest comments, approvals owed. Tapping a version opens the film route. | `/reviews` |
| **Delivery** | Masters in QC, captions, approved and locked files, delivery links, anything overdue. | project Deliverables tab |

The only badge is a sapphire count of items waiting on *you*, shown on stage tabs only. Everything else in today's phone bar leaves the rail. Overview merges into Projects. Opportunities is labeled "Pipeline" in the live model, which collides with the production pipeline, so it becomes Leads, in the drawer if producers need it (an open question in `DEBATE.md`). Requests feeds the Brief queue, Reviews is the Cut queue, and Activity moves to notifications in the drawer.

### 2. Why deep tools live in a slide-in drawer, not a permanent left column

- **Thumb reach.** Held one-handed, a phone's bottom third is easy to reach and its top-left corner is the hardest. Hourly work goes on the bottom rail; weekly work (Library, Team, Settings, Admin) goes behind the top-left hamburger. For rare actions, the harder reach is intended.
- **Film first.** A 72px permanent column takes 18% of a 390px screen. Every thumbnail shrinks with it, and a 16:9 film drops from 390×219 to 318×179.
- **Cognitive load.** The rail always shows five things. The drawer shows about a dozen, but only when asked. This is the Claude Code sidebar pattern: recents and tools slide over the work surface and dismiss with a tap outside, Esc, or a swipe, and the work surface stays primary.
- **No duplicates.** The drawer never repeats a rail destination. A second route to the same place is a second thing to learn.

### 3. The player and review film route: hide the app bar

On any route where one asset plays for review, the bottom rail is hidden. That covers a version in a project's Cut stage, `/review/[token]`, and a client-portal asset. `master/phone-4` to `phone-6` show it.

- On a 390px phone the frame is 390×219. The live player keeps its controls to a roughly 6% overlay on the film (about 13px), with no deck underneath.
- The rail is 54px plus a 26px safe area: 80px, or 37% of the frame height, parked under the film. That is the dual-chrome problem again, turned vertical.
- There is no permanent comment section either. Tapping the film pauses it and opens a comment dialog at the playhead, placed below the frame so the overlay stays clear. Notes open in a sheet from a scrubber marker or the Notes pill, and the sheet goes away when you close it. Desktop keeps a collapsible notes panel *beside* the film and uses the same dialog at the pin.
- Wistia and Wipster review pages carry no app nav at all, and Wipster's comment gesture is a tap on the frame. CVP should match both.
- To leave, use the top-left back chevron, labeled with the job and stage ("‹ Northwind · Cut"), which returns you to the tab you came from. There are no app-level edge swipes on the film route: horizontal gestures belong to scrubbing and pinning. There is no hamburger here, and landscape shows only the film with its overlay.
- Desktop is different: its rail costs width, not film height, so it stays. A theater mode can still hide it.

### 4. Login lands on Projects, not a dashboard

- A producer acts on a project. A dashboard renders the same list a second, lossier way and puts the real object one tap further off.
- Every widget needs its own upkeep and becomes one more place for numbers to go stale.
- "What needs me?" is answered inside the list: the default sort puts attention first, a "Needs you" chip filters to it, and the stage badges count it.
- Every role has `projects:read`, but not every role has activity or opportunities, so Projects is the one home that works for all of them.
- The live `/` Overview ("what needs your attention across every production") would redirect to `/projects`. To resume where you left off, use Recents in the drawer rather than auto-reopening the last project.

### 5. Desktop: why the thin left rail stays, and where the pipeline shows

- A 1440×900 screen has width to spare and little height. A 72px left rail costs 5% of the width, while any top or bottom bar costs film height. So on desktop the persistent nav goes on the left.
- The rail holds global tools only: Projects, Library, Team, and Settings, with Help and the account at the foot. Admin sits behind Settings for owners. It never holds stages.
- Stages appear in two places, as one concept rendered two ways. **Across projects**, they are filter chips on the Projects hub, the same filter the phone's stage tabs apply from home. **Inside a project**, they are the step cards under the title, which do the job the phone's rail does inside a job. The phone rail isn't ported to desktop, and the desktop rail isn't ported to phone (the phone gets it as the drawer). So nothing is duplicated.
- For deep work, the rail can expand into a labeled sidebar with recents, Claude Code style, from a keyboard toggle. It is collapsed by default.

### 6. Failure modes I would refuse

- **A permanent left column and a bottom bar together on a phone.** That is two navs to the same places, 18% of the width lost, and no clear answer to "where is home?"
- **A bottom bar over the film, or stacked under it.** It undoes the 6% overlay and the tap-to-comment work, and it fights the composer for the bottom edge.
- **A guest inheriting team nav.** `/review/[token]` and the client portal show no rail, no drawer, no team names, and no other projects: just the brand, the project name, the film, comments, and Approve. Anything more leaks other clients' project names and offers tabs that end in a 403. Today `/review/[token]` and the `(review)` and `(client)` route groups already sit outside the `(dashboard)` layout that carries workspace nav; the master has to keep it that way.
- Also refused: tabs whose scope changes where you can't see it (the header must always name the scope); rainbow phase colors; a "More" tab taking a sixth rail slot; red alarm badges for routine counts; and role-gated tabs that lead to a forbidden page instead of simply not appearing.

## Visual notes

- **Phone.** Cards pair a thumbnail with a four-segment sapphire pipeline meter, the stage named in words, and one health dot (green, amber, or red). The rail has a hairline divider between Projects and the four stages. The drawer is 314px, slides on `cubic-bezier(0.32, 0.72, 0, 1)`, and nudges the page 28px under a soft scrim.
- **Desktop.** The hub is a four-column grid with version tags and "Needs review" flags. In the project view, the frame gets most of the width above one 44px control strip. Timeline dots sit at the comment timecodes, a pin marks the selected comment, and a dashed ghost pin shows click-to-comment. A 360px comments panel sits on the right.
- **Both.** White and `#f7f9fc` surfaces, with `#0057ff` only for active states, primary actions, pins, and badges. Inter with 8/12px radii, mirroring `app/brand-tokens.css`. Health colors never encode phase.
- **Where my comps lag this model.** The mocks are round-1 drawings, and several items there lose in the round-2 debate:
  - The phone drawer lists Projects and Review links (duplicates), Templates, and an ungated Billing.
  - The desktop rail has Reviews and a top-level Admin.

  `DEBATE.md` covers each, and the master drops them.
