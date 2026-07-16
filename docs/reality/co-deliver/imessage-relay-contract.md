# Co-Deliver M2 iMessage Relay Contract

Date: 2026-07-14
Status: Contract implemented; relay absent; default off; no live-send validation performed.

## Current checkpoint

- Co-Deliver continues to use `lib/notifications/authority.ts` and
  `lib/notifications/server-delivery.ts` for consent, preferences, suppression,
  request idempotency, rate authority, and durable audit receipts.
- `lib/notifications/imessage-relay.ts` defines a server-only adapter contract.
  It contains no AppleScript, Messages database access, keychain probing,
  provider SDK, credential discovery, or built-in network transport.
- Existing no-argument calls to `getExternalNotificationAdapters()` inject no
  relay transport. The iMessage adapter therefore reports `configured=false`
  even if environment values happen to exist.
- Tests use an in-memory fake transport only. No M2 connection, Messages access,
  external request, or live send was made.

## Activation prerequisites

The adapter becomes configured only when all of the following are true in a
server runtime:

1. An operator deliberately injects an `IMessageRelayTransport` into
   `getExternalNotificationAdapters({ imessageRelayTransport })` at an approved
   server composition point.
2. `CODELIVER_IMESSAGE_RELAY_ENABLED` is exactly `true`.
3. `CODELIVER_IMESSAGE_RELAY_URL` is a credential-free HTTPS URL with no query
   or fragment.
4. `CODELIVER_IMESSAGE_RELAY_ALLOWED_ORIGINS` contains the endpoint's exact
   HTTPS origin. Entries are comma-separated and do not support wildcards.
5. `CODELIVER_IMESSAGE_RELAY_ALLOWED_HOSTS` contains the endpoint's exact
   lowercase hostname. Entries are comma-separated and do not support
   wildcards.
6. `CODELIVER_IMESSAGE_RELAY_ID` identifies the reviewed M2 relay instance.
7. `CODELIVER_IMESSAGE_RELAY_REQUEST_KEY_ID` and
   `CODELIVER_IMESSAGE_RELAY_RECEIPT_KEY_ID` are distinct and identify the two
   active keys.
8. `CODELIVER_IMESSAGE_RELAY_REQUEST_SECRET` and
   `CODELIVER_IMESSAGE_RELAY_RECEIPT_SECRET` are distinct, high-entropy secrets
   of at least 32 bytes, stored only in approved server and M2 secret stores.
9. `CODELIVER_IMESSAGE_RELAY_TIMEOUT_MS` is an integer from 25 through 10000.
10. `CODELIVER_IMESSAGE_RELAY_MAX_RECEIPT_AGE_MS` is an integer from 1000
    through 300000.
11. The canonical `fingerprintNotificationRequest` authority function is
    injected. Missing or malformed fingerprint authority keeps the adapter off
    or fails the request before transport.

No secret or relay transport may be imported by a Client Component, returned
from an API response, embedded in `NEXT_PUBLIC_*`, or logged.

## Request contract

The injected transport receives one HTTPS `POST`, `redirect: "error"`, an abort
signal, the exact endpoint, and a JSON body. It must honor the abort signal and
must return the final response URL, raw body, status, and raw headers without
following redirects.

Required request headers:

- `content-type: application/json`
- `x-codeliver-relay-protocol: codeliver.imessage.send.v1`
- `x-codeliver-relay-key-id: <request key id>`
- `x-codeliver-relay-request-id: <deterministic request id>`
- `x-codeliver-relay-signature: sha256=<HMAC-SHA256 of exact raw body>`

The signed body binds the relay ID, deterministic request ID, random nonce,
existing notification idempotency key, canonical request fingerprint, issue and
expiry times, normalized recipient, recorded consent evidence, and message.
The recipient is either a lowercase email address or E.164 phone number.

Before calling transport, the adapter independently requires:

- `action=send`, `confirmedLiveSend=true`, and the `imessage` channel;
- an address matching the normalized authorized recipient;
- explicit `granted=true` iMessage consent with a source and valid recorded time;
- the passed idempotency key to exactly match the authority-bound request key;
- a 64-character canonical request fingerprint.

Preview, dry-run, invalid consent, invalid recipient, and idempotency mismatch
paths return a fixed audit-safe failure code without calling transport.

## Receipt contract

The M2 relay must return a JSON receipt signed over its exact raw body with the
separate receipt key. Required response headers are:

- `content-type: application/json`
- `x-codeliver-relay-receipt-key-id: <receipt key id>`
- `x-codeliver-relay-receipt-signature: sha256=<HMAC-SHA256 of exact raw body>`

