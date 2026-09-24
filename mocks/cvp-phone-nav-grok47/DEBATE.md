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

**Master rule.** Projects is the only cross-project route. Stage chips on that list are filters (“show jobs in Cut”). Brief, Shoot, Cut, and Delivery always open the current job at that step. The header names the job. If no job is current, those four do not silently open the last one. They return to Projects with that stage chip already on, and the producer picks the job. Silence is a hidden mode.

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

**Fable’s desktop notes** (in the running comp, not yet a `DEBATE.md`) say the rail is Projects, Library, Team, and Settings, pipeline chips sit on the hub, and inside a project the rail stays on Projects while a step row carries the phase. That desktop split matches Bailey. Putting Projects on the rail is fine if the mark is not a second home. Reviews on that rail is not fine.

Stage filters stay on the Projects hub, on both sizes, so “everything in Cut” has one home. Those chips filter the list. They are not a second set of routes.

## 6. Failure modes to refuse

- **Left rail and bottom bar both permanent on the phone.** Two maps, and the list and the film lose width. The drawer is allowed only because it is not permanent.
- **App bottom bar over the film, or a shorter film reserved for that bar.** The comment gesture and the job switcher collide. Hide the bar.
- **Guest inherits team nav.** A review-link guest gets the brand, that project’s name, the film, comments, and Approve. No rail, no drawer, no other clients’ names. Opus has this right. Fable’s “reviewers see Library, Team, and Settings” is a member role, not a guest, and it still hands Team to someone who may only be there to comment. A workspace reviewer can open the projects they are on. They still do not get Admin. Billing never sits in the daily drawer.
- **One tab, two meanings.** Global inbox on the hub, chapter inside a project. Refused.
- **Edge swipe that opens tools while a frame can be scrubbed.** Refused on the player route.

## What the master keeps from each

| Keep | From | Drop |
| --- | --- | --- |
| Five phase routes, Projects as the only cross-project home, drawer for deep tools | All three | A sixth primary destination |
| Drawer is occasional; rail is the work | Fable | Edge swipe on the film; global stage tabs |
| Hide the app bar on the player; stepper inside the project; stage chips as filters on the hub | Opus | Drawer junk (Review links, Templates, Billing, Recent); Reviews in the desktop rail; tabs that change meaning |
| Tools rail is Library, Team, Settings; pipeline is not chrome | This comp | A desktop bottom bar; a permanent phone column |
| Guest review is film, comments, and Approve, with no app nav | Opus | Treating that guest as a reviewer who still sees Team |

## Exchange — answer to Fable and Opus

Neither peer has a `DEBATE.md` on the branch yet. This answers the operating claims in Fable’s README and in Opus’s “How the nav operates” rewrite. Fight these points, not the pixels.

**Fable, on the five tabs.** You wrote “the bottom rail is the pipeline” and “that’s where a producer lives every day.” Agreed. You also wrote “the mock assumes global with a project filter chip” and left open whether Cut means every project in Cut. That question is the bug. A filter chip belongs on Projects. The Cut tab is this job’s cut. A badge may count notes on that job. A badge that counts every cut in the workspace is a dashboard sitting in the thumb zone.

**Fable, on the drawer.** “Rail = where I work, drawer = where I configure” is the right split, and the rail staying underneath is right. “☰ (or an edge swipe)” is not. Edge swipe is how a producer scrubs a frame. Open the drawer from the header button. Close it with the button, the scrim, or Esc. Do not teach a side swipe as navigation on a film product.

**Fable, on the film.** You said the drawer must not steal width from the thin player. You never said what happens to the bottom rail when the film is the screen. Decide: hide it. Width was the phone-list problem. Height and the thumb are the film problem. Your desktop line “the nav comp wraps that surface; it doesn’t restyle it” is right. Wrapping still means the app bar leaves.

**Fable, on desktop.** “Pipeline is context, not navigation” and “stages belong to a project, so they never sit in the global rail” is the desktop model Bailey asked for. It contradicts a phone tab that is a global Cut inbox. Keep the desktop reading, and make the phone tabs the same kind of thing: the stage of the open job, not a queue. Projects on your desktop rail is an acceptable home control. Help and account at the foot are fine. Admin under Settings, as you asked Bailey, is right. Archive and Trash belong with Admin, not as if they were the media library.

**Opus, on the five tabs.** You dropped the dual behavior. Good. “A tab that meant all Cut work on the home screen but this project’s Cut inside a project would be a hidden mode” is true, and your first README was that bug. The replacement is the other bug. “Each tab is a cross-project work queue” and “Reviews is the Cut queue” renames the old sitemap. Cut becomes `/reviews`, Shoot becomes `/field`, Brief becomes requests. The producer reads Cut and expects the cut. You send them an inbox. Inside the job you then say “switch stages with the stepper, not the rail,” so the four words on the thumb are not how you move through the day you are in. The iOS stack makes it worse: you are in Harbor Light, you tap Shoot, and the job disappears into every shoot in the company. “What’s in Cut across jobs” is a chip on Projects. Both of us can draw that chip. It does not need its own tab.

**Opus, on login.** “Login lands on Projects” and “use Recents in the drawer rather than auto-reopening the last project” is right. I am dropping the rule that a phase tab with no current job opens the last job. That was silence. With no current job, the phase tab returns to Projects with that chip on.

**Opus, on the drawer.** “The drawer never repeats a rail destination” is the right law. Your own note says the phone drawer still lists Projects and Review links. Those repeat Projects and Cut. Templates and Billing do not belong in the weekly tool list. Recents, if you keep them, are a list inside Projects or a short block under the drawer’s Library, not a second home. Edge swipe as a way to open that drawer is Fable’s mistake. Don’t take it. Edge swipe to leave the film is the same collision with scrub. Back is the chevron.

**Opus, on the film.** “The bottom rail is hidden” and “no hamburger on the film route” and “the composer owns the bottom edge” are right. Wistia and Wipster carrying no app nav is the reason. Your desktop point stands: the left rail costs width, not the comment thumb, so it can stay. It still must not grow a Reviews item. Guest route: “no rail, no drawer, no team names… brand, project name, film, comments, and Approve.” Accepted. That is stricter than a reviewer who still sees Team, and it is the one to ship.

**Opus, on desktop.** Chips on the hub that are “the same queues as the phone’s stage tabs” duplicate the phone nav if those tabs are queues. If the chips only filter the project list, they match this comp and Fable’s desktop. Stepper under the title, agreed. Drop Reviews from the rail, as you said the master would. Projects as one home control, agreed. Admin is not a daily icon beside Team.
