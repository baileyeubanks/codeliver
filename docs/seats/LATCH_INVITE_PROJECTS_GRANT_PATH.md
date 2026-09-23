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

## What the handler does once the proxy admits the path

`app/api/teams/invites/route.ts`, token flows only:

| Method | Result Latch should trust |
| --- | --- |
| `GET ?token=` | 401 signed out. 404 `INVITE_NOT_FOUND`. 410 `INVITE_EXPIRED`. 403 `FORBIDDEN` when the session email differs (“This invitation was sent to a different email address”). Otherwise the invite summary. |
| `PATCH { token, action: accept\|decline }` | Same email match. Accept inserts `team_members`. No email is sent. |

`POST /api/teams/invites` creates an invite and calls `sendEmail`. `DELETE` revokes. The allowlist matches paths, not methods, except for a few media reads. Admitting `/api/teams/invites` admits `POST` and `DELETE` unless the new pattern or a method check keeps them on the admin host.

CVP-CLIENT-API-ALLOWLIST-01 owns the code change (`bc-57f4541d-4af2-59c9-b213-ba1d63ad05ef`). Minimum client admission:

- `GET`/`HEAD` `/api/projects`, `/api/projects/:id`, `/api/projects/:id/assets`
- `GET`/`HEAD` `/api/assets` and the per-asset reads the projects page actually calls
- `GET` and `PATCH` `/api/teams/invites` only

Leave closed: billing, TUS upload, transcode worker, admin media stream, `/api/teams`, `/api/teams/audit`, invite `POST`, invite `DELETE`. Handler RBAC stays. Those tests above move with the allowlist. They are the current lock, not the product goal.

## Latch’s read after the allowlist lands

A later 403 `FORBIDDEN` (email mismatch), 404 `INVITE_NOT_FOUND`, or 410 `INVITE_EXPIRED` is the handler. Grade that as auth. Until `SURFACE_FORBIDDEN` is gone, the screen is the client allowlist.

Credentials stay on the 0600 Mac. This note has no tokens, no cookie, and no approval to send.