The receipt protocol is `codeliver.imessage.receipt.v1`. It must echo the relay
ID, request ID, nonce, SHA-256 of the raw request body, idempotency key, and
normalized recipient. It also carries an opaque receipt ID, status, opaque
provider message ID, occurrence time, and optional rejection code.

Co-Deliver claims `sent` only for a valid, fresh, matching, signed receipt with
status `accepted`, HTTP 200/202, an opaque provider message ID, and no error
code. Wrong endpoint, duplicate headers, bad signature, stale receipt, old
nonce, wrong request binding, wrong recipient, oversized/malformed body, or
inconsistent status fails closed.

Retry classification is local and bounded:

- A timeout or unknown transport error is delivery-indeterminate and is not
  retryable automatically.
- A transport may mark a failure retryable only when it can prove no request
  bytes were sent.
- A signed rejection is retryable only for `relay_busy`,
  `relay_rate_limited`, or `relay_unavailable`.
- Policy, consent, recipient, idempotency, signature, replay, and receipt
  validation failures are final.
- Returned errors are fixed codes. Raw exceptions, URLs, recipients, message
  content, headers, and secrets are never included.

## Future M2 operator steps

These steps are intentionally not performed by this checkpoint:

1. Create a separately reviewed M2 relay service owned by the operator. Bind it
   to the intended Messages account without reading `chat.db`, scraping the
   keychain, or exposing account credentials to Co-Deliver.
2. Put the relay behind a stable HTTPS endpoint with a valid certificate. Limit
   inbound network access to the Co-Deliver server path and disable redirects.
   Record the exact origin, hostname, relay ID, and endpoint path.
3. Implement strict parsing of `codeliver.imessage.send.v1`: verify request key
   ID and HMAC before JSON processing; reject expired requests and invalid
   nonces; normalize the recipient; require consent evidence; and reject any
   unsupported field or message size.
4. Add a durable M2 idempotency ledger before enabling Messages delivery. Bind
   each idempotency key to relay ID, request ID, request fingerprint, recipient,
   and message hash. The same binding may return a newly signed deduplicated
   receipt; a changed binding must reject without sending.
5. Keep the actual Messages integration behind a second operator approval and a
   reviewed local adapter. It must perform at most one send only after the
   durable idempotency claim commits. Do not add Messages automation or account
   access code to this Co-Deliver repository.
6. Generate separate request-signing and receipt-signing secrets in approved
   secret stores. Transfer each only to the side that needs it, assign versioned
   key IDs, test rotation with overlap, and never place values in the repo,
   browser environment, shell history, screenshots, or documentation.
7. Make the M2 service sign `codeliver.imessage.receipt.v1` only after a
   definitive outcome. `accepted` requires one opaque provider message ID.
   Rejections must assert that no send occurred and use the documented bounded
   codes. Do not convert an uncertain outcome into `accepted` or retryable.
8. Implement a minimal server-only HTTPS transport in Co-Deliver. It must honor
   the supplied endpoint, headers, body, redirect policy, abort signal, and
   timeout; return the untouched final URL/body/headers; and classify
   `not_sent` only when the HTTP stack proves zero request bytes left the host.
9. Inject that reviewed transport at each approved server adapter composition
   point. Do not add it to UI, settings, sharing clients, proxy code, or browser
   bundles.
10. With `CODELIVER_IMESSAGE_RELAY_ENABLED` still absent or `false`, deploy the
    service and verify that previews show no configured iMessage provider and
    that the fake-transport contract suite remains green.
11. In a non-production operator window, configure the exact URL, allowlists,
    IDs, distinct secrets, timeout, and receipt-age values. Keep enablement
    false and verify TLS, firewall rules, key IDs, clock synchronization,
    request rejection, replay rejection, and redacted logs without sending.
12. Obtain explicit approval for one consented operator-controlled recipient.
    Set `CODELIVER_IMESSAGE_RELAY_ENABLED=true` only for that controlled live
    validation, confirm one authority audit plus one matching signed receipt,
    and verify duplicate submission does not create a second message.
13. Review the audit evidence and rollback behavior before approving broader
    use. Production activation requires a separate explicit operator decision;
    this document is not that approval.

## Immediate disable and recovery

1. Set `CODELIVER_IMESSAGE_RELAY_ENABLED=false` or remove the injected
   transport. Either action makes the adapter unconfigured.
2. Preserve Co-Deliver authority and receipt audit records plus the M2
   idempotency ledger. Do not retry delivery-indeterminate requests under a new
   key.
3. If a key or endpoint may be compromised, block the endpoint, rotate both key
   pairs and IDs, and reject the retired IDs before re-enabling.
4. Keep audit output redacted and reconcile only with opaque request, receipt,
   and provider message IDs.
