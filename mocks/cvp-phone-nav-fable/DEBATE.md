# DEBATE — how the Co-VideoPro nav operates, and why

This is not a beauty contest. The mocks in this folder are arguments about
**how a producer moves through a production day**; pixels are the evidence,
not the claim. This file holds (1) the FABLE operating model, (2) the failure
modes I refuse, (3) the rubric every comp is scored against, (4) the
point-by-point exchange with Opus 5.5 and Grok 4.7, and (5) the master spec
I'm arguing for.

**Sources read directly from the peers' branches** (not paraphrased by a
third party):

- Opus 5.5 — `mocks/cvp-phone-nav-opus55/` on `cursor/opus55-mobile-nav-mock-5668`
  (`DEBATE.md`, `README.md`, phone A/B/C, desktop A/B).
- Grok 4.7 — `mocks/cvp-phone-nav-grok47/` on `cursor/cvp-phone-nav-mock-8e4c`
  (`DEBATE.md`, `README.md`, phone A/B, desktop A/B, and its unilateral
  `master-*` frames).

**Status of this round:** both peers argued against my README by name. Where
they were right I have **changed the FABLE comps** (see §10) so the master
has frames to diff against, not just prose. Where they are wrong I say why
and what workflow it breaks.

---

## 0. The operating model in one paragraph

A producer's day is a loop over productions at different stages: *what's
waiting on a client (Brief), what's happening on set today (Shoot), what
needs my eyes or the client's eyes on a version (Cut), what's approved and
must go out (Delivery).* The phone is for **doing the loop** — glance, tap,
act, leave. The desktop is for **working inside one production** for an
hour. So: the phone's persistent nav is the loop itself (five stops); the
tools you touch weekly (Library, Team, Settings, Admin) are one gesture away
but never on screen; the desktop keeps the tools in a thin rail because
width is cheap there and wayfinding matters more than reach; and the film —
on every device — gets the screen to itself.

---

## 1. Why the bottom rail is exactly these five, and what each does all day

The rail is **Projects + the four pipeline stages**. Not Home, not Library,
not Reviews, not Settings. Each stage stop is a *queue of work at that stage
across every production*, badged with what waits on you.

| Stop | What it is | What a producer actually does there, day-to-day |
| --- | --- | --- |
| **Projects** | The list of productions. Home. | Find a production by name/client, read its health dot and phase word, open it, create a new one. The "where am I across everything" view. |
| **Brief** | Everything pre-production: intake, scope, treatment, quote, client sign-off. | Morning: see which briefs are *awaiting client sign-off* vs *drafting*, nudge the client, approve a scope, convert an inquiry into a production. Absorbs today's Requests/Opportunities surfaces. |
| **Shoot** | The shoot day(s): call sheet, shot list, releases/clearances, card offload. | On set, one hand: check today's call sheet, tick shots as they land, capture a talent release, log offload progress, mark wrapped. This is where "Field" lives. |
| **Cut** | The review queue: versions awaiting feedback or approval, open comments. | The hot stop — badged. Open the version the client just commented on, watch the frame they pinned, reply/resolve, upload v4, request approval. The thin player + click-to-comment route opens from here. |
| **Delivery** | Approved masters, locked deliverables, share links, download receipts. | Send the final, confirm the client downloaded it, lock the version so nothing drifts, close the production. |

Why five and not four or six:

- **Five is the thumb-bar ceiling** (Apple HIG 3–5; Material 3–5). Six forces
  a "More" tab, which is a drawer wearing a tab costume.
- **One stop per stage keeps the bar isomorphic to the pipeline.** A
  producer who knows the four words knows the whole nav. Adding "Home" or
  "Reviews" breaks the isomorphism — Reviews *is* Cut, Home *is* Projects.
- **Badges make the bar a status board without a dashboard.** `Cut · 3`
  tells you where the day's work is before you tap anything. Badge colour
  is sapphire (it counts work), never red (red is health/risk in the tokens).
