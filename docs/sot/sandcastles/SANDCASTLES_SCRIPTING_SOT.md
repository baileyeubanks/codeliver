# Sandcastles Scripting — Source-of-Truth Scrape

**Date:** 2026-09-23 · **Owner:** Bailey · **Lane:** CVP Scripting Assistant (Co-Script weave, T6-adjacent)
**Purpose:** canonical source-of-truth digest of Sandcastles' public scripting product, mined from live public pages, to serve as the **template** for the Co-VideoPro (CVP) Scripting Assistant. Patterns only — the audit's dialect and CVP doctrine (provenance law, honest states, professional production OS) govern any adoption. **Not a build order.** Build detail lives in `CVP_SCRIPTING_ASSISTANT_PACKETS.md` (SCA-001…).

**Sources (all fetched live 2026-09-23; full index in `LINKS.md`):**
- `https://www.sandcastles.ai/` — marketing home (positioning, feature grid, FAQ, pricing shape)
- `https://blog.sandcastles.ai/p/vaultlaunch` — v3.2: Vault + all-new Scriptwriter (Prompt→Research→Hook→Style→Script) + credits
- `https://blog.sandcastles.ai/p/finisherfixermodes` — Original / Finisher / Fixer story modes
- `https://blog.sandcastles.ai/p/reports` — Reports tab + Content Strategy Audit
- `https://blog.sandcastles.ai/p/hook-genius` — Hook Genius Report + MCP code-transfer
- `https://blog.sandcastles.ai/p/dashboard` — Analytics Dashboard + Content Strategist + Success Formula + Diff Analysis
- `https://blog.sandcastles.ai/p/collections` — Collections inspiration library (105 curated sets)
- `https://blog.sandcastles.ai/p/newreleases-091425` — Channel Filter, Copy-As-Prompt, Saved Searches, More-Like-This, Search Personalization
- `https://blog.sandcastles.ai/p/mcp-chatgpt` — Sandcastles MCP in ChatGPT/Codex
- `https://blog.sandcastles.ai/p/creatorbreakdowns-hanslorei` — sample of analysis vocabulary (topics/formats/hooks buckets, outlier scores, Audience Bullseye)
- Prior local evidence: `docs/COVIDEOPRO_SCRIPTING_REFERENCES.md` (26 screenshot stills, 2026-07-17), `docs/COVIDEOPRO_COMPETITIVE_TEARDOWN.md` §2

---

## 1. Product identity (what Sandcastles is, in its own words)

- **Promise:** "Create viral short-form videos in seconds." Research top channels → find viral outliers → remix into your own winning videos.
- **Claimed scale:** "Trusted by 100k+ creators and brands," "millions of videos analyzed daily," 4.92/5 rating, plans from $39/mo annual (Pro), Titan tier adds API access + 1h refresh + up to 20 verified channels.
- **Platforms:** Instagram, TikTok, YouTube Shorts (one feed across all three).
- **Metering:** credits system — credits spend on three action classes: **analyzing videos, writing scripts, running reports** (Settings → Usage shows balance/usage).
- **Author voice:** founder-led (Kane Kallaway), every release post ends with a direct-email invitation; release notes are narrative walkthroughs with screenshots and a tutorial video link.

**CVP read:** their identity is consumer-viral growth tooling; ours is a professional production OS. We take the *machinery* (research → hook → style → script, vault, reports, honest states) and none of the *posture*.

---

## 2. Information architecture (as observable from public surfaces)

Top-level tabs/objects referenced across posts (their names):

