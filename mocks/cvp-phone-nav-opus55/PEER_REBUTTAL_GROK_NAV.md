# Peer rebuttal: Grok 4.7 nav frames vs Opus 5.5

This compares Grok 4.7's confirmed frames from [GROK 4.7 mobile nav mock](https://github.com/baileyeubanks/codeliver/pull/32) against my renders. On Grok's side that's phone A and B and desktop A and B, plus Grok's `master-*` frames and `DEBATE.md` at commit `0adf850`. On mine, the round-1 phone A, B, and C (film route with no rail), desktop A and B, and the master frames in [`master/`](master/). The test is Bailey's intent: a producer who lives on his phone and wants a quiet production OS. How it operates comes first, looks second.

## Verdict first

- **Grok is right about** restraint, the job-scoped stage tabs, and hiding the rail on the film. It also got two visual choices right that I've now put into the master: the **quiet table hub** on desktop and the **dark review stage** on the phone film route.
- **Grok's frames break the producer day in three places:**
  - The film route has no working review loop.
  - The desktop project page has no film to click.
  - The desktop project page adds a second pipeline panel.
- **Grok's frames lag Grok's own `DEBATE.md`.** Four concessions it made in writing aren't drawn, so the frames argue against their author.

## The producer day, walked through both

| Moment in the day | Grok's frames | Opus master | Better for the producer |
| --- | --- | --- | --- |
| **7am: what needs me across every job?** | Phone A: six text rows, each with a stage pill; "Needs you" is one amber word on one row. No filter for it. | Phone 1: a "Needs you 3" chip, and cards that pair a thumbnail with a stage-fact-counter status line. | **Opus.** The first question gets a one-tap answer instead of a scan. |
| **On set: log a release on Harbor Health** | Card, then the Shoot tab (job-scoped). The rail is this job's steps. | Card, then the Shoot tab, same rule. The header names the job, and Brief shows a done check. | **Tie.** Both frames now use Grok's job-scoped tabs, which I adopted in round 3 (R3.2). |
| **Review v3 on the phone** | `master-phone-player`: back label, a tall dark frame, one hint card. No place to post, no Cancel, no notes list, no version, no Approve. | Phone 4 and 5: a 16:9 frame with the live overlay drawn, tap to get a dialog with Cancel and Post, and a Notes pill that opens a sheet with Reply and Resolve. | **Opus.** Grok's frame shows the intent but not the loop: read the note, jump to it, reply, resolve, approve. |
| **Client approves from a link** | Not drawn. `DEBATE.md` states the rule. | Phone 6: brand, review name, film, Approve v3 and Request changes. No team chrome. | **Opus**, on drawing. The rule is the same in both. |
| **Desk: review v3 with the team** | `master-desktop-project`: a 46px "live thin overlay" strip with no frame, a "This step" panel, no notes, no primary action. | Desktop 2: the frame takes the width, click it for a dialog at the pin, a collapsible notes panel beside the film, and "Request approval." | **Opus.** Grok's page can't be reviewed on. |
| **Desk: scan all jobs** | Desktop A: a quiet table with Project, Stage, Now, Health. | Round-1: a card grid. Master: **Grok's table**, plus thumbnails and due dates. | **Grok's idea wins.** It's in the master now. |

## Frame by frame

### Phone A: Projects home

- **Works:** one rail, no left column, and the stage named in words as a right-aligned pill. It's the quietest home of the three comps, and it fits Bailey's "not a cluttered SaaS cockpit."
- **Breaks:**
  - **No thumbnails.** People recognize a production by its frame; Wistia and Wipster both lead with the thumbnail.
  - **No way to filter to "what needs me."**
  - **The Health line mixes kinds of status.** "On set", "Encoding", and "Prep" are status, not health, and Bailey's tokens keep health as a colored dot.
  - **The rail icons** use a play triangle for Cut, which collides with the player's own play control, and a truck for Delivery, a shipping metaphor for a download link.
- **Mine, compared:** round-1 phone A is denser. Master phone 1 keeps Grok's restraint in the header (hamburger, title, search, nothing else) but keeps thumbnails, the "Needs you" chip, and scissors and paper-plane icons.

### Phone B: drawer

- **Works:** it's short, opens from the header only, and dims the list.
- **Breaks, and contradicts Grok's own `DEBATE.md`:**
  - Archive and Trash sit under "Workspace admin." Grok wrote that "Archive under Library is a fair correction."
  - There are no Recents. Grok wrote that "Recents may sit at the top of the drawer."
  - "Deep tools" is a caption Bailey would never say.
  - There's no sign-out, and the account row is a placeholder.
- **Mine, compared:** my round-1 B had duplicates (Projects, Review links), which I conceded. Master phone 2 is Grok's short drawer done to Grok's own rules: Recents (3), Library (Media, Archive, Trash), and Workspace (Team, Settings, and owner-only Admin), plus sign-out.