- **Stage tabs are global queues, always.** Tapping Cut shows every version
  awaiting feedback across all productions. Opening one pushes the project
  onto that tab's stack (iOS convention); tapping the highlighted tab again
  pops back to the queue. Inside a project, stage switching is the
  project's own stepper. *(Changed this round: I dropped the "project filter
  chip" on queues — Opus is right that the stepper already does that job.)*

---

## 2. Why deep tools live in a Claude Code–style slide drawer on phone

**Thumb reach.** One-handed use is the phone's default posture on set and in
transit. The comfortable zone is the bottom third; the top-left corner is
the hardest reach. A permanent left column puts *everything* in the hard
zone and steals width from the film. A bottom bar puts the five hourly
actions where the thumb already is; the drawer's trigger (☰, top-left) is
deliberately in the hard zone because it's a weekly action.

**Film-first.** A 64 px permanent left rail on a 390 px screen is 16 % of
width. A 16:9 film in the remaining 326 px is 183 px tall instead of 219 px —
you lose 16 % of the picture *and* of the click-to-comment target area, all
day, to hold icons you touch weekly. Wistia and Wipster never do this on
mobile; the film gets the full width.

**Cognitive load.** Hick's law: decision time grows with visible choices.
Five stops + one "More" affordance is the entire visible nav. The drawer
groups the weekly tools (Library, Team, Settings, Admin) with section labels
so they're scannable when summoned and invisible otherwise. Claude Code's
rail is the right model because it *slides over* the content rather than
pushing it — you keep your place, you can peek, and closing is one tap on
the scrim or Esc. It is reversible in 240 ms; a permanent column is a
decision you can never undo.

**How it opens.** From the ☰ button only. *(Changed this round: I removed
edge-swipe-to-open. Grok is right that a left-edge swipe collides with
scrub-and-comment on a film product, and Opus is right that the left-edge
swipe is the system back gesture. One gesture, one meaning.)*

**What the drawer is not:** it is not a second pipeline and not a second
home. If it ever grows a Brief/Shoot/Cut/Delivery section, a Projects
item, or a "Review links" item, the rail has failed.

---

## 3. What happens on the PLAYER / film route

**The app bottom bar and the app bar hide.** Rendered as **state C**
(`index.html?state=film`, `screenshots/c-film-route-no-rail.png`). When you
open a version — internal review at `/projects/[id]/assets/[assetId]` or
public review at `/review/[token]` — the screen is: compact film bar (back,
project + stage/version, share) → full-width 16:9 film with the transport
overlaid inside its bottom edge → version chip / compare → comments →
composer on the bottom edge. No Projects·Brief·Shoot·Cut·Delivery bar.

Why:

- **The bottom edge belongs to the film.** The scrub bar, the comment
  composer, and the keyboard all live at the bottom. A nav bar underneath
  the scrub bar is a collision zone: a thumb reaching for 01:46 hits
  "Delivery". Wistia and Wipster both run the player edge-to-edge with the
  timeline as the lowest control and nothing beneath it.
- **Height is the cost, not width.** The rail is 86 px with safe area; on a
  219 px-tall film that is 39 % of the frame's height given back to the
  comments list and composer.
- **The film route is a leaf, not a hub.** You arrived from Cut (or a link)
  and you'll leave via back. Persistent nav on a leaf invites mid-review
  abandonment and makes "did I finish resolving those?" a real question.
- **Guests never see the bar anyway** (see §6). Making the team route match
  the guest route means one player layout to keep the thin-player and
  click-to-comment work honest, not two.
- **Landscape / fullscreen** hides even the film bar; only the film and a
  tap-to-reveal control layer remain.

Desktop: the tools rail stays on the film route because it costs width,
not the thumb, and it is not the comment gesture. Theater mode hides it.

---

## 4. Login → Projects, not a dashboard

