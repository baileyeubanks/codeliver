# Nav debate: Opus 5.5 vs Fable vs Grok 4.7

The question is how the nav operates, not how it looks. Peers: Fable's [FABLE mobile nav mock](https://github.com/baileyeubanks/codeliver/pull/31) (`mocks/cvp-phone-nav-fable/`) and Grok 4.7's [GROK 4.7 mobile nav mock](https://github.com/baileyeubanks/codeliver/pull/32) (`mocks/cvp-phone-nav-grok47/`). The operating model I'm defending is in the "How the nav operates" section of [`README.md`](README.md).

- **Round 1** is my critique of the first phone comps.
- **Round 2** answers Grok's `DEBATE.md` and master frames (commit `7a480e7`) and Fable's desktop comp (commit `85f8003`). Fable had not pushed a `DEBATE.md` when I wrote this, so I answer the positions in its README.
- **Round 3** judges every open point against Bailey's stated intent, using Fable's `DEBATE.md` (`5a51cca`) and Grok's intent pass (`0adf850`). It concedes the comment dock and ratifies the stage-tab rule all three of us converged on.
- **The master** section links the drawn master frames in [`master/`](master/).

Peers: cite my claims by section, for example "Opus R2.1".

## Agreed by all three, so not worth debating

- Login lands on a Projects list, not a dashboard.
- On a phone, one persistent nav: a bottom rail with Projects, Brief, Shoot, Cut, and Delivery, and no permanent left column.
- Deep tools sit behind a top-left hamburger in a left drawer that slides over the page.
- Quiet sapphire chrome, and phases named in words instead of colors.

## Round 1: where the first phone comps disagree

### 1. What a stage tab means

- **Fable** treats the tabs as global queues but adds a "project filter chip" to narrow them to one project, and leaves scope as an open question for Bailey.
- **Grok** never says. The tabs are buttons with no behavior and no data model behind them.
- **Mine, originally,** had the tabs show cross-project work from home but jump to that stage inside a project. That was wrong: the same tab gives two different results depending on where you tapped it.
- **Verdict:** a tab is a cross-project queue and always means the same thing. Opening a project pushes it onto that tab's stack. Stage switching inside a project belongs to the project's stepper, which is the same component on phone and desktop. Fable's project-filter chip is unnecessary, because the stepper already does that job.

### 2. The film and review route

This is the most important call in the brief, and it's the one nobody drew.

- **Fable** says the review UI is out of scope, though its README says the rail "never steals horizontal space from the list or the thin player." That covers width but ignores height, and height is what a bottom bar costs.
- **Grok** says the player is out of scope, so the nav "does not add a side column or a taller bar on top of that work." The instinct is right, but it's a non-decision: on the film route its rail is still there by default.
- **Mine** hides the rail on any route where one asset plays for review, and state C (`phone-film.html`) shows it. The frame is 390×219 with the live 6% overlay controls. The rail would add 80px, 37% of the frame height, and would fight the composer for the bottom edge. Back is a top-left chevron. I originally added an edge swipe; I conceded it in R2.3.
- **Verdict:** the master hides the rail on the film route. This matches how Wistia and Wipster review pages work and protects the thin-player and tap-to-comment work already on live.

### 3. What goes in the drawer

- **Fable** has the most complete inventory, grounded in the live nav model: Library (Media, Archive, Trash), Team (Members, Clients & guests, Invites & roles), Settings (Workspace, Brand kit, Notifications), and Admin (Billing, Webhooks & API, Audit log). But it has no recents, so it's a settings menu rather than a Claude Code sidebar. The value of Claude Code's sidebar is resuming where you were.
- **Grok** has four sparse groups and nests Archive and Trash under "Workspace admin." That's wrong on operations. The live model gates Archive and Trash with `projects:read`, so every role, editors included, can use them. A producer hunting for last year's cut shouldn't have to go through Admin, and on a real build this placement would hide Archive from everyone who isn't an admin.
- **Mine** has recents plus tools, but it repeats Projects (already on the rail) and adds Review links (the Cut queue). Both are duplicates.
- **Verdict:** Fable's inventory, plus my Recents group at the top, minus anything already on the rail. Archive and Trash go under Library, and Leads (today's Opportunities) goes in the drawer for producers and owners.

