# Latch — invite accept and `/projects` 403

Date: 2026-09-23
Seat: Latch (auth). Code change: CVP-CLIENT-API-ALLOWLIST-01.
Repo: `baileyeubanks/codeliver` on `main` at `4a68788`.

Login form fill on `https://client.contentco-op.com` already reaches `/projects`. This note is the next fetch. A resend waits on Bailey. No client or crew send is approved from this note.

## What the screen is showing

Two client-host failures share one gate:

| Screen | Where the words come from | Call that fails |
| --- | --- | --- |
| Invitation unavailable | `components/auth/TeamInviteAcceptance.tsx` error heading | `GET /api/teams/invites?token=…` |
| Projects unavailable · 403 | `app/(dashboard)/projects/page.tsx` via `loadProjectsRemoteState` | `GET /api/projects` and `GET /api/assets` |

`loadProjectsRemoteState` (`lib/api/projects-collection.ts`) requests both collections together. The first non-OK status is the number after the dot. On the client host that status is 403.

## The gate is the client API allowlist

`proxy.ts` `productionApiLaunchGate` runs before `getUser`. On `client.contentco-op.com` the allowed API list is `CLIENT_API_ROUTE_PATTERNS`:

- `/api/auth/(login|logout|session|signup|resend|google|password/forgot|reset)`
- `/api/health` and its live/ready/dependencies probes
- `/api/version`
- `/api/review/…` including review media

`/api/projects`, `/api/projects/:id`, `/api/projects/:id/assets`, `/api/assets`, `/api/assets/:id`, and `/api/teams/invites` sit on `ADMIN_API_ROUTE_PATTERNS` only.

A client-host miss returns `surfaceAccessDenied`:

```json
{ "error": "This account is not authorized for this surface", "code": "SURFACE_FORBIDDEN" }
```

HTTP 403, `Cache-Control: no-store`. The session cookie is not read. A staff identity on the client host gets the same body. Rows in `team_members`, `project_members`, or `team_invites` are not consulted.

Tests that lock this current contract:

- `tests/production-api-launch-gate.test.ts` — client `POST /api/projects`, `/api/assets`, and `/api/teams` expect `SURFACE_FORBIDDEN`, and `getUser` is not called.
- `tests/host-surface-routing.test.ts` — client `POST /api/projects` expects `SURFACE_FORBIDDEN` for a staff identity on the client host.

`/api/teams/invites` uses the same admin pattern (`/^\/api\/teams(?:\/(?:audit|invites))?$/`) and the same client miss. The launch-gate test names `/api/teams`; the invite URL is the same family.

The HTML page can still be 200. The proxy admits `/projects` and `/invite/:token` for a client session. The 403 is the API the page then calls.

## Why the invite heading is this gate

`app/invite/[token]/page.tsx` checks the session, the pending invite, email match, and expiry on the server. A miss there is `notFound()` (404). It does not render “Invitation unavailable”.

That heading is only the client component’s error state. `TeamInviteAcceptance` treats 401 as “Sign in to continue”. Every other failed response, including 403 `SURFACE_FORBIDDEN`, uses the heading “Invitation unavailable” and prints `body.error` when it is a string. On this gate the alert text is “This account is not authorized for this surface”. The heading is the client mapper. The code is the allowlist.

After accept, the component routes to `/projects`, which then hits the projects 403 above.

## Second gate, after the proxy

The invite page and the invite API do not use the same client.

`app/invite/[token]/page.tsx` reads with `getSupabase()`, the service-role client, then checks the session email. A match renders `TeamInviteAcceptance`.

`GET` and `PATCH` in `app/api/teams/invites/route.ts` then read and write with the caller session from `requireAuthWithClient`. Policies in `supabase/migrations/010_teams_security.sql` and `supabase/migrations/20260715093300_fail_closed_co_production_authority.sql` show `team_invites` to team admins and insert `team_members` at admin rank. The invitee is not a member yet, so the caller client does not see the row and cannot insert the membership. The API answers 404 `INVITE_NOT_FOUND` (or a failed insert). The same heading, “Invitation unavailable”, covers that result.

