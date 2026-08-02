# Full-Stack Journey Regression Certification

**Date:** 2026-07-14  
**Repository:** `contentco-op/cco-codeliver`  
**Audited HEAD:** `585a703d6bfbee6a2a6c0bd46f93b30a4dd7f298`  
**Worktree:** Live, dirty concurrent snapshot; the HEAD identifies the base commit, not a clean checkout  
**Status:** **FAIL - 7 journey defects, 8 failing regression gates**

This lane was limited to new `tests/journey-*.test.ts` coverage and this report. No application, component, library, configuration, package script, existing test, browser, server, external service, or production state was changed.

## Inventory and Coverage

The inventory covered all page routes plus the user-facing API families for authentication, projects, assets, versions, comments, edit decisions, approvals, sharing, notification preferences/sends, storage readiness, and resumable upload. Existing unit and contract coverage was retained; the new tests target cross-surface gaps rather than duplicate isolated helpers.

| Journey family | Automated contracts | Result |
| --- | --- | --- |
| Login, signup, signout, safe demo, return paths | Safe nested return targets, managed-auth redirect, local demo entry, account/signout routes | 1 defect |
| Projects, media, review, annotations, comments, approvals, versions, cuts | Create-to-review local journey, recipient authority, annotation validation, exact version/invite binding, cut persistence | 3 defects |
| Upload loading, progress, error, readiness | HTTP error mapping, readiness gate, TUS ingest, progress, pause/resume/retry, quarantine, release URL | 1 defect (2 gates) |
| Sharing, batch links, permissions, revoke/rotate, notifications | Tenant ownership, idempotency, batch manifests, live-send confirmation invalidation, loading/error state | 1 defect |
| Settings, preferences, branding, email/text controls | Profile, appearance, branding, email/SMS/iMessage persistence and route targets | Pass |
| Rail, submenus, notifications, account navigation | Desktop/mobile parity, role filtering, review-focus query/hash, notification/account destinations | Pass |
| External recipient authority and shell separation | Invite/asset/version/visibility binding, sequential approval authority, public shell isolation | 2 defects |
| Persistence, reload, isolation, empty/offline states | Local storage reload, project/version/tenant isolation, revoked links, empty/error/offline behavior | 3 defects |

Mobile and desktop assertions cover route and state invariants only. Pixel layout and interactive browser behavior remain in the parent visual QA lane by design.

## Defects

### JRG-001 - Critical - Active project upload bypasses the authoritative ingest and publishes raw source URLs

**Source:** `app/(dashboard)/projects/[id]/page.tsx:168`, `app/(dashboard)/projects/[id]/page.tsx:304`, `app/(dashboard)/projects/[id]/page.tsx:325`, `app/(dashboard)/projects/[id]/page.tsx:338`  
**Regression gates:** `tests/journey-upload-sharing.test.ts:74`, `tests/journey-upload-sharing.test.ts:96`

**Reproduction:** Open a production project and choose a file. The active handler uploads directly to the Supabase `deliverables` bucket, calls `getPublicUrl(path)`, and creates the asset with that public URL. It never checks `/api/storage/readiness` or uses `/api/upload/tus`, even though the unused authority surface in `components/assets/AssetUpload.tsx:109` and `components/assets/AssetUpload.tsx:155` provides those controls.

**Expected:** The active project route must delegate to the readiness-gated resumable uploader. Checksum, quota, retry, quarantine, and release authority must complete before a release-ready derivative URL reaches the asset catalog; the raw source object must never become the public asset URL.

### JRG-002 - High - Demo review endpoint lets the external recipient decide another approval step

**Source:** `app/api/review/[token]/approvals/route.ts:29`, `app/api/review/[token]/approvals/route.ts:34`, `app/api/review/[token]/approvals/route.ts:39`  
**Regression gate:** `tests/journey-demo-review.test.ts:271`

**Reproduction:** Invoke `PATCH /api/review/demo/approvals` with `{ "id": "approval-2", "status": "rejected" }`. The seeded external reviewer belongs to `approval-1`, but the endpoint returns HTTP 200 and mutates any seeded approval ID.

**Expected:** Demo access must enforce the same recipient, permission, and sequential-step authority as production. A foreign or inactive approval step must return HTTP 403 and remain unchanged.

