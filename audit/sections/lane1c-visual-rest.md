# Lane 1c — Visual audit: /library, /field, /settings, /invite/[token], global chrome

Audit date: 2026-07-25. App: Co-VideoPro (Next.js 16 + React 19), demo mode (?demo=1, localStorage), http://localhost:4103.
Method: Playwright screenshots (`audit/shots/`), computed-style/overflow/interaction probe (`audit/scripts/lane1c-probe.mjs`), source reading. OBSERVED only. No app files modified; demo localStorage left as found (verified restored: field day 2026-08-17 = "scheduled").
Design tokens (app/globals.css:9-26): --bg #f0ebe0, --surface #faf6ef, --ink #0b1928, --muted #5f6b78, --dim #8a7f6c, --accent #1e4d8c, --border rgba(11,25,40,.14).
Note: a dark "N" circle bottom-left in shots is the Next.js dev-mode indicator, not app chrome.

---

## 1. /library — Media library

Shots: `audit/shots/library-1440x900.png`, `library-768x1024.png`, `library-375x812.png`, `library-image-filter-empty-1440x900.png`. Source: `app/(dashboard)/library/page.tsx`.

1. **Identity: YES.** Kicker "ASSET MANAGEMENT", h1 "Media library", asset grid — looks like its name.
2. **First impression:** ordered, calm editorial dashboard — but **all 8 asset thumbnails render as broken-image icons** (shot library-1440x900). Probe: 8/8 `<img>` with naturalWidth=0; optimizer URL `/_next/image?url=%2Fdemo%2Fceraweek-speaker.jpg&w=384&q=75` returns **HTTP 400 "The requested resource isn't a valid image"** (`curl`), while the raw file is a valid 1920x1300 JPEG served 200 at `/demo/ceraweek-speaker.jpg` (`file` + `curl`). Failure is in the image-optimizer pipeline, not the assets. The page's focal content is visually destroyed at every viewport.
3. **Hierarchy:** kicker → h1 → subtitle → 4-stat strip → search+filters → grid. Clear and consistent at all three widths.
4. **Density/spacing:** page px-4/py-5 (16/20px); stat cells min-h 74px, px-3 py-3 (page.tsx:153); grid gap 16px (page.tsx:232); card text block p-3. Even, no crowding.
5. **Type (computed):** h1 22px/700 Bricolage Grotesque; body Inter. **Font-size census across the page: 11 distinct sizes** — 22, 18, 16, 14, 13.12, 12.48, 12, 11.52, 11, 10, 8.5px (probe `library1440.type.fontSizeCensus`). >6 → drift; the fractional 13.12/12.48/11.52px values indicate a fluid/clamp scale producing non-round rendered sizes.
6. **Colors (computed):** ink rgb(11,25,40)=#0b1928, muted #5f6b78, kicker #8a7f6c, input bg #faf6ef, accent #1e4d8c — all from the token set; no rogue hexes observed.
7. **L1 instructional prose (verbatim):**
   - "Search, inspect, and reopen project assets without leaving the Co-VideoPro workspace." — subtitle, page.tsx:135-137.
   - Stat footers: "Linked workspaces", "In review or changes", "Ready for delivery" — page.tsx:110/116/123.
   - Empty state: "Upload media from a project cockpit so review, approvals, versions, and sharing stay linked." — page.tsx:221.
8. **L2 status check:** all four stat cards (Assets 8, Projects 4, Review queue 5, Approved 2) are computed from live demo-workspace records (page.tsx:91-97) and the "N visible" footer updates with filters (observed "0 visible" after zzzz search) — **backed**. Type-filter pills reflect real state (`aria-pressed`, page.tsx:184) — backed.
9. **Empty/loading/error:** skeleton grid exists (page.tsx:199-207); "No matching assets" and "No media assets yet" states verified live (shot library-image-filter-empty; probe `noMatchText`). **No error state:** the `/api/assets` fetch failure is swallowed (`.catch(() => {})`, page.tsx:82) — a failed load renders as an empty library.
10. **Interactive inventory:** search input (works), 5 filter pills (work), asset cards = Links to asset detail (one, "Charles Drummond_v5", has a custom `href` and renders accent-blue — inconsistent styling vs siblings), "Upload in project" → /projects (works). Dead/broken: the 8 thumbnails (above). No dead buttons found.
11. **Responsive overflow:** none. Probe scrollWidth == clientWidth at 1440/768/375 with zero offending elements. 768 drops the rail entirely (top-bar only); 375 adds hamburger + bottom tab bar.
12. **Verdict: POLISH.** Layout, states, and tokens ship — fix the broken `/_next/image` thumbnail pipeline and the page is whole.

## 2. /field — shoot-day mode

Shots: `field-375x812.png` (primary), `field-768x1024.png`, `field-1440x900.png`, `field-after-mark-375x812.png`. Source: `app/(dashboard)/field/page.tsx`.

