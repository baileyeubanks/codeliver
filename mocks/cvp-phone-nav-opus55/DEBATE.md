# Nav debate: Opus 5.5 vs Fable vs Grok 4.7

The question is how the nav operates, not how it looks. Sources are the three phone comps as pushed at the time of writing: Fable's [FABLE mobile nav mock](https://github.com/baileyeubanks/codeliver/pull/31) (`mocks/cvp-phone-nav-fable/`), Grok 4.7's [GROK 4.7 mobile nav mock](https://github.com/baileyeubanks/codeliver/pull/32) (`mocks/cvp-phone-nav-grok47/`), and mine in this folder. Neither peer had pushed a desktop comp yet, so the desktop section argues from my comp and the live code. The operating model I'm defending is in the "How the nav operates" section of [`README.md`](README.md).

## Agreed by all three, so not worth debating

- Login lands on a Projects list, not a dashboard.
- On a phone, one persistent nav: a bottom rail with Projects, Brief, Shoot, Cut, and Delivery, and no permanent left column.
- Deep tools sit behind a top-left hamburger in a left drawer that slides over the page.
- Quiet sapphire chrome, and phases named in words instead of colors.

## Where we actually disagree

### 1. What a stage tab means

- **Fable** treats the tabs as global queues but adds a "project filter chip" to narrow them to one project, and leaves scope as an open question for Bailey.
- **Grok** never says. The tabs are buttons with no behavior and no data model behind them.
- **Mine, originally,** had the tabs show cross-project work from home but jump to that stage inside a project. That was wrong: the same tab gives two different results depending on where you tapped it.
- **Verdict:** a tab is a cross-project queue and always means the same thing. Opening a project pushes it onto that tab's stack. Stage switching inside a project belongs to the project's stepper, which is the same component on phone and desktop. Fable's project-filter chip is unnecessary, because the stepper already does that job.

### 2. The film and review route

This is the most important call in the brief, and it's the one nobody drew.

- **Fable** says the review UI is out of scope, though its README says the rail "never steals horizontal space from the list or the thin player." That covers width but ignores height, and height is what a bottom bar costs.
- **Grok** says the player is out of scope, so the nav "does not add a side column or a taller bar on top of that work." The instinct is right, but it's a non-decision: on the film route its rail is still there by default.
- **Mine** hides the rail on any route where one asset plays for review, and state C (`phone-film.html`) shows it. The frame is 390×219 with the live 6% overlay controls. The rail would add 80px, 37% of the frame height, and would fight the composer for the bottom edge. Back is a top-left chevron plus an edge swipe.
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

## Proposed MASTER phone (390×844)

| Surface | Chrome | Notes |
| --- | --- | --- |
| Projects home (`/projects`) | App bar (hamburger, "Projects", search) and the rail | Chips: Needs you, Active, Archived. Cards follow the verdict in section 5, sorted with attention first. |
| Stage queue (Brief, Shoot, Cut, Delivery) | App bar with the queue name, and the rail | Same card list, filtered to that stage across projects, with next actions first. |
| Project page | Back, project title, compact stepper, and the rail | The stepper switches stages inside the project. The rail keeps the tab you came from highlighted. |
| Film route (a version, a review link, a portal asset) | Back, title, and share. **No rail.** | 16:9 film with the live 6% overlay, tap-to-pin, and the composer on the bottom edge (state C). |
| Drawer | Slides over the page, which nudges 28px under a scrim | Recents, Library (Media, Archive, Trash), Team, Settings, Leads (producers), Admin (owners), and an account footer. Fable's inert, focus, and swipe behavior. |
| Guest (`/review/[token]`, portal) | Brand and project name only | No rail, no drawer, no team. |

## Proposed MASTER desktop (1440×900)

| Surface | Chrome | Notes |
| --- | --- | --- |
| Rail (72px, always on) | Projects, Library, Team; Admin, Settings, and account at the bottom | No stages and no Reviews; my comp's Reviews item duplicates the Cut queue and is dropped. Expands to a labeled sidebar with recents from a keyboard toggle. |
| Projects hub (login home) | Top bar with the workspace, ⌘K search, and notifications | Chips: Needs you, Active, Brief, Shoot, Cut, Delivery, Archived. These are the phone's stage tabs rendered as chips. Grid cards follow the phone's card verdict. |
| Project page | Breadcrumb, title, stepper (Brief, Shoot, Cut, Delivery with one-line status) | Today's eight project tabs map onto the stepper: Brief to Brief, Milestones and Calendar to Shoot, Deliverables to Delivery. Files, Team, and Comms go to a project side panel. |
| Film route | The rail stays, since it costs width, not height | The player takes the width, with a 44px control strip and the comments panel on the right. Theater mode hides the rail and header. |
| Guest | Same rule as phone | No rail. |

## Still open for Bailey

1. **Where leads live.** Is Leads (today's Opportunities) daily work for your producers? If so, it's the only candidate that could claim a phone rail slot, and it would have to take Shoot's.
2. **Shoot for editors.** Editors rarely go on set. Should their rail swap Shoot for Library, or should the rail stay identical across roles for predictability? I lean toward identical.
3. **Returning to a project.** Should reopening the app land on Projects every time (my position), or reopen the last project?