A dashboard answers "how is the business doing?" A producer opening the app
is asking "what do I do next?" — and the answer is always *a production at a
stage*. The Projects list, with health dot + phase word + one line of status
per card, *is* the actionable summary; every row is also the door. A
dashboard of widgets is a second, non-navigable copy of that information
that you must read and then leave.

Concretely: Projects home gets you to any production in one tap and to any
stage queue in one tap. A dashboard adds a tap to every task and adds a
surface to maintain. If leadership wants roll-ups, that's Reporting — a
drawer/rail tool, not the landing page. Chips on Projects are attention and
lifecycle only (Needs you · Active · Archived); stage filters on the phone
home would duplicate the rail one inch above it.

---

## 5. Desktop: thin left tools rail stays; pipeline inside the project

**Why the rail persists on desktop.** Width is cheap: 68 px is ~5 % of 1440,
and there is no thumb. What matters on desktop is wayfinding across long
sessions and shortcut discoverability — a rail you can always see does both.
The rail is *tools* (Projects · Library · Team · Settings), exactly the
contents of the phone drawer, so a user learns one vocabulary. Admin lives
under Settings for owners; it is not a daily icon.

**Why Projects is a labelled rail item and the mark is just the mark.** A
logo as the only route home is a discoverability failure — inside a job you
have to *know* the mark is a button. The word "Projects" costs one rail slot
and removes that guess. *(Changed this round: the mark no longer navigates.)*

**Why the pipeline moves inside the project.** Stages are attributes of a
production. On desktop you spend an hour inside one production, so the four
stages render as a quiet steps row under the project header (check / number,
name, one status line, current step tinted). The global stage queues the
phone bar provides are reachable from the hub's stage chips (and later ⌘K),
but they aren't chrome.

**How this avoids duplicating phone chrome.** No bottom bar on desktop. The
rail's active item stays **Projects** inside a project — the breadcrumb
carries depth, the rail only says which tool you're in. Nothing about the
pipeline appears in the rail, so the desktop never shows the phone's
five-stop bar rotated 90°.

---

## 6. Failure modes I refuse

1. **Permanent left rail AND bottom bar on phone.** Two persistent navs
   means two answers to "where am I". It taxes every screen for the benefit
   of none.
2. **Bottom bar over the film, or a shorter film to make room for it.** §3.
3. **Guests inheriting team nav.** A client on `/review/[token]` gets brand,
   the project name, the film, comments, and Approve — no Projects, no
   drawer, no stage tabs, no other clients' names. Team nav for a guest is
   a data-leak-shaped affordance and a trust problem (they click, they hit
   a 403).
4. **Dashboard as home.** §4.
5. **A sixth bar item, or ☰ inside the bottom bar.** "More" as a tab makes
   the drawer a peer of Cut. The drawer trigger lives in the top bar.
6. **Pipeline stages duplicated in the drawer or the desktop rail.** One
   place per concept: stages are queues on phone and steps on desktop.
7. **Phase colour as identity.** Stages are named in words; colour reports
   health (green / amber / grey). No rainbow. Badges are sapphire, not red.
8. **A drawer that pushes content** instead of sliding over it.
9. **A tab whose meaning depends on invisible state** — "the current job",
   "the last opened project". The same tap must show the same thing every
   day. This is the heart of the disagreement with Grok (§8.1).
10. **Edge swipe as nav.** Left-edge swipe is system back. It never opens
    tools, and it is never taught as a way to leave a film.
11. **A rail that changes shape by role.** A viewer gets the same five
    stops with empty queues, not a three-item bar. Predictability beats
    tidiness.

---

## 7. Rubric — workflow clarity first, looks second

Every comp gets scored on **taps from cold launch** for the same seven
tasks, then on the refusal list, then on craft. Fewer taps wins; ties broken
by whether the path is *predictable* (same route every day). Peer counts are
derived from their stated models; assumptions noted.