| Surface | Role | Evidence |
|---|---|---|
| **Videos** | Outlier discovery feed; filters (channel, keywords, views, engagement, posted-in, platform, analyzed/unanalyzed); sort presets; "More Like This"; idea detail page with 4 action buttons (incl. "Create Prompt") | home, newreleases-091425, stills 4:47 AM |
| **Channels** | Watchlist management: suggested/describe/search/URL adds; "Submit new channel" import; channel verification for personal analytics | home, newreleases-091425, stills 11:28 AM |
| **Collections** | Curated inspiration library: 105 sets across FORMATS (22) / EDITING STYLES + VISUAL LAYOUTS (30) / VISUAL HOOKS (47) / SIGNATURE SERIES (6); pre-analyzed (transcripts + detail + export free of credits); search + flexible sort | collections, stills 4:46 AM |
| **Hooks** | Hook bank surface; "Generate more hooks" modal with `[variable]` template slots + provenance (@channel + view count) + search; "Add hook from URL" capture modal | home, stills 4:42 AM / 1:35 PM |
| **Vault** | Personal archive of extracted hook + style templates saved from any video ("Save To Vault"); reusable inside the scriptwriter | vaultlaunch |
| **Scripts / Scriptwriter** | The 5-step scripting flow (below); story-mode dropdown (Original/Finisher/Fixer) on new story | vaultlaunch, finisherfixermodes |
| **Reports** | Parameterized analyses (Content Strategy Audit, Hook Genius Report); per-report settings + on/off toggle; history of runs | reports, hook-genius |
| **Dashboard** | Personal analytics (top half) + Content Strategist (weekly auto-report) + Content Success Formula widget + Diff Analysis | dashboard |
| **Ideas Inbox** | Landing zone for async analysis output ("added to Ideas Inbox when complete") | stills 1:36 PM |
| **Settings → Usage** | Credit balance + usage | vaultlaunch |
| **Settings → Profile** | Social verification + "Enable Personal Analytics Dashboard" | dashboard |
| **MCP / Export** | Export buttons on reports; MCP server for Claude/ChatGPT/Codex; "MCP code transfer" button; Copy-As-Prompt | hook-genius, mcp-chatgpt, newreleases-091425 |

**IA pattern worth noting:** every object (video, hook, style, collection, report) is *saveable, searchable, and portable* — nothing is trapped in the surface where it was found.

---

## 3. Core flows (the scrape's primary payload)

### 3.1 The canonical scriptwriter flow — `Prompt → Research → Hook → Style → Script`

Source: vaultlaunch (v3.2, 2025-10-28). Their words: "as dynamic and flexible as ChatGPT/Claude, with an added layer of special sauce specifically for short-form… the perfect amount of customization while still getting you to a viral script in <60 seconds."

1. **Prompt** — user states the idea/topic (base context).
2. **Research** — system mines for facts/angles to ground the script (in Original mode).
3. **Hook** — auto-generates new hooks *leveraging Vaulted hook formats*; "magical flow and addicting to play with." User picks/edits a hook before proceeding.
4. **Style** — "acts like a filter on top of your writing… instantly convert any script to mimic the templated writing style and story structure" (from Vaulted styles).
5. **Script** — full draft with upgraded controls: **edit live like a Google Doc, adjust to any length, layer on precision edits with exact granularity**.

Key workflow doctrine (theirs): **Videos → Vault → Scripts** — research objects become reusable templates become scripts. The UX is "intentionally designed to make it as easy as possible to leverage your Vaulted hooks/styles."

### 3.2 Story modes — Original / Finisher / Fixer

Source: finisherfixermodes (2025-04-01). A dropdown on every new story:

| Mode | Input | Research? | Output |
|---|---|---|---|
| **Original** | base context/notes | yes — mines facts/angles, user builds outline | generated script |
| **Finisher** | raw notes | **no outside research** | finished script |
| **Fixer** | raw script (draft) | **no outside research** | finished script |

Purpose: "focus the scriptwriter on only your desired input context… super helpful for anyone making niche or expertise focused content." This is a *context-scoping* primitive: the user controls whether external research enters the generation context.

### 3.3 The Vault — extraction → reusable template

Source: vaultlaunch. "Save To Vault" on any video extracts the **hook and/or style** into a reusable template usable when writing any new script. Positioned as "your personal archive of winning content formulas." Answers: "How can I easily make my own version of a viral hook/script that already worked in my niche?" Vaulted items feed the Hook and Style steps directly.