### JRG-003 - High - Public demo comments disappear after reload

**Source:** `lib/review/submit-review-comment.ts:31`, `app/review/[token]/page.tsx:529`  
**Regression gate:** `tests/journey-demo-review.test.ts:341`

**Reproduction:** Submit a comment from a public demo review, then reload the review. The helper returns an in-memory comment and the page appends it with `setComments`; neither path calls the existing demo workspace persistence authority.

**Expected:** A successful demo comment must be written to the demo workspace, scoped to its project/asset/version, and restored on reload before success is shown.

### JRG-004 - High - Public demo approval decisions disappear after reload

**Source:** `app/review/[token]/page.tsx:615`, `app/review/[token]/page.tsx:630`, `app/review/[token]/page.tsx:632`  
**Regression gate:** `tests/journey-demo-review.test.ts:352`

**Reproduction:** Record an approval from the public demo review and reload. The demo branch only updates React state for approvals, asset status, and active IDs.

**Expected:** The decision, note, reviewer authority, resulting asset status, and next active sequential step must be committed through the demo workspace authority and restored on reload.

### JRG-005 - High - Managed authentication loses the protected return path

**Source:** `proxy.ts:96`  
**Regression gate:** `tests/journey-auth-navigation.test.ts:99`

**Reproduction:** With Supabase configured and no authenticated user, request a protected nested route such as `/projects/ica?asset=denie-mcdonald-v4&view=review#comments`. The proxy redirects to `/login` without a `next` value.

**Expected:** The login redirect must preserve one sanitized local pathname plus query so successful authentication returns to the requested review focus. Unsafe and authentication-loop destinations must remain rejected by the existing auth policy.

### JRG-006 - High - Public demo review links into the authenticated workspace shell

**Source:** `app/review/[token]/page.tsx:788`, `app/review/[token]/page.tsx:790`  
**Regression gate:** `tests/journey-auth-navigation.test.ts:115`

**Reproduction:** Open a public demo review and follow the `Projects` breadcrumb. It targets `/projects?demo=1`, crossing from recipient review into the internal workspace.

**Expected:** External recipient pages must remain a distinct public shell. Public navigation may close the review or return to an explicitly public destination, but it must not expose internal project navigation.

### JRG-007 - Medium - Share-load failures render as a legitimate empty state

**Source:** `components/sharing/ShareLinkList.tsx:59`, `components/sharing/ShareLinkList.tsx:64`, `components/sharing/ShareLinkList.tsx:125`  
**Regression gate:** `tests/journey-upload-sharing.test.ts:157`

**Reproduction:** Make `GET /api/assets/:id/share` reject or return an unreadable response. The component swallows the rejection, marks loading complete, and renders `No active handoffs yet`.

**Expected:** A failed fetch must retain an explicit retryable error state. The empty state may render only after a successful response proves there are no links.

## Verification

| Command | Result |
| --- | --- |
| `node --experimental-strip-types --test tests/journey-*.test.ts` | **FAIL:** 19 tests, 11 pass, 8 fail; all failures map to JRG-001 through JRG-007 |
| `npm test` | **FAIL:** an earlier moving snapshot had 229 tests, 218 pass, 11 fail; 8 journey failures plus 3 transient concurrent Vault failures |
| `node --experimental-strip-types --test --test-reporter=spec tests/*.test.ts` | **FAIL:** final isolated run had 229 tests, 221 pass, 8 fail; only JRG-001 through JRG-007 failed |
| `node --experimental-strip-types --test tests/contracts/*.test.ts tests/contracts/*.test.mjs tests/journeys/*.test.mjs` | **PASS:** 24/24 |
| `npm run typecheck -- --pretty false` | **PASS** |
| `npm run lint -- --quiet` | **PASS** |

The full-suite baseline moved during this audit. The three additional Vault failures in the earlier snapshot changed on a targeted rerun and all passed in the final isolated full run, so they are not promoted to journey defects. The final full-suite failure set contains only the eight intentional gates for the seven defects above.

## Added Regression Gates

- `tests/journey-auth-navigation.test.ts`
- `tests/journey-demo-review.test.ts`
- `tests/journey-upload-sharing.test.ts`

These gates intentionally remain red for the seven documented defects. They should turn green through application fixes owned by the relevant implementation lanes, not by weakening the contracts.
