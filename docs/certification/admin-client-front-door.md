# Admin/Client Front Door Regression Certification

**Date:** 2026-07-15  
**Repository:** `contentco-op/cco-codeliver`  
**Audited HEAD:** `585a703d6bfbee6a2a6c0bd46f93b30a4dd7f298`  
**Snapshot:** Live, dirty, concurrent checkout; HEAD identifies the base commit, not a clean tree  
**Status:** **PASS for local containment; production launch remains blocked**

This certification covers the shared Co-VideoPro login, exact managed-host
classification, password and callback session handling, and the production API
launch gate. It does not authorize deployment, DNS changes, role provisioning,
or application of the pending identity-governance migrations.

## Contract Results

| Contract | Result | Evidence |
| --- | --- | --- |
| One branded login | Pass | Canonical, admin, and client hosts share `/login` and the exact Co-VideoPro `AuthShell` |
| No email-only privilege escalation | Pass | Surface authority accepts only exact server-controlled `app_metadata.content_coop_role` claims |
| Safe return paths | Pass | Browser and server resolvers reject encoded auth loops, authority confusion, backslashes, and decoded control bytes |
| Password-login authority | Pass | Pending and wrong-surface sessions are cleared locally; sign-out failure returns a generic unavailable state |
| Callback authority | Pass | Pending, wrong-surface, and provider-failure states are explicit and non-cacheable; cleanup must succeed before the UI claims it did |
| Exact portal remediation | Pass | Client mismatches link to `client.contentco-op.com`; staff mismatches link to `admin.contentco-op.com` |
| Canonical API role split | Pass | A client role on `co-videopro.com` receives the client API allowlist rather than inheriting admin routes |
| Client workspace containment | Pass | Client identities land on `/reviews`; all producer pages are denied and `/` or `/projects` redirect to the review inbox |
| Client assignment authority | Pass in source | `/api/client/reviews` binds exact confirmed-email assignments to the authenticated reviewer and returns a bounded server DTO |
| Public review boundary | Pass | Token review remains outside the authenticated cockpit and internal navigation shell |

## Defects Closed

### ACFD-001 - Encoded unsafe browser return targets

`resolveSafeReturnPath` now repeatedly decodes the candidate pathname before
checking authentication routes, slash or backslash authority forms, and control
bytes. The browser and server policies fail closed for the same attack set.

### ACFD-002 - Password login left a valid session on the wrong portal

`/api/auth/login` now evaluates the server-issued role after authentication.
Unprovisioned identities return `AUTH_ACCESS_PENDING`; cross-surface identities
return `AUTH_SURFACE_MISMATCH`. Both paths clear only the current session before
returning. The login page converts the mismatch into an exact portal link while
preserving only a sanitized local return path.

### ACFD-003 - Canonical host granted client identities the admin API list

The canonical host now defers protected API selection until the authenticated
role is known. Staff receives the reviewed admin allowlist; client receives the
minimal client allowlist. Unknown APIs remain launch-gated before identity
lookup.

### ACFD-004 - Callback terminal states were silent or overstated cleanup

Pending callbacks now clear the provisional session and show an explicit
pending notice. Callback and password-login cleanup failures return stable,
provider-neutral errors. The interface no longer says a session was cleared
unless local sign-out succeeded.

### ACFD-005 - Client login opened the producer workspace

The client surface now has one purpose-built review inbox at `/reviews`.
Client navigation exposes only Reviews, producer account controls are hidden,
and the host policy redirects root and project-index requests to the inbox while
denying every other protected producer page. The inbox reads only the new
server-owned assignment DTO and never calls project, asset, folder, settings,
or identity APIs.

### ACFD-006 - Public review records exposed internal fields and limited links leaked subresources

Public asset, version, comment, approval, and edit-decision responses now use
explicit field allowlists. Limited-view links receive a signed HttpOnly review
grant after the base review is claimed; media, comments, approvals, and edit
decisions require that grant. The isolated authority uses an atomic claim RPC,
while the legacy local adapter retains a compare-and-swap fallback.

## Launch Blockers

1. `supabase/migrations/20260715190000_client_review_principal_binding.sql`
   and the other isolated-authority migrations are authored but **not applied**.
   A controlled staging database must prove that a client JWT cannot read or
   write staff tables directly while staff and the server DTO remain functional.
2. `/api/identity/context` is source-gated to staff/admin authority, but its
   identity-governance migration and real provisioning path remain unapplied
   and unproven. Source tests are not production database evidence.
3. Cross-domain sign-in between `co-videopro.com` and the two
   `contentco-op.com` portals requires a deliberate central-auth handoff. The
   current safe behavior asks the user to authenticate on the exact target host.
4. Public approval mutation still needs a database-level concurrency proof;
   route-level checks alone do not certify simultaneous approval decisions.
5. Browser screenshots and live host tests remain pending because the selected
   in-app Browser backend is unavailable and no DNS/deployment action is allowed
   in this integration.

## Verification

| Command | Result |
| --- | --- |
| Client inbox, host, navigation, public review, and launch-gate tests | **PASS: 57/57** |
| Approval, comment, notification, and public-review boundary reconciliation | **PASS: 25/25** |
| Complete repository test suite | **PASS: 691/691** |
| `npm run typecheck` | **PASS** |
| Repository ESLint | **PASS: 0 errors, 26 existing warnings** |
| Sites/native production build gate | **PASS: 64 static pages generated** |

The Node runner emitted the repository's existing typeless-package warning. It
did not affect results. The selected in-app Browser reported no available
backend, so no new visual or console evidence is claimed. No deploy, push,
migration, Cloudflare, GoDaddy, Sites publish, or public Content Co-op site
change was made.