| # | Task | FABLE | Opus 5.5 | Grok 4.7 |
| --- | --- | --- | --- | --- |
| T1 | Open the cut a client just commented on | **2** (Cut → version) | **2** (Cut → version) | **3–4** (Projects → scan for the job¹ → job → Cut) |
| T2 | Reply to a pinned comment on that cut | 3 | 3 | 4–5 |
| T3 | Log a talent release on set | **2** (Shoot → today's shoot) | 2 | 2 if that job is "current", else 3 (Projects → job → Shoot) |
| T4 | Which briefs await client sign-off | **1** (Brief) | 1 | 2 (Projects → Brief chip) — and it's a list of jobs, not of briefs |
| T5 | Send a final and confirm download | **2** (Delivery → production) | 2 | 2–3 |
| T6 | Invite a teammate | 2 (☰ → Team) | 2 | 2 |
| T7 | Client opens a review link and comments | **1**, no nav at all | 1 | 1 |

¹ Grok's badge counts only the current job's notes, so a comment on any
other job is invisible from the bar; you find it by scanning Projects.

Then:

- **Refusals (§6):** any comp that trips one is disqualified on that axis.
- **Same-vocabulary test:** can a user describe the phone nav and the
  desktop nav with the same four stage words and the same four tool words?
- **Film test:** at 390 wide, how tall is the film in the review route, and
  what sits beneath its scrub bar?
- **Craft (last):** sapphire discipline, type hierarchy, motion.

---

## 8. The exchange — point by point

### 8.1 What a stage tab means (the central dispute)

**Grok's position:** Brief/Shoot/Cut/Delivery always open *the current job*
at that step. With no current job they redirect to Projects with that stage
chip on. A global queue is "one tab, two products" and a cross-job badge is
"a dashboard in the thumb zone".

**Opus's position (revised):** a tab is a cross-project queue and always
means the same thing; opening a project pushes it onto the tab's stack;
stage switching inside a project is the stepper. Opus's *original* README
had the dual behaviour (queue from home, chapter inside a project) and
retracted it.

**FABLE:** with Opus, and against Grok — on operations, not taste.

- **"Current job" is the hidden mode, not the queue.** Grok's tab reads
  invisible state (which job is current) to decide what to show. Grok's own
  fallback — "if no job is current, return to Projects with the chip on" —
  concedes the state exists and needs a special case. A queue tab carries
  no state: Cut is the list of cuts awaiting attention, today and every
  day. That *is* the "one meaning per control" rule Grok is defending.
- **The badge is the point.** A producer running eight productions needs
  to know that Harbor & Co commented *without opening Harbor & Co*. Under
  Grok's model the bar can only badge the job you're already in — which is
  the one job you don't need to be told about. Calling a cross-job count
  "a dashboard in the thumb zone" gets it backwards: the count is what
  lets us *not* have a dashboard.
- **On the landing screen, Grok's bar is 80 % redirects.** After login you
  are on Projects with no current job; four of five persistent stops bounce
  you back to Projects with a chip. A persistent nav whose majority does
  nothing on the home screen is not earning its 86 px.
- **T1 and T4 are the producer's most frequent morning tasks** and Grok's
  model is slower on both (§7). Grok's model is *better* for an editor who
  lives in one job all day — and the stepper inside the project gives that
  editor exactly the chapter-switching Grok wants, scoped visibly by the
  header.
- **On "one tab, two products":** the tab is always the queue. The *job
  page* is a page pushed onto it, the way a Mail thread sits on the Inbox
  tab. Tapping the highlighted tab pops to the queue. That is the iOS
  convention every producer already knows; it is not a mode.

**Concession to Opus:** my "project filter chip" on the queues is
redundant — the stepper covers "this job's other stages" and a queue
sorted attention-first rarely needs narrowing. Dropped from the comps.

**Where Grok is right inside this:** "Silence is a hidden mode" and "the
header names the job" are the right rules; they are why the project page
has a title bar and a stepper, and why we never auto-reopen the last job.

### 8.2 Edge swipe

**Grok:** edge swipe to open the drawer collides with scrub on a film
product; open from the header button only. **Opus:** uses the left-edge
swipe as *back* on the film route.

**FABLE: Grok is right, and Opus's usage is the reason.** The left-edge
swipe is the system back gesture; giving it a second meaning (open tools)
anywhere in the app is a conflict waiting for the film route. Removed
edge-swipe-to-open from `index.html`. The drawer opens from ☰, closes from
✕, scrim, or Esc. Edge swipe is never *taught* as nav — it is simply the
platform's back.

### 8.3 The film route

**Both peers:** "Fable does not decide." **Opus** drew state C (390×219 film,
6 % overlay controls, composer owns the bottom edge, no rail, no ☰).
**Grok** drew `master-phone-player.png`: a portrait dark slab, back link,
transport strip at the bottom, no comments visible.

**FABLE:** I decided in prose (§3) but a rule without a frame is a
non-decision in a design debate — fair hit. **State C is now rendered**
and matches Opus's layout in every operating respect: no rail, no ☰, film
first, transport inside the frame, comments beneath, composer on the
bottom edge, back chevron top-left. Two differences worth arguing:

- **Keep the stage/version line under the title** ("Cut · v3 · filename").
  Opus does this; Grok's back link "‹ Harbor Light · Cut" does too. Agreed
  by all three — the film bar must say which job and which stage you are
  inside, because the rail that used to say it is gone.
- **Grok's player frame fails the film test.** The film is not 16:9 and the
  comments list is absent, so T2 (reply to a pinned comment) needs another
  screen. Grok's *rule* (hide the bar) is right; the frame doesn't
  demonstrate the workflow.

### 8.4 Drawer contents

**Opus:** Recents at top (that's Claude Code's actual value), then Library
(Media, Archive, Trash), Team, Settings, Leads (producers), Admin
(owners). Opus's own comp also had New project, search, Projects, Review
links, Templates, Billing — and concedes the duplicates. **Grok:** Library,
Team, Settings, Admin (Archive and Trash nested under "Workspace admin");
no Recents ("that is Projects").

**FABLE:**

- **Archive and Trash belong under Library, not Admin — Opus is right on
  capability.** The live nav model gates both with `projects:read`, so every
  role can use them; under Admin they'd vanish for everyone who isn't an
  owner. A producer hunting last year's cut must not need admin rights.
- **No Recents on the phone — Grok is right, on taps.** The Projects tab is
  sorted by updated, so the top of Projects *is* Recents at **1 tap**;
  ☰ → Recent is **2 taps**. From deep inside another job the counts tie
  (Projects → card vs ☰ → recent). Recents in the phone drawer is never
  faster and it makes the drawer a second home — the one thing §2 says it
  must not be. On desktop, Recents in an expanded rail (Opus's keyboard
  toggle) is fine: there is no tab bar to duplicate.
- **No Projects, Review links, Templates, New project, or search in the
  drawer.** Projects and Cut are on the rail; New is on the Projects page;
  search is in the app bar. Opus already agrees.
- **Billing:** inside the owner-gated Admin group. Grok's "never in the
  daily drawer" is satisfied — it is not daily and it is not shown to
  non-owners. Not worth more words.
- **Leads/Opportunities:** in Brief (an inquiry is a brief at stage zero),
  not a drawer item and not a rail slot. Answers Opus's open question 1.

### 8.5 Chips on the phone home

**Opus:** Fable's "In review" and "Delivered" duplicate the Cut and Delivery
tabs on the same screen. **Grok's master:** All · Brief · Shoot · Cut ·
Delivery chips on the phone Projects list.

**FABLE: Opus is right; concession applied.** Phone chips are attention and
lifecycle only — Needs you · Active · Archived. Grok's stage chips on the
phone are only necessary *because* Grok's tabs aren't queues; under the
queue model they duplicate the rail 200 px above it. Stage chips belong on
the **desktop** hub, where there is no rail queue to duplicate — all three
comps already agree on that.

### 8.6 Badges and colour

**Opus:** a red "3" on Cut reads as an alarm every day; sapphire counts
work, red is health. **Grok:** no badges.

**FABLE: Opus is right; badge is now sapphire.** Grok is wrong to drop
badges — they are the cheapest signal we have and the reason no dashboard
is needed (§8.1).

### 8.7 Card anatomy

**Opus:** Fable's stage · fact · counter line is the strongest; wants
thumbnail + version tag + four-segment meter + one health dot. **Grok's
master:** no thumbnail, a stage pill, one status line.

**FABLE:** accept Opus's synthesis (it is my card plus Opus's endorsement).
Against Grok: in a film tool people recognise a cut by its frame, and the
thumbnail is also the *door to the film route* (tap the frame → state C),
which gives T1 a second, faster path from Projects. A card without a
thumbnail has no such door.

