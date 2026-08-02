# Co-Deliver Audit Ledger

Date: 2026-06-27
Status: L0 audit map.

## Current Audit Tables

- `activity_log`
- `approval_history`
- `share_analytics`
- `webhook_deliveries`
- `notifications`

## Current Audit Events Found

- project/assets actions in route handlers
- comments added through public review links
- version upload and approval reset
- approval decisions
- approval notification sent
- downloaded asset
- webhook created
- webhook delivery attempts

## Gaps

- No single append-only audit ledger authority exists.
- Some actions log without `project_id`.
- Email send failures do not consistently produce durable failure events.
- Webhook deliveries lack retry/idempotency lineage.
- Final delivery events are not distinct from generic downloads.
- Audit chain integrity is not implemented.

## Classification

Audit is PARTIAL PROOF for scattered activity logging and NO PROOF for chain-integrity or proof-pack-grade delivery ledger.

