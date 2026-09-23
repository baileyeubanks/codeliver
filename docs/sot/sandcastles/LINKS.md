# Sandcastles SoT — Source Links Index

**Scrape date:** 2026-09-23 (all URLs fetched live, public, unauthenticated; no secrets, no private surfaces). Companion docs: `SANDCASTLES_SCRIPTING_SOT.md` (digest), `CVP_SCRIPTING_ASSISTANT_PACKETS.md` (SCA packets).

## Primary sources (fetched + summarized)

| URL | Fetched | What it yielded |
|---|---|---|
| https://www.sandcastles.ai/ | 2026-09-23 | Positioning ("create viral short-form videos in seconds"), 8-feature grid, how-it-works (feed → outliers → analysis → scripts), pricing shape (Pro from $39/mo annual; Titan: API, 1h refresh, 20 verified channels), credits FAQ (analyze/script/report actions), auth/2FA/passkey notes |
| https://blog.sandcastles.ai/p/vaultlaunch | 2026-09-23 | v3.2 (2025-10-28): **Vault** (Save-To-Vault hook/style extraction), **Scriptwriter v2** (Prompt→Research→Hook→Style→Script; live doc editing; any-length; precision edits), **credits system** (Settings→Usage); doctrine line "Videos → Vault → Scripts" |
| https://blog.sandcastles.ai/p/finisherfixermodes | 2026-09-23 | Story modes (2025-04-01): Original (with research) / Finisher (notes→script, no outside research) / Fixer (raw script→finished, no outside research); mode dropdown on new story |
| https://blog.sandcastles.ai/p/reports | 2026-09-23 | Reports tab (2026-08-17): parameterized **Content Strategy Audit** (video count, sort mode, look-back, frequency, exclusions); verification decoupled from weekly Dashboard report; toggle-off keeps history |
| https://blog.sandcastles.ai/p/hook-genius | 2026-09-23 | Hook Genius Report (2026-09-21): top 3–5 hook strategies w/ explanations, example hooks, source-video mapping, stop-doing list; **MCP code transfer button**; Claude hookwriter workflow example |
| https://blog.sandcastles.ai/p/dashboard | 2026-09-23 | Dashboard (2026-07-20): personal analytics, "1 of 10" recency widget, weekly **Content Strategist** (last-50 videos → topics/formats/hooks/scriptwriting best+worst), **Content Success Formula** shuffle widget, **Diff Analysis** across reports; activation path via Settings→Profile |
| https://blog.sandcastles.ai/p/collections | 2026-09-23 | Collections (2026-06-16): 105 curated pre-analyzed sets — 22 formats, 30 editing styles/visual layouts, 47 visual hooks, 6 signature series; free transcripts/detail/export inside collections |
| https://blog.sandcastles.ai/p/newreleases-091425 | 2026-09-23 | 2025-09-17 bundle: **Channel Filter**, **Copy-As-Prompt** ("Create Prompt" 4th button; system+script instructions), **Default Saved Searches** (2 system presets), **More Like This** (story-shape similarity), **Search Personalization** (account-scoped, no-train promise) |
| https://blog.sandcastles.ai/p/mcp-chatgpt | 2026-09-23 | Sandcastles MCP in ChatGPT/Codex (2026-08-10): top-5 MCP workflows (self-analysis, competitor cohorts, dashboard chat, scriptwriting reverse-engineering, hookwriting generators) |
| https://blog.sandcastles.ai/p/creatorbreakdowns-hanslorei | 2026-09-23 | Sample of analysis vocabulary: topic buckets w/ avg views, format outlier multiples, hook classes ("contrarian verdict"), per-video outlier scores; Audience Bullseye + 3-2-1 mix frameworks shipped as free Claude skills |

## Discovery surfaces

| URL | Result |
|---|---|
| https://blog.sandcastles.ai/archive | Post listing (titles/dates/blurbs) — used to classify feature posts vs creator breakdowns |
| https://blog.sandcastles.ai/sitemap.xml | Full post URL enumeration (33 URLs; 9 feature posts + creator-breakdown series) |
| https://www.sandcastles.ai/sitemap.xml | 404 — main site is a JS SPA (Webflow-export style); only home page scraped |
| https://www.sandcastles.ai/pricing | 404 — pricing content lives on the home page section |
| https://blog.sandcastles.ai/about | 404 — not published |

## Creator-breakdown series (indexed, not individually scraped except hanslorei)

Content-marketing breakdowns demonstrating the product's analysis output; consult per-need, low priority for the scripting assistant lane:
`creatorbreakdowns-nategaffney` (2026-09-23), `-allanpeters` (09-16), `-mariawendt` (09-09), `-dr-becky` (09-02), `-catgpt` (08-26), `-hanslorei` (08-19, scraped), `-calebralston` (08-12), `-samreadsbooks` (08-05), `-qoves` (07-29), `-rpn` (07-22), `-gardenary` (07-15), `-orenmeetsworld` (07-08), `-adrianper`, `-jbcopeland`, `-gannonmeyer`, `-jessijean`, `ava-creator-breakdowns`, `shelby-sapp-creator-breakdowns`, `-callanfaulkner`, `-wantsandneeds`, `ryanto` — all under `https://blog.sandcastles.ai/p/`.

## Internal cross-references

| Repo doc | Relevance |
|---|---|
| `docs/COVIDEOPRO_SCRIPTING_REFERENCES.md` | 2026-07-17 screenshot-still pattern notes (hook bank shape, taxonomy cards, outlier scoring, honest processing states, queued adoption) |
| `docs/COVIDEOPRO_COMPETITIVE_TEARDOWN.md` | §2 Sandcastles benchmark; §4 E1–E4 wave ordering this lane slots into |
| `docs/COVIDEOPRO_CCO_UNIVERSE_ADOPTION.md` | Surface H cockpit north star (MAIN INSPIRATION mockup mapping) |

## Re-scrape protocol

1. Re-fetch the 10 primary URLs before starting any SCA packet implementation.
2. Diff against `SANDCASTLES_SCRIPTING_SOT.md` §4 feature inventory; append new releases with dates.
3. Record the re-scrape date + drift notes in this file's table (add a "Re-scraped" column entry per row that changed).
4. Public sources only — never authenticate, never scrape behind login, never copy non-public material into this repo.
