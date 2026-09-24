# Peer rebuttal — Grok 4.7 nav renders (PR #32) vs FABLE (PR #31)

Frames critiqued are Grok's **confirmed** renders as attached by Blaze:
`phone-a-projects`, `phone-b-drawer`, `desktop-a-projects`,
`desktop-b-project`. FABLE's frames are the five under
`mocks/cvp-phone-nav-fable/screenshots/` (confirmed final; paths at the end).
Judged against Bailey's ten points (`DEBATE.md` §0.5) and the producer-day
tasks (`DEBATE.md` §7). Ops first, visuals second — but Bailey asked for both,
so both are here.

**Short version.** Grok's frames are the quietest of the three and that
restraint is worth stealing — especially the desktop hub as a table and the
health *word* on cards. But Grok's operating model leaves a producer unable
to see cross-job work from the bar, its confirmed phone A no longer has the
stage chips its own model depends on, and its desktop B puts a permanent
comment list under the player — the exact thing Bailey #3 kills.

---

## 1. Phone A — Projects home

| | Grok | FABLE |
| --- | --- | --- |
| App bar | ☰ · brand + "Projects" subtitle · search | ☰ · **"Projects"** title + workspace subtitle · search |
| Filters | none | Needs you · Active · Archived |
| Card | name · one "now" line · **health dot + word** · stage pill | **frame thumbnail + version tag** · name · client/date · **4-segment meter** · stage · fact · counter · health dot |
| Rail | 5 words, no badge; Cut = ▶, Delivery = box/truck | 5 words, **sapphire badge**; Cut = scissors, Delivery = paper plane |

**What Grok got right — steal it.**

- **Health as a word, not just a dot.** "Needs you", "On set", "Encoding",
  "4 notes" beside the dot tells the producer *why* the dot is that colour.
  My dot-only health is quieter but mute. Master: dot + word when health is
  anything but green; green stays a dot.