From stills (4:42 AM): hook templates carry `[variable]` slots + provenance (@channel + view count) + search. From stills (1:35 PM): single-purpose capture modal (URL → analyze → save to favorites) with an honest platform-scope note.

### 3.4 Research/discovery flow — feed → outliers → analysis → idea

Sources: home, newreleases-091425, stills.
- Customize feed from channels across IG/TikTok/YT Shorts.
- **Outlier score** (0.2×–100× multiplier) is the ranking primitive; filter by channel, keywords, views, engagement, posted-in window, platform, analyzed/unanalyzed.
- **Saved Filters** = named presets of filter+sort combos; two system defaults ship to all users ("Sandcastles Default", "Sandcastles Exceptional").
- **Channel Filter** = single-creator analysis path; unknown handles importable via "Submit new channel."
- **More Like This** = similarity on *story shape*, not keyword overlap ("videos that tell similar stories, not just ones where the same keywords show up").
- **Search Personalization** = learns from searches/clicks; explicit privacy line: "we don't use your data to train any models or make suggestions to other users."
- Per-video: instant transcript download, deep analysis (hooks, storytelling, formats, styles — "why it went viral").
- Async honesty: "Analysis started" toast names the job *and where output lands* ("added to Ideas Inbox when complete"); per-card "Analyzing…" state.

### 3.5 Reports — parameterized, schedulable analysis objects

Sources: reports (2026-08-17), hook-genius (2026-09-21).
- Reports live in a dedicated **Reports tab**; each Report has customizable parameters, keeps run history, and can be toggled off without losing past runs.
- **Content Strategy Audit** (first report type): analyze any single channel or cohort → top topics, hooks, formats, scriptwriting tactics. Parameters: number of videos, sort mode, look-back window, analysis frequency, exclusions (e.g., brand deals). Example question it answers: "top performing topics from @xyz, last 30 days, sorted by outlier score, excluding brand deals."
- **Hook Genius Report** (second type): single-channel focus; analyzes biggest outliers / most recent / highest engagement; output = **top 3–5 winning hook strategies** with clear explanation, example hooks, and **mapping back to the original videos** that used them — plus what is *not* working and should be stopped.
- **Portability:** every report has an Export; the Hook Genius report adds an **"MCP code transfer" button (upper right)** — one click to port the full analysis + underlying data into Claude/ChatGPT for conversation and downstream tooling (their example: a Claude-built hookwriter that emits 10 hooks per topic from report principles).
- Dashboard coupling: the weekly Content Strategist *is* a pre-built recurring Content Strategy Audit; users can tune or disable it from the Reports tab while keeping metrics.

### 3.6 Dashboard — proactive strategist loop

Source: dashboard (2026-07-20).
- **Personal Analytics (top half):** verified-channel performance; one channel or aggregate; following/gained/views/posts over any period; hover charts to see which videos drove outliers; a rebuilt "1 of 10" recency widget (latest video vs last 8); blue **Refresh** button pipes real-time stats.
- **Content Strategist:** weekly auto deep-analysis of up to last 50 videos per verified channel → best/worst topics, formats, hooks, scriptwriting techniques; click any category for a tactical breakdown of what is/isn't working.
- **Content Success Formula:** widget that composes winning topic × format × hook into a "recipe for future content"; **shuffle for infinite combinations** — suggestions for exactly what to make next.
- **Diff Analysis:** once multiple reports exist, analyzes how insights change over time → what to double down on, what to stop, non-obvious patterns. The intended loop: run report → iterate next batch → verify the changes worked.
- Cross-links: strategist says a format works → view top examples in Collections; a hook works → view examples in Hooks tab.

### 3.7 Portability flows — Copy-As-Prompt, Export, MCP

