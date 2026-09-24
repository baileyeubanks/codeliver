# DEBATE — how the Co-VideoPro nav operates, and why

This is not a beauty contest. The mocks in this folder are arguments about
**how a producer moves through a production day**; pixels are the evidence,
not the claim. This file holds (1) the operating model behind the FABLE
comps, (2) the failure modes I refuse, (3) the rubric I'll score every comp
against, and (4) the peer critique + master-forge notes once the Opus 5.5 and
Grok 4.7 comps arrive.

**Status:** Sections 1–7 are live. Section 8 (peer critique) and 9 (master
forge) are scaffolded and will be filled when Blaze sends the peer artifacts.

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
not Reviews, not Settings. Each stop is a *queue of work at that stage
across every production*, filterable to one project, badged with what needs
you.

| Stop | What it is | What a producer actually does there, day-to-day |
| --- | --- | --- |
| **Projects** | The list of productions. Home. | Find a production by name/client, read its health dot and phase word, open it, create a new one. The "where am I across everything" view. |
| **Brief** | Everything pre-production: intake, scope, treatment, quote, client sign-off. | Morning: see which briefs are *awaiting client sign-off* vs *drafting*, nudge the client, approve a scope, convert an inquiry into a production. Absorbs today's Requests/Opportunities surfaces. |
| **Shoot** | The shoot day(s): call sheet, shot list, releases/clearances, card offload. | On set, one hand: check today's call sheet, tick shots as they land, capture a talent release, log offload progress, mark wrapped. This is where "Field" lives. |
| **Cut** | The review queue: versions awaiting feedback or approval, open comments. | The hot stop — badged. Open the version the client just commented on, watch the frame they pinned, reply/resolve, upload v4, request approval. Thin player + click-to-comment live behind this tab. |
| **Delivery** | Approved masters, locked deliverables, share links, download receipts. | Send the final, confirm the client downloaded it, lock the version so nothing drifts, close the production. |

Why five and not four or six:

- **Five is the thumb-bar ceiling** (Apple HIG 3–5; Material 3–5). Six forces
  a "More" tab, which is a drawer wearing a tab costume.
- **One stop per stage keeps the bar isomorphic to the pipeline.** A
  producer who knows the four words knows the whole nav. Adding "Home" or
  "Reviews" breaks the isomorphism — Reviews *is* Cut, Home *is* Projects.
- **Badges make the bar a status board without a dashboard.** `Cut · 3`
  tells you where the day's work is before you tap anything.
- **Stage tabs are global queues, not project tabs.** Tapping Cut shows
  every version awaiting feedback across all productions, with a project
  filter chip. Scoping to "last opened project" is the phone-nav
  equivalent of a modal — it would make the same tap do different things
  on different days. (Open question for Bailey; the mock assumes global.)

---

## 2. Why deep tools live in a Claude Code–style slide drawer on phone

**Thumb reach.** One-handed use is the phone's default posture on set and in
transit. The comfortable zone is the bottom third; the top-left corner is
the hardest reach. A permanent left column puts *everything* in the hard
zone and steals width from the film. A bottom bar puts the five hourly
actions where the thumb already is; the drawer's trigger (☰, top-left) is
deliberately in the hard zone because it's a weekly action, and the edge
swipe gives it a reachable alternative.

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
the scrim, a swipe, or Esc. It is reversible in 240 ms; a permanent column
is a decision you can never undo.

**What the drawer is not:** it is not a second pipeline. If it ever grows a
Brief/Shoot/Cut/Delivery section, the rail has failed.

---

## 3. What happens on the PLAYER / film route

**The app bottom bar hides.** When you open a version — internal review at
`/projects/[id]/assets/[assetId]` or public review at `/review/[token]` —
the screen is: compact top bar (back, title, share/approve) → film → review
rail/composer. No Projects·Brief·Shoot·Cut·Delivery bar.

Why:

- **The bottom edge belongs to the film.** The scrub bar, the comment
  composer, and the keyboard all live at the bottom. A nav bar underneath
  the scrub bar is a collision zone: a thumb reaching for 01:46 hits
  "Delivery". Wistia and Wipster both run the player edge-to-edge with the
  timeline as the lowest control and nothing beneath it.
- **The film route is a leaf, not a hub.** You arrived from Cut (or a link)
  and you'll leave via back. Persistent nav on a leaf invites mid-review
  abandonment and makes "did I finish resolving those?" a real question.
- **Guests never see the bar anyway** (see §6). Making the team route match
  the guest route means one player layout to keep the thin-player and
  click-to-comment work honest, not two.
- **Landscape / fullscreen** hides even the top bar; only the film and a
  tap-to-reveal control layer remain.

The mock does not render this state; it is a stated rule so the master can
be judged on it.

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
drawer/rail tool, not the landing page.

---

## 5. Desktop: thin left tools rail stays; pipeline inside the project

