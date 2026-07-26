# Admin/Client Front Door Regression Certification

**Date:** 2026-07-14
**Repository:** `contentco-op/cco-codeliver`
**Audited HEAD:** `585a703d6bfbee6a2a6c0bd46f93b30a4dd7f298`
**Snapshot:** Live, dirty, concurrent checkout; HEAD identifies the base commit, not a clean tree
**Status:** **FAIL - 1 defect, 1 failing focused gate**

This lane owns only `tests/admin-client-front-door.test.ts` and this certification record. It did not change implementation files, Cloudflare configuration, runtime configuration, or deployment state. Concurrent implementation changes were re-read before every final assertion.

## Contract Results

| Contract | Result | Evidence |
| --- | --- | --- |
| One branded login | Pass | One `/login` page renders the shared Content Co-op / Co-Deliver `AuthShell` on admin, client, and neutral workspace host contexts |
| No email-only privilege escalation | Pass | Matching a privileged email does not change membership authority; server routing accepts only unambiguous `app_metadata` role claims and ignores email or user-editable metadata |
| Safe return paths | **Fail** | The server resolver rejects encoded auth loops, encoded authority confusion, and encoded control bytes; the browser resolver still accepts five unsafe encodings |
| Admin/client cross-surface behavior | Pass | Exact host classification, fail-closed role mapping, API/write denial, and safe GET rerouting are present |
| Mobile/desktop shells | Pass | Auth, workspace, cockpit, and public-review shells retain bounded mobile and desktop geometry plus safe-area behavior |
| Cockpit/public-review boundary | Pass | Internal projects retain `ProjectCockpit`; public token review remains outside `Shell`, `DemoSessionGuard`, internal links, and authenticated cockpit routing |

## Defect

### ACFD-001 - High - Browser login accepts encoded unsafe return targets rejected by the server

**Source:** `components/auth/auth-policy.ts:46`, `app/login/page.tsx:27`, `app/login/page.tsx:63`
**Safe server reference:** `lib/auth/host-surface.ts:121`
**Regression gate:** `tests/admin-client-front-door.test.ts:134`

`resolveSafeReturnPath` checks the raw input and the URL origin, but does not repeatedly decode the candidate pathname before checking auth routes, slashes, backslashes, or control bytes. A direct request to the public login page can therefore place an encoded target in `next`; the login page accepts it as `requestedPath` and passes it to `router.replace` after authentication.

Current browser-resolver results:

| Input | Actual | Expected |
| --- | --- | --- |
| `/%6cogin?next=/projects` | unchanged | `/projects` |
| `/%2f%2fattacker.example/session` | unchanged | `/projects` |
| `/%5c%5cattacker.example/session` | unchanged | `/projects` |
| `/projects%00/admin` | unchanged | `/projects` |
| `/projects%0d%0aSet-Cookie:test` | unchanged | `/projects` |

The server-side `buildProtectedReturnPath` already fails closed for the same inputs. Browser and server validation must share equivalent decoding and rejection rules so a public `/login?next=...` request cannot bypass the proxy's sanitized redirect path.

**Recovery order:**

1. Make the browser auth policy consume the same decoded-path safety contract as `buildProtectedReturnPath`, while preserving valid local query strings and browser-only hashes where intended.
2. Keep encoded auth routes, encoded slash/backslash authority forms, malformed escapes, and decoded control bytes fail-closed.
3. Rerun the focused gate unchanged. Do not remove encoded attack cases or replace them with source-only assertions.

## Durable Guard Coverage

`tests/admin-client-front-door.test.ts` protects:

- exactly one shared branded login route and accessible Content Co-op lockup;
- admin, client, alias, and neutral workspace presentation contexts;
- membership and trusted-claim authority independent of email strings;
- ambiguous or conflicting role claims failing closed;
- browser and server return-path attack cases;
- exact managed-host classification and safe canonical reroutes;
- boundary-aware public route matching rather than raw prefix matching;
- API and non-GET cross-surface denial;
- mobile-first auth geometry, desktop auth geometry, safe-area offsets, cockpit collapse, and public-review rail widths;
- internal cockpit ownership and stripped public-review navigation/authority boundaries.

## Verification

| Command | Result |
| --- | --- |
| `node --experimental-strip-types --test --test-reporter=spec tests/admin-client-front-door.test.ts` | **FAIL:** 7 tests, 6 pass, 1 fail (`ACFD-001`) |
| `node --experimental-strip-types --test --test-reporter=spec tests/admin-client-front-door.test.ts tests/host-surface-routing.test.ts tests/auth-presentation.test.ts` | **FAIL:** 14 tests, 13 pass, 1 fail; only `ACFD-001` is red |

Node also emitted the repository's existing typeless-package warning. It did not cause the failure. No full suite, browser, external service, Cloudflare, or deployment command was run from this lane.
