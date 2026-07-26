# Auth Provisioning Launch Gate

Public account creation creates an Auth identity only. It never writes staff or
client authority. The signup response is `202 Accepted` with
`access.state = "pending"` and `authorityGranted = false`.

The email callback:

- checks code exchange failures;
- accepts only local non-authentication return paths;
- stays on the host where the session cookie was created;
- sends identities without exact `app_metadata.content_coop_role` authority to
  `/login?access=pending`; and
- never infers authority from an email address or user-editable metadata.

## Human-reviewed bootstrap

The bootstrap utility is dry-run by default. It lists only email-confirmed Auth
users whose normalized email domain is exactly `contentco-op.com` as possible
staff candidates. Listing a candidate does not approve or update that user.

```sh
node --experimental-strip-types scripts/auth/bootstrap-roles.ts
```

Preview explicit approvals without writing:

```sh
node --experimental-strip-types scripts/auth/bootstrap-roles.ts \
  --staff-user-id AUTH_USER_ID \
  --client-user-id AUTH_USER_ID
```

For a reviewed approval file:

```json
{
  "staffUserIds": ["AUTH_USER_ID"],
  "clientUserIds": ["AUTH_USER_ID"]
}
```

Apply only after reviewing the dry-run receipt:

```sh
node --experimental-strip-types scripts/auth/bootstrap-roles.ts \
  --apply \
  --approval-file /absolute/path/to/reviewed-approvals.json
```

Apply mode refuses an empty approval set, rejects unknown or unconfirmed users,
requires staff users to have an exact confirmed `@contentco-op.com` address, and
requires clients to be named by Auth user ID. A domain never grants client
authority. If any selected ID fails preflight, no writes begin.

The utility merges `content_coop_role` into existing `app_metadata`, preserving
unrelated server-controlled claims. Each run writes a mode-`0600`, secret-free
JSON receipt under `~/.local/state/content-co-op/auth-provisioning/` unless
`--receipt` supplies another path. The receipt contains the Auth project host,
candidates, explicit approvals, and outcomes; it never contains service keys.

Do not run apply mode until the admin and client host routing tests are green and
the reviewed user IDs are attached to the release record.
