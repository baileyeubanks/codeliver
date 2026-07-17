-- Co-VideoPro — Migration: payment milestones + notification outbox
-- Follows 20260716120000_project_operating_record.sql conventions.

BEGIN;

CREATE TABLE IF NOT EXISTS co_production.payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES co_production.proposals(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('deposit','balance')),
  label text NOT NULL DEFAULT '',
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','checkout_created','paid','void')),
  method text CHECK (method IN ('checkout','manual')),
  checkout_url text,
  checkout_provider text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  intent text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','imessage')),
  recipient text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','dry_run_sent','pending_provider','sent','failed')),
  provider text,
  idempotency_key text NOT NULL,
  attempt_count int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_milestones_proposal ON co_production.payment_milestones(proposal_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_project ON co_production.payment_milestones(project_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_project ON co_production.notification_outbox(project_id, status);

ALTER TABLE co_production.payment_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_milestones_select_owner ON co_production.payment_milestones FOR SELECT USING (EXISTS (
  SELECT 1 FROM co_production.projects p
  WHERE p.id = payment_milestones.project_id AND p.owner_id = auth.uid()
));

ALTER TABLE co_production.notification_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_outbox_select_owner ON co_production.notification_outbox FOR SELECT USING (EXISTS (
  SELECT 1 FROM co_production.projects p
  WHERE p.id = notification_outbox.project_id AND p.owner_id = auth.uid()
));

COMMIT;