1. **Identity: YES.** Project picker, day chips, call/wrap card, locations & clearances, unit roster — unmistakably a shoot-day tool.
2. **First impression (375x812):** genuinely phone-native: 560px max column centered (page.tsx:116), 44px-min touch targets on every action (page.tsx:46), bottom tab bar reachable by thumb. A crew member could run this one-handed.
3. **Hierarchy:** project select → day chips → day card (date · type, call/wrap, status) → locations → unit. Shot-list section appears only on principal days (page.tsx:190) — correct scoping; scout day shown.
4. **Density:** cards padding 14px/16px, 14px between cards (page.tsx:28-34); rows 8px vertical. Readable at arm's length.
5. **Type:** h1 text-xl (20px); section titles 11px/650 uppercase 0.12em (page.tsx:36-43); body 13-14px. Small set, consistent.
6. **Colors:** same token set; card bg `var(--card, #fffdf8)` (page.tsx:29); status text uses --muted; actions --accent.
7. **L1 verbatim:** "The shoot day in your pocket — shots, releases, clearances." — page.tsx:119. Empty: "No production days for {project} yet. Days land here as they are scheduled." — page.tsx:186. Shot-list empty: "No shot list for this day yet — build it in the Plan surface." — page.tsx:225.
8. **L2 status check:** "SCHEDULED" = `anchorDay.status` (page.tsx:167) — backed. "agreement signed · cleared 2 · restricted 3" = real record fields/array lengths (page.tsx:264) — backed. "UNIT (3)" = filtered crew count (page.tsx:273) — backed. Nothing decorative found.
9. **States:** non-demo mode gets a proper empty state ("Field works with the local workspace…", page.tsx:66-75); no-project state exists (page.tsx:84-93). Action feedback via `role="status" aria-live="polite"` notice (page.tsx:283-285) — observed live: "2026-08-17 → in progress." after tapping Mark in progress (probe).
10. **Interactive inventory:** project select (router.replace, works), day chips (select day, works; cancelled days dimmed 0.45), "Mark in progress" (mutates local demo store, confirmed). **Caveat: day status is a one-way machine** — scheduled→in_progress→wrapped, with only cancelled→scheduled reversible (page.tsx:15-20); a mis-tap on "Mark wrapped" cannot be undone in this UI.
11. **Overflow:** page-level none at all three widths. Day-chip rail intentionally scrolls (scrollWidth 659 > clientWidth 351 at 375; probe `field375.chipNav`); offenders flagged (BUTTON right=382/517/671) live inside that `overflow-x:auto` nav (page.tsx:137), not page overflow.
12. **Verdict: SHIP (demo).** Best surface audited; only wish: an undo path for terminal day-status taps.

## 3. /settings

Shots: `settings-1440x900.png`, `settings-768x1024.png`, `settings-375x812.png`, `settings-notifications-1440x900.png`. Source: `app/(dashboard)/settings/page.tsx`, `components/auth/SettingsFrame.tsx`.

**Section inventory (7 tabs, probe `settingsTabs`):** Account (identity, profile names/role/email, Save profile, reviewer color swatches), Organization, Security, Preferences (incl. local-workspace reset), Notifications (4-channel readiness + per-channel toggles/events/digest/SMS number/iMessage dry-run), Systems, Brand. URL-synced via `?section=` (page.tsx:121-133).

**Persistence test (allowed single toggle):** Notifications → In-app switch flipped off → `aria-checked` true→false → reload → still false → **persists** (localStorage demo store); restored to original afterward (probe `settingsToggle`).

1. **Identity: YES.** Settings nav + sections; reads as a real settings surface.
2. **First impression:** enterprise-grade, dense but organized; the "Local governance demo" badge keeps demo-ness honest.
3. **Hierarchy:** page title → tab rail (vertical ≥1280, horizontal scroll-strip below) → section cards. Sound.
4. **Density:** generous; readiness cells min-h 78px (page.tsx:315). Mobile stacks cleanly.
5. **Type/colors:** same tokens as library; 10px uppercase labels + 14px body.
6. **L1 verbatim:** "Each channel is permission-aware. Dry-run and unconfigured channels are visible so the workspace never implies a message was sent when no provider is connected." — page.tsx:306 (a design-philosophy paragraph sitting on the surface). Also "The email address remains owned by the authentication provider." (Account, observed in shot settings-1440x900), and "Identity attributes shown across internal comments, approvals, and audit records." (shot).
7. **L2 status check:** readiness cards backed by real settings state — In-app/Email "Enabled" from channel flags, Text "Needs number" from E.164 validation, iMessage "Not connected" from relay status; check vs alert icon switches on the `good` flag (page.tsx:317-319) — **backed**, unusually honest. "owner" badge = session role — backed. "Local controls" badge = demoMode — backed.
8. **States:** SMS-guard verified in code: enabling Text without valid number is refused with notice (page.tsx:378-382). iMessage toggle forced to dry_run when not_connected (page.tsx:452-457).
9. **Interactive:** no inert controls found in Notifications; other tabs render dedicated components (IdentitySettings, StudioSystemsSettings, BrandSettings) — not exhaustively clicked per read-only scope; only the single allowed toggle was flipped.
10. **Responsive overflow:** none (probe at 1440/768; 375 fine). **768 tab strip clips "Brand" at the right edge with no scroll affordance** (shot settings-768x1024); 375 shows ~3.5 tabs, same story.
11. **Verdict: POLISH.** Honest, persistent, well-guarded; trim the philosophy prose and add scroll affordance to the tab strip.