### 8.8 App bar

**Opus's verdict:** ☰ · page title · search; brand and account live in the
drawer. **Grok:** ☰ · brand · search.

**FABLE: Opus is right.** The app bar should say where you are; the brand is
in the drawer header and the status bar already says what app this is.
Removed the avatar from my app bar (account is the drawer footer). Kept
search.

### 8.9 Drawer mechanics

**Opus:** wants Fable's inert background, focus move/return, Esc + scrim
close, reduced-motion — plus its own 28 px page nudge and easing. **Grok:**
toggles only.

**FABLE:** accept the nudge as optional craft; the mechanics are the
operating part and the master should carry them. Grok's drawer has no
focus management, which matters on a phone with a screen reader.

### 8.10 Desktop rail

**Grok:** Library · Team · Settings only; the mark is home; Admin behind
Settings. **Opus:** Projects · Library · Team; Admin · Settings · account at
foot; drops its own Reviews item.

**FABLE:**

- **Projects stays as a labelled rail item; the mark is brand only.** Grok's
  master desktop has no word "Projects" anywhere on the project page and no
  breadcrumb — the only way home is knowing the logo is a button. That's a
  discoverability failure for a producer's first week. Conceded to Grok
  that the mark must not be a *second* home: it no longer navigates.
- **Admin under Settings, owners only — Grok is right;** Opus's Admin rail
  item is not a daily tool. My comp already has no Admin item.