### Film route: Grok's `master-phone-player` vs my round-1 C vs my master

| | Grok `master-phone-player` | Opus round-1 C | Opus master 4–6 |
| --- | --- | --- | --- |
| App rail hidden | Yes | Yes | Yes |
| Frame geometry | Portrait-tall block, about 740px, for 16:9 cuts | True 16:9, 390×219 | True 16:9, 390×219 |
| Live overlay | A text caption saying it stays | Drawn at about 6% | Drawn at about 6% and not covered |
| Comment | A hint card top-left, not tied to a pin, with no Post | A permanent composer dock (**fails** Bailey's point 3) | Tap, pin, and a dialog *below* the frame with Cancel and Post |
| Reading notes | Nowhere | A permanent list (**fails** point 3) | A sheet on demand, from the Notes pill or a marker |
| Stage | Dark | White | **Dark (taken from Grok)** |
| Approve or version | None | Version pill only | Version, status, one primary action; guests get Approve and Request changes |

Grok's frame was closer to Bailey's intent than my round-1 C, and I said so in round 3. But it drew the intent as captions instead of as a working screen. The master is the working version of Grok's idea.

### Desktop A: Projects hub

- **Works:** the table. A producer with eight live jobs scans rows faster than cards, and the "Now" column (what's true this minute) is the right label.
- **Breaks:**
  - No thumbnails or due dates.
  - The "Health" column holds note counts and status words, not health.
  - The rail has no Projects item, though Grok's `DEBATE.md` now accepts Projects on the rail.
  - There's no "Needs you" filter.
- **Master desktop 1:** the table with a thumbnail column, a stage word plus meter, "Now" with a "Needs you" tag, and a due date with the health dot. The chips are Needs you, Active, the four stages with counts, and Archived, and the default sort puts "Needs you" first.

### Desktop B: inside a project

- **Works:** the stage row is quiet words under the title, and the rail stays as tools. Both match Bailey's desktop intent.
- **Breaks:**
  - **"This step" repeats all four stages** beside the step row. Grok's own rule is that the pipeline isn't duplicated.
  - **The "player" is a 46px strip** with no frame, so there's nothing to click to comment on, which is Bailey's point 3 on desktop.
  - **The notes vanished** between the round-1 frame and the master. There is no way to review.
  - **There's no primary action,** such as Request approval or Share review link.
- **Master desktop 2:** Fable's step cards with a status line each, a version switcher, a frame that takes the width, a dialog at the pin, a collapsible notes panel with Reply and Resolve, and "Request approval" as the one primary action.

## What I took from Grok, now in the master

1. **The quiet table hub** on desktop, including the "Now" column (`master/desktop-1-projects-hub.png`).
2. **A dark review stage** on the phone film route (`master/phone-4`, `phone-5`, and `phone-6`).
3. **The back label names the job and stage** ("‹ Northwind · Cut").
4. **Job-scoped stage tabs inside a job,** with the rail doubling as the stepper (R3.2, `master/phone-3-job-cut@2x.png`).
5. **Restraint in the phone header:** hamburger, title, search, and no bell or avatar.

## What I refuse from Grok

1. A film route without a working comment loop and notes on demand.
2. A desktop "player" with no frame.
3. A "This step" panel that duplicates the step row.
4. "Health" that holds status words instead of a health dot.
5. A play-triangle icon for Cut.

## Asks to Grok

1. Redraw your drawer and desktop rail to match your own `DEBATE.md`: Archive and Trash under Library, Recents at the top, and Projects in the rail.
2. Draw the film route as a working screen: a 16:9 frame, the overlay, a pin with a dialog that has Post, and notes on demand. Or say which of mine you'd change.
3. Drop "This step," or say what it does that the step row's status lines don't.

## My final screenshots (confirmed)

- **Round-1** (unchanged, kept as the debate record) in `mocks/cvp-phone-nav-opus55/`:
  - `A-projects-bottom-rail.png`, `B-drawer-open.png`, and `C-film-route-no-rail.png`, each with an `@2x` version. C is superseded by master 4–6.
  - `desktop-A-projects-hub.png` and `desktop-B-inside-project.png`, each with an `@2x` version.
- **Master** (updated in this pass with the Grok steals) in `mocks/cvp-phone-nav-opus55/master/`:
  - `phone-1-projects@2x.png`, `phone-2-drawer@2x.png`, and `phone-3-job-cut@2x.png`.
  - `phone-4-film-tap-comment@2x.png`, `phone-5-film-notes-sheet@2x.png`, and `phone-6-guest-review@2x.png` (the guest frame now shows the idle route with Approve).
  - `desktop-1-projects-hub.png` (now a table) and `desktop-2-project-cut.png`.
