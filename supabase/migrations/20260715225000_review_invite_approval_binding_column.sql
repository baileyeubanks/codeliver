-- The atomic share manifest introduced later in this sequence persists the
-- exact approval step that an approval link is authorized to decide.

BEGIN;

LOCK TABLE public.review_invites IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE co_production.review_invites IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.review_invites
  ADD COLUMN IF NOT EXISTS approval_id uuid;

ALTER TABLE co_production.review_invites
  ADD COLUMN IF NOT EXISTS approval_id uuid;

CREATE INDEX IF NOT EXISTS review_invites_approval_id_idx
  ON public.review_invites(approval_id)
  WHERE approval_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS co_production_review_invites_approval_id_idx
  ON co_production.review_invites(approval_id)
  WHERE approval_id IS NOT NULL;

COMMIT;