- **No Reviews in the rail — everyone agrees.** Reviews is Cut.
- **Grok's desktop project frame doesn't test the film.** The player is a
  40 px strip labelled "Thin player"; the stepper is a text row with no
  status; there is a "This step" side panel instead of the review rail. The
  IA is right; the frame proves nothing about the review contract. Opus's
  desktop B and mine both put the real contract on screen (stepper with
  one-line status, dominant media stage, adjacent comments).
- **Stage chips on the desktop hub filter the list** — Grok and I agree; Opus
  agrees as long as they are filters, which they are.

### 8.11 Guests and roles

**All three:** `/review/[token]` gets brand, project name, film, comments,
Approve — no rail, no drawer. **Grok** flagged my README line "reviewers
would see Library + Team + Settings" as handing Team to someone who is only
there to comment. **Opus** proposes role-shaped rails (a viewer gets
Projects · Cut · Delivery; under three tabs the rail disappears) while
saying it leans toward an identical rail.

**FABLE:**

- **Concede to Grok on the reviewer role.** A workspace *reviewer* (a
  member, not a guest) sees Projects they are on, the Cut and Delivery
  queues, and Library read-only. No Team, no Settings beyond their own
  profile, no Admin. README corrected.
- **Against Opus's role-shaped rail.** An identical five-stop bar with
  empty-state queues is more predictable than a bar that changes length by
  role — support docs, screenshots, and muscle memory all assume one bar.
  Opus's own open question 2 leans this way; I'd close it: identical.

### 8.12 Opus's open questions, answered

1. **Leads:** live in Brief; no rail slot. Shoot keeps its slot.
2. **Shoot for editors:** identical rail; Shoot shows an empty queue.
3. **Reopen last project on launch:** no. Land on Projects every launch;
   in-session state restoration is fine.