- **Zero chips by default is defensible at six projects.** Grok's list is
  calmer than mine and Bailey asked for quiet (#2). Master: chips appear
  only when the list is long enough to need them (say > 8) or collapse to a
  single "Needs you" toggle.
- **Generous card rhythm.** 72–80 px rows with one fact each read faster
  than my denser cards on a moving set. Keep my content, borrow Grok's air.

**Where Grok's A fails the producer day.**

- **No thumbnail.** In a film tool people recognise a cut by its frame, and
  the frame is the *door* to the film route (tap → state C). Grok's card
  has no door; every path to a film goes through the job page. That costs
  a tap on T1 and loses recognition on every scan.
- **No badge on Cut.** The one cheap signal that replaces a dashboard (#4)
  is gone. A client comment on any job is invisible until you open it.
- **Stage pill duplicates the meter's job but not its information.** A pill
  says "Cut"; my meter says "Cut, and two stages behind it are done". Same
  ink, more information.
- **Rail icons.** ▶ for Cut collides with the player's own play control on
  the very next screen; a shipping box for Delivery is a physical metaphor
  for a download link. Scissors and paper plane (Opus and FABLE agree).
- **Brand in the app bar.** The bar should say where you are; the brand is
  in the drawer header and the status bar already says which app this is
  (Opus's verdict, which I adopted).
- **The stage chips are gone — and Grok's model needs them.** Grok's
  operating rule is "Brief/Shoot/Cut/Delivery open the *current* job at
  that stage; with no current job they return to Projects *with that stage
  chip on*." The confirmed phone A has no chips. From this screen, with no
  job open, four of the five rail items have no defined destination. Either
  the chips come back (and duplicate the rail words 200 px above it) or the
  model changes. FABLE's queue model has no such hole: Cut is the list of
  cuts awaiting attention, from anywhere, every time.

**Shared gap (both of us):** neither phone A has a **New project** action.
Producers create productions from home. Master: `+` in the app bar right
slot (search stays), not a floating button over the rail.

## 2. Phone B — Drawer

| | Grok | FABLE |
| --- | --- | --- |
| Header | brand · "Deep tools" · ✕ | brand · workspace · ✕ |
| Groups | Library (1) · Team (1) · Settings (1) · Admin (Workspace admin → Archive, Trash) | Library (Media, Archive, Trash) · Team (Members, Clients & guests, Invites) · Settings (Workspace, Brand kit, Notifications) · Admin (Billing, Webhooks, Audit) |
| Footer | role + workspace | name · role · workspace |
| Mechanics | toggle | inert background, focus move/return, Esc/scrim, reduced-motion |

**Steal.**

- **"Deep tools" as the drawer's subtitle.** It names the contract Bailey
  described (#6) in two words. Taking it.
- **Fewer items per group.** Grok's drawer is 6 rows; mine is 12. On a phone
  the drawer should be robust when needed and *gone* when not — a shorter
  list is gone faster. Master: Team collapses to "People & roles" and
  "Clients & guests"; Settings to "Workspace settings" and "Notifications";
  Brand kit moves under Workspace settings.

**Refuse.**

- **Archive and Trash under "Workspace admin."** The live nav model gates
  both with `projects:read`. Under Admin they would disappear for every
  editor and producer who isn't an owner — and the producer hunting last
  year's cut is exactly who needs Archive. They belong under Library.
- **No focus management.** A drawer that only toggles a class is unusable
  with a screen reader and leaves keyboard focus behind the scrim. The
  master needs the mechanics (Opus agrees).
- **Role in the footer without a name.** "Producer · Content Co-op
  workspace" is a role label, not an account. A person's name belongs
  there so a shared phone on set isn't a mystery.

## 3. Desktop A — Projects hub

| | Grok | FABLE |
| --- | --- | --- |
| Rail | 54 px: Library · Team · Settings; mark = home | 68 px: **Projects** · Library · Team · Settings; mark = brand only |
| Top bar | brand · search · role chip | breadcrumb · ⌘K search · Upload · notifications |
| Hub | **table**: Project · Stage · Now · Health | **grid** of frame cards; attention + stage chips; New project |

**Steal — this is Grok's best frame.**

- **The table.** Project · Stage · Now · Health in aligned columns is the
  most scannable desktop hub of the three and it is exactly Bailey's
  "sleek, clean, aligned" (#2). Eight rows read in one glance; my grid
  needs a saccade per card. Master desktop hub: **table by default**, my
  grid as the toggle I already draw. Columns: small frame (64×36, the door
  to the film) · Project + client · Stage (word + 4-segment meter) · Now
  (the stage · fact · counter line) · Health (dot + word) · Updated.
- **Rail quietness.** Grok's rail is thinner and calmer than mine. Keep my
  labelled "Projects" item but take Grok's proportions.
- **Role chip in the account control.** "PR · Producer" tells a multi-role
  workspace who it's rendering for. Cheap, useful; take it.

**Refuse.**

- **Mark as the only route home.** There is no word "Projects" anywhere on
  Grok's desktop. Inside a job (frame B) the only way back is knowing the
  logo is a button. A producer's first week should not depend on that.
  Projects stays a labelled rail item; the mark is brand.
- **No New project, no filters, no attention signal.** The hub has one
  action: read. Producers create from here and need "Needs you" surfaced
  at 8+ jobs. Master keeps New project and the attention filter.

## 4. Desktop B — Inside a project

| | Grok | FABLE |
| --- | --- | --- |
| Header | title · client/role right-aligned | title · client · due · health word · team · Share · Request approval |
| Pipeline | four words, hairline connectors, current in sapphire | steps row: check/number · word · **one-line status**, current step tinted |
| Stage | 40 px strip labelled "Thin player" | dominant 16:9 stage, live transport placeholder, **composer born on the film at the click** |
| Comments | **list under the player** ("Review note · open") | **adjacent** comment list (canonical contract), no fixed composer |
| Extra | "This step" side panel summarising all four stages | — |

**Steal.**

- **The pipeline row's restraint.** Four words and hairlines under the
  title is as quiet as a stepper gets and honours the login story (#7)
  with no chrome. My steps row carries status per stage; Grok's carries
  nothing. Master: Grok's line weight, my one-line status.
- **Top bar shows the job title.** Inside a job, Grok's bar says "Harbor
  Light"; mine says a breadcrumb. Master: breadcrumb *ending* in the job
  title, so both wayfinding and "where am I" are served.

**Refuse — and this is the frame that fights Bailey hardest.**

- **Comments as a list under the player.** "00:12 Open on the harbor…",
  "01:04 Lower the music…" stacked beneath the stage is the **permanent
  bottom comment section under the video** that Bailey #3 kills by name.
  The canonical review contract is one adjacent rail; the composer is born
  on the film at the click. Grok's own DEBATE says "Wipster's review
  gesture is a tap on the frame at a timecode" — the frame doesn't do it.
- **The player is a 40 px strip.** "Thin player — click-to-comment stays on
  this surface" as a label is a promise, not a test. The whole point of
  desktop B is to prove the nav wraps a dominant stage without fighting it
  (#1, #2). This frame can't be judged on that.
- **"This step" panel duplicates the stepper.** It exists only because
  Grok's stepper has no status. Put status on the steps (as in mine) and
  the panel — and its 210 px of width — go back to the stage.
- **No breadcrumb, no Projects.** See §3.

## 5. Operating model — the disagreement that decides the master

Grok: stage tabs open **the current job** at that stage. FABLE (and Opus):
stage tabs are **global queues**, always. Grok frames this as "one meaning
per control"; on inspection it is the reverse.

- The queue tab has no state. Cut is the list of cuts awaiting attention
  every time it's tapped. Grok's tab reads invisible state (which job is
  current) and needs a documented fallback when there isn't one — the
  definition of a hidden mode.
- On the landing screen, Grok's rail is four redirects and one home. The
  confirmed frame removed even the chips those redirects land on.
- A cross-job badge is what lets Co-VideoPro not have a dashboard (#4).
  Grok's model cannot badge anything but the job you're in.
- Cold-launch taps (`DEBATE.md` §7): open the cut a client just commented
  on — FABLE 2, Grok 3–4 plus a scan; which briefs await sign-off — FABLE
  1, Grok 2 and it's a list of jobs, not briefs.
- Grok's model is genuinely better for an **editor inside one job all
  day**. The master gives that editor the same thing with visible scope:
  inside a project the stepper switches stages and the header names the
  job. No hidden "current job" required.

## 6. What the master takes from Grok

1. Desktop hub as an aligned **table** by default (with a small frame column).
2. **Health word** beside the dot when not green.
3. **Quiet by default**: fewer chips on phone, fewer drawer rows, thinner rail, Grok's stepper line weight.
4. **"Deep tools"** as the drawer subtitle.
5. **Role chip** in the desktop account control.
6. Job title at the end of the desktop breadcrumb.

## 7. What the master refuses from Grok

1. Job-scoped stage tabs and the redirect fallback.
2. No badge, no thumbnail, no New project.
3. ▶ for Cut, box for Delivery.
4. Brand in the phone app bar.
5. Archive/Trash under Admin.
6. Mark as the only home; no "Projects", no breadcrumb.
7. Comment list under the player; player as a labelled strip.
8. "This step" panel.
9. Drawer without focus management.

---

## FABLE renders — CONFIRMED final for the bake-off

Branch `cursor/fable-mobile-nav-mock-0b48`, PR #31. No changes made in this
round; the frames already embody every concession from `DEBATE.md` §10.

- `mocks/cvp-phone-nav-fable/screenshots/a-default-projects-bottom-rail.png` — phone A, 780×1688
- `mocks/cvp-phone-nav-fable/screenshots/b-drawer-open-deep-tools.png` — phone B, 780×1688
- `mocks/cvp-phone-nav-fable/screenshots/c-film-route-no-rail.png` — phone C (film route), 780×1688
- `mocks/cvp-phone-nav-fable/screenshots/desktop-a-projects-hub.png` — desktop A, 2160×1350
- `mocks/cvp-phone-nav-fable/screenshots/desktop-b-inside-project-left-rail.png` — desktop B, 2160×1350

The steals in §6 are master-forge items, deliberately **not** applied to
these renders so the bake-off compares what each of us confirmed.
