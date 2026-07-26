-- Co-VideoPro — Migration: adaptive discovery sessions + answers

BEGIN;

CREATE TABLE IF NOT EXISTS co_production.discovery_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES co_production.inquiries(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','complete','abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.discovery_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES co_production.discovery_sessions(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  question_id text NOT NULL,
  raw_text text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('answered','unknown','conflicted')),
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  stakeholder text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_sessions_inquiry ON co_production.discovery_sessions(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_discovery_answers_session ON co_production.discovery_answers(session_id);

ALTER TABLE co_production.discovery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.discovery_sessions FORCE ROW LEVEL SECURITY;
GRANT ALL ON co_production.discovery_sessions TO service_role;
GRANT SELECT ON co_production.discovery_sessions TO authenticated;
CREATE POLICY discovery_sessions_select_owner ON co_production.discovery_sessions FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM co_production.inquiries i WHERE i.id = discovery_sessions.inquiry_id AND i.owner_id = auth.uid()
));

ALTER TABLE co_production.discovery_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.discovery_answers FORCE ROW LEVEL SECURITY;
GRANT ALL ON co_production.discovery_answers TO service_role;
GRANT SELECT ON co_production.discovery_answers TO authenticated;
CREATE POLICY discovery_answers_select_owner ON co_production.discovery_answers FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM co_production.discovery_sessions s
  JOIN co_production.inquiries i ON i.id = s.inquiry_id
  WHERE s.id = discovery_answers.session_id AND i.owner_id = auth.uid()
));

COMMIT;
