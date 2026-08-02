# RESCUE BRANCH — READ THIS BEFORE TOUCHING ANYTHING HERE

This branch is a **custody snapshot of an abandoned working tree**, taken 2026-08-02
from the `cco-codeliver` checkout on M2. It is not a feature branch and not a merge
candidate.

## What this is

- 301 uncommitted working-tree entries (1,021 files) that existed only on one laptop
  disk, committed unchanged so the content cannot be lost to `git clean` or drive
  failure.
- Includes 35 untracked `supabase/migrations/*.sql` files (dated 2026-07-15/16) that
  exist nowhere else in git history.

## What this is NOT

- **Not applied anywhere.** Nothing here has been run against any database.
- **Not safe to merge or cherry-pick.** CTO classification (2026-08-02,
  `RESEARCH/CCO_RESCUE_MIGRATION_CLASSIFICATION.md`) found hard DDL conflicts with
  canonical, including: incompatible same-name `co_production.notification_outbox`
  schemas, a `create_asset_version(...)` path that bypasses C5A receipt authority,
  and `claim_share_link_view(...)` competing with C6B admission/view accounting.
  These migrations are a **competing implementation of the authority model** that
  C5A/C6B settled, written before that design settled.

## Rules

1. Nothing on this branch is applied to any database or merged into any canonical
   branch **without explicit CTO sign-off**.
2. Disposition default (CEO ruling 2026-08-02): **archived reference unless CTO's
   classification finds a specific capability C5A/C6B lacks.** Anything that survives
   gets rewritten against the C5A/C6B contracts — never cherry-picked as a file.
3. If you found this branch looking for "lost work": the work is preserved; the
   design is superseded. Read the classification doc before assuming otherwise.