### 4. Filter chips on the phone home

- **Fable's** chips are Active, Needs you, In review, and Delivered, and the last one runs off the screen. "In review" and "Delivered" repeat the Cut and Delivery tabs on the same screen, so there are two controls for one filter.
- **Grok** has no chips.
- **Mine** has Active, Needs review, and Archived.
- **Verdict:** phone chips cover attention and lifecycle only: Needs you, Active, and Archived. Stages belong to the rail on phone and to chips only on the desktop hub, where there is no rail for them.

### 5. The project card as a work item

- **Fable** has the best card. Every row states the next operational fact in a fixed pattern of stage, fact, and a counter: "Cut · v3 · changes requested · 4", "Shoot · 18 shots logged · 142 GB", "Delivery · approved · locked", "Cut · v1 · processing · 72%". A producer can triage without opening anything.
- **Grok** shows a stage pill and one status line, with no thumbnail. In a video tool, people recognize a cut by its frame, and Wistia and Wipster both lead with the thumbnail, so the missing thumbnail costs recognition.
- **Mine** has a thumbnail and a four-segment meter, but the meta line ("v3 cut · 4 new comments") is weaker than Fable's pattern.
- **Verdict:** a thumbnail with a version tag, Fable's stage-fact-counter status line, the four-segment meter, and one health dot.

### 6. Badges and color semantics

- **Fable** puts a red "3" badge on Cut. In CVP's tokens, red means risk, so a routine "three cuts to review" reads as an alarm every day. People stop noticing alarms that are always on.
- **Grok** has no badges, which throws away the one cheap signal that replaces a dashboard.
- **Mine** uses a sapphire count badge.
- **Verdict:** sapphire badges count only what waits on you. Red appears only as a health dot.

### 7. Rail icons

- **Grok** draws Cut as a play triangle, which collides with the player's own play control, and Delivery as a truck, a physical-shipping metaphor for a download link.
- **Fable and I** both use scissors for Cut and a paper plane for Delivery.
- **Verdict:** scissors and paper plane.

### 8. Drawer mechanics

- **Fable** is the most rigorous. The background becomes `inert`, focus moves to the close button and returns to the hamburger, Esc and the scrim both close it, edge-swipe opens it, and it respects `prefers-reduced-motion`. Fable says it checked all of this over DevTools.
- **Mine** has the scrim, Esc, the panel button, and a 28px page nudge that makes the drawer feel spatial, like Claude Code's. It has no inert background or focus return.
- **Grok** only toggles.
- **Verdict:** Fable's mechanics plus my nudge and easing curve.

### 9. The app bar

- **Fable:** hamburger, the page title with a workspace subtitle, search, and avatar.
- **Grok:** hamburger, the brand, and search.
- **Mine:** hamburger, the brand, notifications, and avatar.
- **Verdict:** hamburger, page title, search. The app bar should say where you are, not repeat the brand. The brand, workspace switcher, and account go in the drawer, so each lives in one place. Notifications go into the stage badges plus Activity in the drawer.

### 10. Guests and roles

- **None of the three comps shows a guest view.** Fable notes that reviewers would see a smaller drawer; Grok and I don't address roles in the comp at all.
- **Verdict:** `/review/[token]` and the client portal get no rail and no drawer: just the brand, the project name, the film, comments, and Approve. For workspace roles, a tab appears only if the role can use it, and with fewer than three tabs the rail disappears. For example, a viewer gets Projects, Cut, and Delivery.

## Round 2: replies to Grok's DEBATE.md and Fable's desktop

### R2.1 What Brief, Shoot, Cut, and Delivery open: contested, and I hold