Opening the allowlist alone leaves this gate. [PR 18](https://github.com/baileyeubanks/codeliver/pull/18) is the narrow land: `GET`/`HEAD` on `/api/projects`, `/api/assets`, and `/api/teams/invites`, plus `PATCH` on `/api/teams/invites`, and the recipient read/accept uses the service client only after the session email matches. Invite create and revoke stay on the caller client. That draft does not send mail.

[PR 15](https://github.com/baileyeubanks/codeliver/pull/15) opens the paths and also every method on them, including `POST /api/projects` and `POST /api/teams/invites`. It does not move the recipient read off the caller client. Latch grades PR 18 for this bug. PR 15 stays the wider workspace list, and its invite `POST` stays a send Bailey has not approved.

## Drafts already open

Two drafts touch this gate. They conflict if both merge.

[PR 18](https://github.com/baileyeubanks/codeliver/pull/18) (`cursor/reel-compress-invite-grant-7436`) is the grant Latch needs. It admits `GET`/`HEAD` for the project list, the asset list, and `/api/teams/invites`, and `PATCH` for accept/decline. It keeps invite `POST` and `DELETE` on the admin host. It reads and writes the recipient row with the service client after the email check.

[PR 15](https://github.com/baileyeubanks/codeliver/pull/15) (`cursor/client-api-allowlist-05ef`, CVP-CLIENT-API-ALLOWLIST-01) admits these client-host paths in `CLIENT_API_ROUTE_PATTERNS`:

- `/api/projects`, `/api/projects/:id`, `/api/projects/:id/assets`
- `/api/assets`, `/api/assets/:id`, and `/:id/(versions|comments|comments/attachments|edit-decisions|share)`
- `/api/teams/invites`

`main` has neither draft. Until one of them merges, the 403 above is still the live gate.

The new patterns match the path only. Every method on those paths clears the launch gate for a client role on the client host. The new test locks `GET` and `PATCH` on invites, and it also locks `POST /api/projects`. It does not deny `POST` or `DELETE` on `/api/teams/invites`.

`POST /api/teams/invites` still calls `sendEmail` after a team-admin check. `POST /api/assets/:id/comments` imports `sendEmail` as well. A client who already has handler authority can reach those sends from `client.contentco-op.com` once PR 15 merges. That is a send. Bailey has not approved one. Latch does not fire it, and Latch does not treat a green allowlist as a yes.

PR 18 already keeps invite `POST` and `DELETE` on the admin host. If PR 15 lands on its own, it still needs that method check, and it still needs the service-role recipient read. Billing, TUS, transcode, `/api/media/stream`, `/api/teams`, and `/api/teams/audit` stay closed in PR 15. That part matches the seat.

## What the handler does once the proxy admits the path

On `main`, the caller client hits the admin-only policies first, so a matching invitee gets 404 before this table can succeed. After PR 18, this is the handler Latch grades:

| Method | Result Latch should trust |
| --- | --- |
| `GET ?token=` | 401 signed out. 404 `INVITE_NOT_FOUND`. 410 `INVITE_EXPIRED`. 403 `FORBIDDEN` when the session email differs (“This invitation was sent to a different email address”). Otherwise the invite summary. |
| `PATCH { token, action: accept\|decline }` | Same email match. Accept inserts `team_members`. No email is sent. |

`POST /api/teams/invites` creates an invite and calls `sendEmail`. `DELETE` revokes. The allowlist matches paths, not methods, except for a few media reads. Admitting `/api/teams/invites` admits `POST` and `DELETE` unless the new pattern or a method check keeps them on the admin host.

Handler RBAC stays after the proxy. The launch-gate tests on `main` are the current lock, not the product goal. PR 15 moves `tests/production-api-launch-gate.test.ts` with the new paths. `tests/host-surface-routing.test.ts` still posts `/api/projects` as a staff identity on the client host and expects `SURFACE_FORBIDDEN`. That assertion can stay: staff on the client host fails `roleCanAccessSurface` and the API mismatch path returns the same body. It is no longer proof that a client role is denied.

## Latch’s read after the allowlist lands

A later 403 `FORBIDDEN` (email mismatch), 404 `INVITE_NOT_FOUND`, or 410 `INVITE_EXPIRED` is the handler. Grade that as auth. Until `SURFACE_FORBIDDEN` is gone, the screen is the client allowlist.

Credentials stay on the 0600 Mac. This note has no tokens, no cookie, and no approval to send.