**Why the rail persists on desktop.** Width is cheap: 68 px is ~5 % of 1440,
and there is no thumb. What matters on desktop is wayfinding across long
sessions and shortcut discoverability — a rail you can always see does both.
The rail is *tools* (Projects · Library · Team · Settings), exactly the
contents of the phone drawer, so a user learns one vocabulary.

**Why the pipeline moves inside the project.** Stages are attributes of a
production. On desktop you spend an hour inside one production, so the four
stages render as a quiet steps row under the project header (check / number,
name, one status line, current step tinted). The global stage queues the
phone bar provides are still reachable from the hub's stage chips (and
later ⌘K), but they aren't chrome.

**How this avoids duplicating phone chrome.** No bottom bar on desktop. The
rail's active item stays **Projects** inside a project — the breadcrumb
carries depth, the rail only says which tool you're in. Nothing about the
pipeline appears in the rail, so the desktop never shows the phone's
five-stop bar rotated 90°.

---

## 6. Failure modes I refuse

1. **Permanent left rail AND bottom bar on phone.** Two persistent navs
   means two answers to "where am I". It's the exact "feels weird" Bailey
   flagged and it taxes every screen for the benefit of none.
2. **Bottom bar over the film.** See §3. The bottom edge is the timeline's.
3. **Guests inheriting team nav.** A client on `/review/[token]` gets brand,
   film, and the review rail — no Projects, no drawer, no stage tabs. Team
   nav for a guest is a data-leak-shaped affordance (project names,
   pipeline state) and a trust problem (they'll click and hit a 403). The
   canonical repo already separates public from internal review; the nav
   must honour it.
4. **Dashboard as home.** See §4.
5. **A sixth bar item, or ☰ inside the bottom bar.** "More" as a tab makes
   the drawer a peer of Cut. The drawer trigger lives in the top bar.
6. **Pipeline stages duplicated in the drawer or the desktop rail.** One
   place per concept: stages are queues on phone and steps on desktop.
7. **Phase colour as identity.** Stages are named in words; colour reports
   health (green / amber / grey). No rainbow.
8. **A drawer that pushes content** instead of sliding over it. You lose
   your place and the film reflows.
9. **Stage tabs whose scope silently changes** (sometimes global, sometimes
   last-project). The same tap must do the same thing.

---

## 7. Rubric for the master forge — workflow clarity first, looks second

Every comp (mine included) gets scored on **taps from cold launch** for the
same seven tasks, then on the refusal list, then on craft. Fewer taps wins;
ties broken by whether the path is *predictable* (same route every day).

| # | Task | FABLE phone | FABLE desktop |
| --- | --- | --- | --- |
| T1 | Open the cut a client just commented on | 2 (Cut → version) | 2 (card → version already current) |
| T2 | Reply to a pinned comment on that cut | 3 (T1 + tap comment) | 3 |
| T3 | Log a talent release on set | 2 (Shoot → today's shoot) + form | 3 (card → Shoot step → releases) |
| T4 | Check which briefs await client sign-off | 1 (Brief) | 1 (Brief chip on hub) |
| T5 | Send a final and confirm download | 2 (Delivery → production) | 3 (card → Delivery step → send) |
| T6 | Invite a teammate | 2 (☰ → Team) + form | 1 (Team) + form |
| T7 | Client opens a review link and comments | 1 (link → film; no nav at all) | 1 |

Then:

- **Refusals (§6):** any comp that trips one is disqualified from being the
  master on that axis, regardless of taps or looks.
- **Same-vocabulary test:** can a user describe the phone nav and the
  desktop nav with the same four stage words and the same four tool words?
- **Film test:** at 390 wide, how tall is a 16:9 film in the review route,
  and what sits beneath its scrub bar?
- **Craft (last):** sapphire discipline (active state, hairline, one
  primary per view), type hierarchy, motion.

---

## 8. Peer critique — Opus 5.5 and Grok 4.7

*Pending Blaze's artifacts.* When they land, each gets the same treatment:

1. Re-derive their operating model from the comp (what's persistent, what's
   a leaf, what's global vs scoped, what a guest sees).
2. Run the seven tasks in §7 and record taps.
3. Check the nine refusals.
4. Name what they do **better** than FABLE, specifically, and whether it
   transfers.
5. Name where their model is **wrong**, with the workflow it breaks.

### Opus 5.5 — phone
_TBD_

### Opus 5.5 — desktop
_TBD_

### Grok 4.7 — phone
_TBD_

### Grok 4.7 — desktop
_TBD_

---

## 9. Master forge notes

*Pending §8.* What I expect to argue for carrying into the master
regardless of whose pixels win:

- Bottom bar = Projects + four stages as **global queues**, badged; ☰ in
  the top bar; drawer = tools.
- Film route hides the bar; guest route has no team nav.
- Desktop rail = the drawer's contents; stages as steps inside the project;
  rail stays on Projects.
- Projects home, no dashboard.

What I'd concede readily if a peer does it better: card anatomy, the steps
row's density, the review rail's comment layout, empty/loading states, and
any icon or label that tests as more legible. Those are looks. The
operating model above is the argument.