**Grok's rule:** those four tabs always open the *current job* at that stage. If no job is current, they open the most recently active job and name it in the header. Cross-project stage views live only as chips on the Projects list.

**Agree:** a tab must never be an inbox on one screen and a chapter on another. My first README did that, Grok caught it, and both of us have dropped it. We also agree that Fable's "global queue plus a project filter chip" gives one tab two products.

**Rebut:** Grok's fix swaps the double meaning for hidden state, and its own master frame shows the cost.

- **Home screen, four tabs aimed at a job you can't see.** In `master-phone-projects.png` the header says "Projects". Brief, Shoot, Cut, and Delivery point at whichever job you touched last, and nothing on screen says which. A producer with six live jobs taps Cut from home and lands in West Dock when they meant Harbor Light. Then comes the dangerous step: from that wrong Cut they share a review link and send one client another client's film.
- **The same word twice on one screen, with two meanings.** The same frame shows the chips All, Brief, Shoot, Cut, and Delivery (filter across jobs) directly above the tabs Brief, Shoot, Cut, and Delivery (open the current job). It's the one-control-two-meanings problem again, split across two controls that share a label.
- **The phone tabs become a copy of the in-project stepper.** Under Grok's rule the four tabs *are* the stepper. That's harmless on phone, but it breaks the phone and desktop symmetry that all three of us want, where the stages sit inside the project on both.

**What Grok's model wins:** switching stages inside a job by thumb. In my model, going from Cut to Delivery inside Northwind means reaching the stepper at the top of the page; in Grok's it's a bottom tab. That's a real cost of mine.

**Task walk-through on a 390px phone, with six live jobs:**

| Producer task | Opus (tabs are queues across projects) | Grok (tabs open the current job) |
| --- | --- | --- |
| Morning triage: which cuts wait on me across every job? | Tap Cut: 1 tap. | Home, then the Cut chip: 1 tap, since home is already open. A tie. |
| Inside Northwind, go from Cut to Delivery | Stepper at the top: 1 tap, but a hard reach. | Delivery tab: 1 tap in the thumb zone. **Grok wins.** |
| From home, open Harbor Light's brief | Card, then stepper: 2 taps. | Card, then Brief tab: 2 taps. Tapping Brief first opens the *last* job: 3 or more taps and a wrong-job risk. |
| Share the right cut's review link | The job is always named on the page you share from. | Safe only if you notice the header; the tab doesn't name the job. |

**What would change my mind:** evidence that producers mostly use the phone *inside one job*, for example on set all day. Then Grok's thumb advantage outweighs the hidden-state risk. If phone use is mostly triage between meetings across jobs, queues win. This is a fact question for Bailey (open question 1 below), not a style call. If Bailey picks Grok's model, the master must at least show the current job in the rail itself, for example a "Northwind" label above the tabs, so the target is never invisible.

### R2.2 What goes in the drawer: mostly concede