---

## 9. MASTER spec I'm arguing for (survives the exchange)

Where a row says *all three*, no further debate is needed. Where it says a
name, that's whose model won on operations and why is in §8.

### Phone 390×844

| Surface | Chrome | Notes | Won by |
| --- | --- | --- | --- |
| App bar | ☰ · page title (+ workspace subtitle) · search | No brand, no avatar; both live in the drawer. | Opus |
| Bottom rail | Projects · Brief · Shoot · Cut · Delivery | Stage stops are **global queues**, always. Sapphire badge counts what waits on you. Identical across roles. | FABLE + Opus |
| Projects home (login) | App bar + rail | Chips: Needs you · Active · Archived. Cards: thumbnail + version tag, name, client · date, four-segment meter, **stage · fact · counter** line, one health dot. Sorted attention-first. Tap the frame → film route. | all three / FABLE card |
| Stage queue | App bar (queue name) + rail | Same card list filtered to that stage, attention-first. No project filter chip. | Opus |
| Project page | Back · title · compact stepper + rail | Stepper switches stages inside the job; rail keeps the tab you came from highlighted; header names the job. | Opus + Grok (header rule) |
| Film route | Back · job + stage/version · share. **No rail, no ☰.** | Full-width 16:9, transport inside the frame's bottom 6 %, version chip / compare, comments, composer owns the bottom edge. Left-edge swipe = system back. | Opus (frame) / all three (rule) |
| Drawer | Slides over a scrim from ☰ only | Library (Media, Archive, Trash) · Team (Members, Clients & guests, Invites & roles) · Settings (Workspace, Brand kit, Notifications) · Admin (owners: Billing, Webhooks & API, Audit log) · account footer. **No Recents, no Projects, no Review links.** Inert background, focus move/return, Esc/scrim close, reduced-motion; Opus's nudge optional. | FABLE inventory + Grok (no Recents) + Opus (Archive/Trash placement) |
| Guest `/review/[token]` | Brand · project name only | Film, comments, Approve. Nothing else. | all three |

### Desktop 1440×900

| Surface | Chrome | Notes | Won by |
| --- | --- | --- | --- |
| Rail (68–72 px, always on) | Projects · Library · Team · Settings; Help + account at foot | Mark is brand only. Admin under Settings for owners. No Reviews, no stages. Optional keyboard-expanded sidebar with Recents. | FABLE (labelled Projects) + Grok (Admin placement) + Opus (expand) |
| Top bar | Breadcrumb · ⌘K search · Upload · notifications | Breadcrumb carries depth; rail stays on Projects inside a job. | FABLE |
| Projects hub (login) | Grid of the phone card | Chips: Needs you · Active · Brief · Shoot · Cut · Delivery · Archived — filters, not routes. | all three |
| Project page | Title · meta · **stepper with one-line status per stage** | Stage content beneath; Cut = version tabs, dominant media stage, adjacent review rail. | FABLE + Opus |
| Film route | Rail stays | Costs width, not the thumb. Theater mode hides rail + header. | all three |
| Guest | Same as phone | No rail. | all three |

---

## 10. What changed in the FABLE comps this round (so peers can diff)

- `index.html`: Cut badge red → sapphire; chips → Needs you · Active ·
  Archived; avatar removed from the app bar; edge-swipe-to-open removed;
  **new state C** (`?state=film`) — film route with no rail and no app bar;
  tapping a card's thumbnail enters it, back returns.
- `desktop.html`: the mark no longer navigates; Projects is the labelled
  home control.
- `screenshot.sh` / `screenshots/`: adds `c-film-route-no-rail.png`.
- `README.md`: reviewer-role wording corrected (no Team for reviewers);
  open questions updated.

Still open, for Bailey rather than for the peers: whether the desktop
steps row collapses to a compact segmented control once you're inside a
version, to give the stage more height.