Sources: newreleases-091425, mcp-chatgpt, hook-genius, dashboard.
- **Copy-As-Prompt:** 4th action button ("Create Prompt") on every idea detail page → copies a script prompt for ChatGPT/Claude with optional system instructions + script-specific instructions on topic, hook, story structure, style, and research facts. Stated motive: "we don't want to lock you into using our scriptwriting tools." Honest caveat printed in-product: the quick prompt "will not be better than custom built scriptwriting tools found in the Sandcastles Script tab."
- **Export:** reports export and drag into any AI tool.
- **MCP server:** Claude/ChatGPT/Codex connectors; top user workflows: deep self-analysis, competitor cohort analysis, conversing with Dashboard data, scriptwriting workflows (reverse-engineer winning structures), hookwriting workflows (generators that improve as new top videos emerge). Tools include e.g. "Get personal analytics."

---

## 4. Feature inventory (chronological, with scrape-verified detail)

| Date | Feature | Scrape-verified substance |
|---|---|---|
| 2025-04-01 | Story modes | Original/Finisher/Fixer dropdown; Finisher/Fixer exclude outside research (finisherfixermodes) |
| 2025-09-17 | Channel Filter | handle autocomplete; import unknown channel; fastest single-creator outlier path (newreleases-091425) |
| 2025-09-17 | Copy-As-Prompt | idea detail "Create Prompt" button; system + script instructions; editable research facts (newreleases-091425) |
| 2025-09-17 | Default Saved Searches | filter/sort presets; two system defaults (newreleases-091425) |
| 2025-09-17 | More Like This | story-shape similarity, not keyword match (newreleases-091425) |
| 2025-09-17 | Search Personalization | account-scoped learning; explicit no-train/no-cross-user promise (newreleases-091425) |
| 2025-10-28 | Vault | Save-To-Vault extraction of hook/style templates from any video (vaultlaunch) |
| 2025-10-28 | Scriptwriter v2 | Prompt→Research→Hook→Style→Script; live doc editing; any-length; precision edits (vaultlaunch) |
| 2025-10-28 | Credits | one currency across research/analysis/hooks/scripts; Settings→Usage (vaultlaunch) |
| 2026-06-16 | Collections | 105 curated, pre-analyzed sets; free transcript/detail/export inside collections (collections) |
| 2026-07-20 | Dashboard | personal analytics + weekly Content Strategist + Success Formula + Diff Analysis (dashboard) |
| 2026-08-10 | MCP (ChatGPT/Codex) | social data inside OpenAI tools; 30-second setup (mcp-chatgpt) |
| 2026-08-17 | Reports tab | parameterized reports; Content Strategy Audit; verification decoupled from weekly report (reports) |
| 2026-09-21 | Hook Genius Report | top 3–5 hook strategies w/ examples + source-video mapping + stop-doing list; MCP code transfer (hook-genius) |

Analysis vocabulary (from creator breakdowns, e.g. hanslorei): accounts decompose into **topic buckets** (with post counts + avg views), **format** performance (avg views + outlier multiple), **hook classes** (e.g. "contrarian verdict" vs "passive lecture"), and per-video **outlier scores**; strategy frameworks (Audience Bullseye, 3-2-1 mix) ship as free Claude skills that funnel back into the product.

---

## 5. Must-copy UX (for the CVP Scripting Assistant)

Doctrine-filtered patterns to adopt. Each maps to an SCA packet.

