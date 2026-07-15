# Enterprise identity and governance control plane

This directory adds a read-only enterprise authorization decision contract. It
does not change roles, policies, projects, assets, or database state.

## Trust boundary

- `POST /api/enterprise/authorize` authenticates through the existing Supabase
  session and resolves tenant role from `team_members` with the session-bound
  client. Actor id, tenant membership, and role are never trusted from JSON.
- Requests and targets must name the same tenant. Exact schema validation rejects
  unknown privilege-bearing fields.
- The requested policy version must equal the operator-selected active immutable
  version. `enterprise-governance/2026-07-14.0` remains registered as the rollback
  target; changing the server-selected version is an explicit code/configuration
  operation, not a client-controlled fallback. Runtime selection of any
  unregistered version denies with `INVALID_POLICY_CONFIGURATION` and binds its
  receipt to the known active version.
- The idempotency key is SHA-256 over the canonical request without the key.
  Identical evaluation under the same role and policy yields the same decision id;
  changing the payload while reusing a key fails closed.
- A decision only answers whether the enterprise action is permitted. It is not a
  capability token and must not replace resource ownership checks in downstream
  mutation routes.

## Permission invariants

Owners may request identity role changes and policy changes. Admins may read
identity and audit state. Members and viewers may only read the tenant boundary.
The contract cannot assign the owner role, and no actor—including an owner—can use
this surface to mutate their own role.

## Audit and recovery

Every evaluated decision includes a request id, deterministic decision id,
effect, reason, tenant, actor role, action, active policy version, and timestamp.
The route emits a structured server log and sends `Cache-Control: no-store`.
Rollback selects the immutable previous policy version; attack tests prove both
stale-version rejection and explicit rollback evaluation.

The route rejects bodies above 16 KiB using their UTF-8 byte count, rejects
malformed JSON without entering authorization evaluation, and returns stable
recovery guidance alongside machine-readable reasons.

## Accessibility

This slice is API-only and renders no user interface. JSON errors include both a
plain-language explanation and a stable machine-readable reason; invalid input
also includes field-level issues and every rejection includes plain-language
recovery guidance so an accessible client can associate errors with its own
controls without parsing prose.

## Proof command

```sh
node --test lib/enterprise/authorization.attack.test.mjs
```

The proof attacks cross-tenant scope, stale and unregistered versions, admin
escalation, owner self-demotion, replay/key reuse, unknown privilege fields,
malformed JSON and role input, overlong identifiers, multibyte resource
exhaustion, and target/action confusion.
