# How this nav operates

Looks are second. This is the operating model for the comps in this folder, argued against Fable (`mocks/cvp-phone-nav-fable`, PR 31) and Opus 5.5 (`mocks/cvp-phone-nav-opus55`, PR 30). Peer comps were read from those branches. Nothing here changes the live shell.

The master frames are `master-phone-*.png` and `master-desktop-*.png`. They keep one meaning per control.

## 1. Why these five bottom items

**Projects · Brief · Shoot · Cut · Delivery** are the producer’s day, in order. Each one is a place you work, not a report.

| Route | What the producer does |
| --- | --- |
| Projects | Pick the job. See which productions are live, open one, change jobs. This is the only cross-project screen. |
| Brief | Read and advance the living brief for **this** job: intent, audience, deliverables, which version is approved. |
| Shoot | Run the production day for **this** job: call, shots, releases, what is still uncaptured. |
| Cut | Work the edit for **this** job: the version in review and the open notes. This is the door into the film. |
| Delivery | Finish **this** job: QC, masters, the package a client can take. |

A sixth slot would be a dashboard in disguise (Activity, Reviews, Requests). Reviews are notes inside Cut. Activity is a trail on the job, not a home.

**Where Fable is right.** The rail is the pipeline, five items, thumb zone, badges only as “what needs you.” Admin stays out of the rail.

**Where Fable is wrong.** The open question treats the rail as possibly global (“all projects in Cut”) with a filter chip. That makes one tab two products. A badge on Cut is right only when it counts notes on the job in hand.

**Where Opus is right.** Projects is home. The rail caps at five. A cut-waiting count is the only badge.

**Where Opus is wrong.** “From home each stage tab shows work across projects; inside a project it jumps to that stage.” The same control changes meaning. A producer cannot learn a tab that is sometimes an inbox and sometimes a chapter.

**Master rule.** Projects is the only cross-project route. Stage chips on that list are filters (“show jobs in Cut”). Brief, Shoot, Cut, and Delivery always open the current job at that step. The header names the job. If no job is current, those four open the most recently active job and say its name. They never become an all-projects inbox.

## 2. Why deep tools are a slide-in drawer

On a phone the left edge is the film and the list, not a second app.

- **Thumb.** The work rail sits in the bottom reach. Library, Team, Settings, and Admin are reached with the header menu, then a vertical list. You do not hold a permanent column open with the other hand.
- **Film first.** A fixed left column on 390px steals the width of every project row and every frame. The drawer covers the list only while you are choosing a tool, then it leaves.
- **Load.** Five phase words stay visible. The drawer is for tools you open on purpose, not every time you switch scenes. If the drawer is also Review links, Templates, Billing, and Recent projects, it has become another home.

**Fable is right** that the drawer is weekly and the rail is hourly, and that the motion should respect reduced motion. **Fable is wrong** to also open the drawer with an edge swipe. On the film, a side swipe is scrub and comment gesture. The drawer opens from the header button only.

**Opus is right** that the panel slides over a scrim and is dismissible. **Opus is wrong** to fill it with Review links (that is Cut), Recent projects (that is Projects), Templates, and Billing. Those are either the five routes or Admin. The master drawer is Library, Team, Settings, and Admin (Archive, Trash, workspace admin).

## 3. Player / review film

**Hide the app bottom bar.** Do not shrink the frame to fit it, and do not paint it over the picture.

Wistia’s controls belong to the picture and get out of the way while you watch. Wipster’s review gesture is a tap on the frame at a timecode. The phone’s bottom bar is the producer’s job switcher. On the film you are already inside Cut. Leaving the bar up puts “switch jobs” in the same thumb zone as “mark this frame,” and it eats the safe area the comment needs.

On that route the chrome is the player’s: back to this job’s Cut, a thin transport, tap-the-frame to comment. The five routes return when you leave the film. The drawer does not edge-swipe here.

**Opus is right** that the rail can hide so the thin player and click-to-comment keep the height. **Fable does not decide.** Our earlier phone frames also stopped at the list. The master phone frame `master-phone-player.png` is the decision: no app bar on the film.

Desktop has no bottom bar. The film still does not gain a second pipeline. Back returns to the project’s Cut step. The tools rail can stay, because it is not covering the frame and it is not the comment gesture. It does not grow a Reviews item beside the film.

## 4. Login → Projects

The first question after sign-in is which job. A dashboard answers “how is the whole workspace?” and then makes you click through to the job anyway.

All three comps agree on this destination. The master keeps the hub as a list (desktop can be a quiet table, not a widget board). Health is a dot. The phase is a word. Sapphire is the active control, not a color per phase.

## 5. Desktop

Width makes a **thin left tools rail** cheap: Library, Team, Settings. The mark returns to Projects. There is no bottom bar. The phone’s five-item rail is not copied into the desktop chrome.

Inside a project, Brief → Shoot → Cut → Delivery is a step row in the page. It is how you move through that job. It is not a second copy of a global nav.

**Opus is right** that the stepper lives under the project title and that the frame gets the room. **Opus is wrong** to put Projects, Reviews, and Admin in the same rail as the tools. Reviews duplicates Cut. Projects duplicates the mark. Admin belongs behind Settings for people who can manage the workspace, not as a daily icon.

**Fable** has no desktop operating model in the comp. Nothing from a missing desktop is borrowed.

Stage filters stay on the Projects hub, matching the phone’s chips, so “everything in Cut” has one home on both sizes.

## 6. Failure modes to refuse

- **Left rail and bottom bar both permanent on the phone.** Two maps, and the list and the film lose width. The drawer is allowed only because it is not permanent.
- **App bottom bar over the film, or a shorter film reserved for that bar.** The comment gesture and the job switcher collide. Hide the bar.
- **Guest inherits team nav.** A review-link guest gets that film, the timecode comment, and a way back. They do not get Projects for the workspace, Library, Team, Settings, Billing, or Admin. A workspace member who is only a reviewer can open the projects they are on, and still does not get Admin. Fable still shows Team to reviewers. Opus shows Billing and Admin in the same drawer as the daily tools. Both fail this test if those rows are not role-gated off the guest session.
- **One tab, two meanings.** Global inbox on the hub, chapter inside a project. Refused.
- **Edge swipe that opens tools while a frame can be scrubbed.** Refused on the player route.

## What the master keeps from each

| Keep | From | Drop |
| --- | --- | --- |
| Five phase routes, Projects as the only cross-project home, drawer for deep tools | All three | A sixth primary destination |
| Drawer is occasional; rail is the work | Fable | Edge swipe on the film; global stage tabs |
| Hide the app bar on the player; stepper inside the project; stage chips as filters on the hub | Opus | Drawer junk (Review links, Templates, Billing, Recent); Reviews in the desktop rail; tabs that change meaning |
| Tools rail is Library, Team, Settings; pipeline is not chrome | This comp | A desktop bottom bar; a permanent phone column |