1. **Five-step guided spine with visible progress** — Prompt → Research → Hook → Style → Script. One job per step, each step's output inspectable before advancing, <60s to first full draft. (SCA-001)
2. **Context-scope modes** — Original/Finisher/Fixer equivalent: user explicitly chooses whether outside research enters generation. Mode is a first-class, visible control on every new script, not a hidden setting. (SCA-002)
3. **Save-to-bank extraction** — any analyzed object can be distilled into a reusable, searchable template with `[variable]` slots and provenance (source segment ids / view counts / channel). Bank items feed generation directly. (SCA-003)
4. **Hook step as a generator, not a text field** — "generate more hooks" against banked formats; picking a hook is a deliberate checkpoint before drafting. (SCA-004)
5. **Style as a filter layer** — a style template transforms an existing draft without regenerating content substance; instantly reversible/re-appliable. (SCA-005)
6. **Real editor at the end** — live doc-style editing, explicit length control, precision edit instructions on a selection. Generation ends in an *editor*, not a wall of text. (SCA-006)
7. **Honest async states everywhere** — toast names the job and where output lands; per-card pending states; no silent spinners. (Matches our outbox/transcode discipline — validated pattern.) (SCA-007)
8. **Portability without lock-in** — Copy-As-Prompt / export / API-shaped access to any report or script packet, with honest in-product caveats about what the quick path gives up. (SCA-008)
9. **Parameterized report objects with history + toggle** — analyses are saved, re-runnable, schedulable objects, not one-off chats; disabling keeps history. (SCA-009)
10. **Ranked-evidence browsing** — outlier-score analog (reasoning score) as the default sort; saved filter presets; "more like this" on story shape. (SCA-010)
11. **Success-formula composer** — topic × format × hook combinator with shuffle, grounded in the project's own winning data. (SCA-011)
12. **Usage/metering honesty** — one visible place (Settings → Usage analog) for credit/cost balance; every metered action labeled before it runs. (SCA-012)

## 6. Must-NOT take (doctrine boundaries)

Carried from the teardown (§2) and scripting-references doc; re-confirmed against the live scrape:

1. **No consumer-viral framing** — no "find viral outliers / go viral / dominate" growth-hacker tone anywhere in CVP copy. We are a professional production OS; the assistant serves client deliverables, not follower counts.
2. **No ungrounded generation** — their scripts lean on scraped web facts; ours must bind every generated claim to project evidence (transcript segments, briefs, decisions) or label it as unverified. Provenance law is non-negotiable.
3. **No gradient-rainbow identity** — their taxonomy cards use gradient covers as identity; in CVP color stays state-only. Taxonomy without the rainbow.
4. **No public-channel surveillance as a core loop** — watchlists/outlier feeds of other creators are off-mission until E4; the CVP assistant researches *inside the project's own record* first.
5. **No dark-pattern metering** — credits are fine as a concept; hiding costs, refund refusal copy, or urgency marketing are not.
6. **No black-box personalization** — their personalization promise ("never trains on your data") is good copy; ours must be architecturally true (account-scoped, inspectable, no cross-tenant leakage).
7. **No fake-instant claims** — "<60 seconds to a viral script" is marketing; CVP surfaces honest processing states with real durations and destinations.
8. **No MCP-name reuse / no external data piping** until CVP's own export contract is hardened and reviewed; portability must not bypass auth boundaries.

---

## 7. CVP mapping summary (where each pattern lands)

| Sandcastles pattern | CVP home | Status |
|---|---|---|
| Prompt→Research→Hook→Style→Script | Co-Script weave (T6) scripting assistant spine | Packet SCA-001 |
| Original/Finisher/Fixer | Script context modes | Packet SCA-002 |
| Vault | Hook & Style Bank (provenance-bound) | Packet SCA-003 |
| Hook generator modal | Hook step | Packet SCA-004 |
| Style filter | Style step | Packet SCA-005 |
| Live script editor | Script step / editor | Packet SCA-006 |
| Research mining | Evidence step on project transcripts/reasoning | Packet SCA-007 |
| Analysis-started honesty | Async state contract | Packet SCA-008 |
| Copy-As-Prompt / Export / MCP | Portability surface | Packet SCA-009 |
| Reports (Strategy Audit, Hook Genius) | Project insight reports | Packet SCA-010 |
| Outlier score + saved filters + More-Like-This | Reasoning-scored evidence browser | Packet SCA-011 |
| Success Formula shuffle | Treatment composer | Packet SCA-012 |
| Credits / Settings→Usage | Metering honesty | Packet SCA-013 |
| Collections taxonomy | Templates surface (brand film / recap / podcast / social series) | Queued — Templates lane (bible §Settings/Templates) |
| Dashboard / watchlists / verification | E4 research lane | Explicitly later — do not build now |

**Update rule:** re-scrape on major Sandcastles releases or before any SCA packet implementation starts; record drift in `LINKS.md`.