- **Concede:** Review links (that's Cut) and Templates (that belongs in the New project flow) come out. Billing was ungated in my comp's Workspace group, which Grok is right to flag as a guest and role leak. It moves under Admin, owners only.
- **Rebut on Recents:** Grok says Recent projects duplicates Projects. Recents is not a route. It's the named, explicit way to resume, and it's the substance of the Claude Code sidebar Bailey asked for, which without it is just a settings menu. It's also the honest alternative to Grok's invisible "current job": if you want to get back to Harbor Light, you tap its name. It stays, capped at three.
- **Master drawer:** Recents (3), Library (Media, Archive, Trash), Team, Settings (with Admin inside, owners only), and the account footer. Leads is added only if Bailey says producers need it (open question 2).

### R2.3 Edge swipe to open the drawer: concede to Grok

On the film route a horizontal swipe belongs to scrubbing and pinning. On any web route, the left edge swipe also belongs to the browser's own back gesture in iOS Safari, so an app-level edge swipe fights the OS. The drawer opens from the hamburger only. My README's "edge swipe back" on the film route is changed to back chevron only. Fable's edge-swipe open is dropped from the master; everything else in Fable's drawer mechanics stays.

### R2.4 Hide the bar on the film: agreed by Grok, but Grok's frame drops the review loop

**Agree:** Grok now draws the same decision as my state C. There is no app bar on the film, and back returns to the job's Cut. Fable still hasn't drawn a film route on the phone. That makes it two drawn, one silent, none opposed.

**Rebut `master-phone-player.png` on how it operates:**

- **No surface for the notes.** It shows "Tap the frame to comment" but nowhere to read, reply to, or resolve notes, and no composer. On the phone the review loop is read the note, scrub to it, reply or resolve. The notes list and the composer on the bottom edge are that loop, and they're why the bottom edge must be free.
- **The transport is a deck under the picture.** The live phone player already lays its controls over the film. Bailey passed the mobile overlay on live and closed the 6% overlay PR only because live had superseded it. A deck under the frame is the design that work removed. The frame is also drawn portrait-tall, when a 16:9 cut on a 390px phone is 219px high.
- **Master:** my state C layout (a 16:9 film, the live overlay, tap-to-pin, the notes list, and the composer on the bottom edge) with Grok's back label, which names the job and stage ("‹ Harbor Light · Cut").

### R2.5 The desktop rail: split verdict

- **Concede to Fable and Grok:** Admin goes behind Settings, not in the rail. Reviews comes out, which I'd already done in round 1.
- **Rebut Grok on removing Projects:** Grok drops Projects from the rail and makes the logo the only way home. A logo as the only route to the most-used screen is a hidden affordance. Once you're inside a project, the rail also loses its "you are in Projects" highlight, which Fable uses deliberately: the rail stays on Projects and the breadcrumb carries depth. Two of three keep a labeled Projects item.
- **Master rail:** Projects, Library, Team, Settings, with Help and the account at the foot. This is Fable's desktop rail almost exactly.

### R2.6 Grok's desktop project frame contradicts Grok's own rules

- **A second pipeline beside the stepper.** Grok writes that the film "does not gain a second pipeline." Yet `master-desktop-project.png` shows the stepper plus a "This step" panel that lists all four stages again (Brief approved, Shoot wrapped, Cut in review, Delivery waiting). The stepper's per-step status line already does this; Fable's and mine both put that status inside the step. Drop the panel.
- **"Thin player" drawn as a 46px strip with no frame.** Thin means thin *chrome* around a dominant frame, not a thin film. The review loop needs the frame to pin on. Master: the frame takes the width, Fable's and my layout.

### R2.7 Fable's desktop: agree almost entirely

- **Agree:** one 68px rail, stages as chips on the hub with counts ("Brief 3 · Shoot 2 · Cut 2 · Delivery 1"), and inside a project a single step row with a one-line status per step and the current step tinted. The rail stays on Projects inside a project, and the review workspace is dropped in unchanged. Its per-comment Reply and Resolve, and "Request approval" as the one primary button, are better operations than my comp, which had neither.
- **Answer to Fable's open question on collapsing the step row:** yes. On a version or film route, the step row collapses to one compact line so the stage gets the height. On the project page it stays full.
- **One rebut:** Fable's phone rail is global, with an optional project filter chip. Drop the chip. Inside a project, the stepper already scopes, and a chip that silently narrows a global tab is a second mode. See R2.1.

## Round 3: judged against Bailey's stated intent

Bailey's intent statement is now the test, and it settles most of what we were still fighting about. Sources: Fable's `DEBATE.md` (commit `5a51cca`) and Grok's intent pass (commit `0adf850`). Where his intent rules against me, I say so first.

### R3.1 Comments: I lose this one

Bailey: "Click/tap the film → comment dialog at playhead. Kill the permanent bottom comment section under the video."

- **My state C fails it.** It keeps a notes list and a composer permanently under the film. Grok called this correctly. Fable's rule fails too: its phone film route is "film → review rail/composer", the same dock.
- **Where I still hold against Grok:** notes have to be readable and answerable somewhere. Grok's player frame had no place at all to read, reply to, or resolve a note. The fix is *on demand*, not a dock.
- **Master:**
  - **Phone.** Tapping the film pauses it, drops a pin, and opens a comment dialog at the playhead. The dialog sits *below* the frame, so the live 6% overlay is never covered. To read notes, tap a scrubber marker or the Notes pill in the header; notes open in a sheet that closes when you're done. Nothing sits permanently under the film.
  - **Desktop.** Clicking the film opens the same dialog beside the pin. The notes list sits *beside* the film, not under it, and collapses with one click. There is no permanent composer.

### R3.2 Stage tabs: we have converged, so here is the rule to ratify

- **Grok's revised rule, stated with no job open:** a stage tab "returns to Projects with that stage chip on." Inside a job, it opens that job's stage. That is exactly my round-1 rule (across projects from home, this job's stage inside a job), which Grok's own refusal list calls "one tab, two meanings."
- **Fable** has global queues plus a project filter chip, so its tabs also narrow to one job.
- **So all three models let the scope change with context.** The honest version is to ratify that rule explicitly: **a stage tab always opens that stage for whatever scope the header names.** Inside a job, the header names the job; on home, it says Projects. The word on the tab never changes meaning, only its scope does, and the scope is always on screen.
- **This matches his intent.** A "thumb bottom rail tied to pipeline + Projects" that "honors the story": inside a job, the four words on the thumb are that job's story, which is Grok's point and the stronger one. From home, they're the same story across all jobs.
- **Hidden state is gone.** Scope changes only by an explicit act: opening a card or a Recent sets it, and back or the Projects tab clears it. It never comes from memory. Grok dropped "open the last job", which was the risk I argued in R2.1.
- **Consequences on the phone:**
  - Inside a job, the rail *is* the stepper. Brief and Shoot show done checks, the current stage is active, and a quiet "Northwind · stages" label sits above the tabs.
  - There is no separate stepper, and there are no stage chips on the phone home screen. Grok contradicts itself here: it says the tab "returns to Projects with that stage chip on" and also that the phone list "does not add Brief/Shoot/Cut/Delivery chips." In the master, tapping Cut from home simply shows the Projects list filtered to Cut under the header "Cut · all projects." There is no separate chip control.
- **Fable's project filter chip** is still dropped; the header carries the scope.
- **Peers, attack this rule if it's wrong.** I'm conceding my R2.1 "hold" to it.

### R3.3 Drawer: settled, except one mechanic

- **Settled (all three):** hamburger only, background inert, focus returns, and nothing that repeats a rail destination.
- **Settled (Grok now agrees):** Recents at the top, up to three, which is the Claude Code "robust when needed" behavior he asked for. Archive and Trash go under Library.
- **Settled:** Admin is an owner-tagged row, and Billing lives inside Admin.
- **Fable still has the edge swipe.** Its §2 says "the edge swipe gives it a reachable alternative." That fights the film's scrub gesture and iOS Safari's back gesture. Drop it.
- **My 28px page nudge.** Fable's refusal 8 is "a drawer that pushes content." Mine is a transform-only nudge with no reflow, so the film never resizes. It's a looks call; I'll drop it if either peer thinks it reads as a push.

### R3.4 The film route's own chrome

He said "player chrome is better — leave that alone" and "everything AROUND the player must be sleek, clean, aligned."

- **Agreed by all three:** the app rail hides and there is no hamburger. Fable adds that landscape hides the top bar too, and I agree.
- **Master (around the player only):**
  - **Top bar:** a back label that names the job and stage ("‹ Northwind · Cut · v3"), the Notes pill, and share.
  - **Under the film:** the filename, one status line, a version picker, and one primary action.
  - **The live overlay is drawn as-is, never restyled.**

### R3.5 Guests: settled

- **All three agree:** a share-link guest gets the brand, that review's name, the film, notes, and Approve or Request changes. No rail, no drawer, no team, no other clients.
- **Grok's distinction also stands.** A workspace member with the reviewer role is not that guest.
- The master now draws it (`master/phone-6-guest-review@2x.png`).

### R3.6 Desktop: settled

- **Rail:** Projects, Library, Team, Settings, with Help and the account at the foot. The logo is not a second home link, which answers Grok's condition for keeping Projects in the rail.
- **Hub:** stage chips with counts, and they only filter the list, as Grok requires. The phone's stage tab on home is the same filter reached by thumb.
- **Project page:** Fable's step cards, each with a status line and the current one tinted.
- **Notes:** a notes panel beside the film, and a comment dialog at the pin.

### R3.7 Fable's seven-task rubric, run on the master

| # | Task | Master phone | Master desktop |
| --- | --- | --- | --- |
| T1 | Open the cut a client just commented on | 2: Cut tab on home (newest client note first), then the version | 2: card (opens at the current stage), then the version is already current |
| T2 | Reply to a pinned comment | 4: T1, then a marker or the Notes pill, then Reply | 3: T1, then Reply in the panel |
| T3 | Log a talent release on set | 3: Shoot tab, then the job, then Releases (2 if already in the job) | 3: card, Shoot step, Releases |
| T4 | See which briefs await sign-off | 1: Brief tab | 1: Brief chip |
| T5 | Send a final and confirm the download | 2: Delivery tab, then the job | 3: card, Delivery step, Send |
| T6 | Invite a teammate | 2: hamburger, then Team, then the form | 1: Team, then the form |
| T7 | A client opens a review link and comments | 1: the link opens the film; tap the film | 1 |

T2 on phone costs one tap more than Fable's count. That is the price of killing the dock, and his intent says to pay it.

## MASTER (round 3), drawn in [`master/`](master/)

These are the frames I'm putting forward for the forge. They're built from the debate, not from my round-1 comp.

| Frame | File | What it settles |
| --- | --- | --- |
| Phone: Projects home | `master/phone-1-projects@2x.png` (`phone.html`) | Hamburger, "Projects", search. Chips: Needs you, Active, Archived. Fable's stage-fact-counter card lines, and a sapphire badge on Cut. |
| Phone: drawer | `master/phone-2-drawer@2x.png` (`phone.html#drawer`) | Recents (3); Library (Media, Archive, Trash); Workspace (Team, Settings, Admin for owners); account with sign-out. No rail repeats. |
| Phone: inside a job | `master/phone-3-job-cut@2x.png` (`phone.html#job`) | The header names the job, and the rail is the job's stages (R3.2): Request approval, Upload v4, and the versions. |
| Phone: tap the film | `master/phone-4-film-tap-comment@2x.png` (`phone-film.html#tap`) | No rail and no dock. The dialog at the playhead sits below the frame, and the overlay is untouched. |
| Phone: notes on demand | `master/phone-5-film-notes-sheet@2x.png` (`phone-film.html#notes`) | A sheet from the Notes pill or a marker, with Reply and Resolve. Gone when closed. |
| Phone: guest | `master/phone-6-guest-review@2x.png` (`phone-film.html#guest`) | Brand, review name, film, dialog, Approve, and Request changes. No team chrome. |
| Desktop: hub | `master/desktop-1-projects-hub.png` (`desktop.html`) | Rail of Projects, Library, Team, Settings, plus Help. Chips: Needs you, Active, the four stages with counts, and Archived. |
| Desktop: project at Cut | `master/desktop-2-project-cut.png` (`desktop.html#project`) | Step cards, a version switcher, a dialog at the pin, a collapsible notes panel with Reply and Resolve, and one primary action ("Request approval"). |

## Still open for Bailey

1. **The scope label.** Inside a job, is the "Northwind · stages" label above the tabs wanted, or is the job name in the header enough?
2. **Leads.** Is Leads (today's Opportunities) daily work? If so, it goes in the drawer, never on the rail.
3. **Desktop notes panel.** Should it start open (review work) or collapsed (film first) when a version opens?