## 4. /invite/[token] — bogus token (`/invite/does-not-exist`)

Shots: `invite-bogus-1440x900.png`, `invite-bogus-375x812.png`. Source: `app/invite/[token]/page.tsx` → `components/auth/TeamInviteAcceptance.tsx`.

- **Error state renders:** card "Invitation unavailable" / "This access change was not applied." with red banner "Authentication is not configured for this environment" (TeamInviteAcceptance.tsx:223-224 + API error passthrough at :66-78).
- **Misdiagnosis:** a nonexistent token and a missing auth backend produce the same screen — the copy blames environment configuration, not the token. Without auth, unauthenticated visitors are bounced to `/login?next=…` (observed before --auth), so the token-error path is only reachable authed.
- **Desktop truncation bug:** the three reassurance cards under the card are cut off — "Shared works…", "Verified sessi…", "Local paths o…" at 1440x900 — while 375x812 shows them fully ("Shared workspace", "Verified session required", "Local paths only"). Desktop renders less information than mobile.
- L1: "This access change was not applied." plus "Private account access" footer.
- "Return to sign in" link present and centered. No overflow at either width.
- **Verdict: POLISH.** Structure is fine; error copy must distinguish bad token from unconfigured auth, and the desktop card row needs its truncation fixed.

## 5. Global chrome (Shell)

Shots: `chrome-command-palette-1440x900.png`, `chrome-command-palette-375x812.png`, `chrome-notifications-1440x900.png`, `chrome-notifications-375x812.png`, `chrome-account-menu-1440x900.png`, `chrome-upload-dialog-1440x900.png`, `chrome-mobile-drawer-375x812.png`. Source: `components/Shell.tsx`, `components/navigation/WorkspaceNavigation.tsx`.

- **Desktop:** left rail (WORKSPACE / PRODUCTION / LIBRARY / ADMIN / RECENT PROJECTS groups), header with search button, demo-only Upload button (Shell.tsx:256-269), help icon, bell, account menu. **768: rail disappears entirely**, header keeps a search icon-button. **375: hamburger + bottom tab bar** (Home / Projects / Pipeline / More; `mobileNavigation(role).slice(0,3)` + More, WorkspaceNavigation.tsx:44,60-83) and a full drawer with search, recent projects, collapsible groups (shot chrome-mobile-drawer).
- **Search / command palette:** Ctrl/⌘+K opens a working palette (verified desktop + mobile, shots) listing actions, nav, projects, assets with section labels (Shell.tsx:90-141, `components/navigation/CommandPalette.tsx`). Mobile palette input placeholder clips ("…projects, and me") at 375.
- **DEAD CODE:** `components/SearchModal.tsx` and `components/UploadMonitor.tsx` are imported nowhere (`grep -rn "SearchModal\|UploadMonitor" app components lib` → only self-references). UploadMonitor additionally renders static "No uploads in progress" / "No completed uploads" under both tabs with no data source (UploadMonitor.tsx:42-52) — decoration masquerading as status, currently unreachable but one import away from lying.
- **Notifications:** bell opens popover with 3 latest activity items + "View all" → /activity (Shell.tsx:295-313); verified desktop + mobile (full-width sheet at 375, usable). **L2 violation:** the red dot `<i />` shows whenever `activity.length > 0` (Shell.tsx:293) — no read/unread record exists, so the badge is permanently on; it asserts "new" with nothing behind it.
- **Account menu:** name/email, "Workspace Owner", demo "View as" role switcher (owner/producer/editor/reviewer/viewer), Profile, Preferences, Log out (Shell.tsx:332-368) — verified (shot).
- **Upload:** opens GlobalUploadDialog (project picker, file input, "Local workspace — files stay on this machine in demo mode.") — verified, not submitted (shot chrome-upload-dialog).
- **Help icon:** mailto:hello@contentco-op.com (Shell.tsx:270-277) — functional but it's "email us", not help.
- Offline banner wired to `useOnlineStatus` (Shell.tsx:382-386); not triggered during audit.
- L1 on chrome: command-palette item descriptions double as instructional prose ("The shoot day in your pocket — shots, releases, clearances", "Restore or review removed project media", etc. — visible in palette shot).
