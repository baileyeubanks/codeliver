-- Co-Production authority: isolated, tenant-aware, and fail-closed.
--
-- This migration is intentionally additive. It does not read, alter, copy, or
-- drop any generic public tables because this Supabase project is shared with
-- other products whose table names already collide with Co-Production names.
-- Apply only after staging has exposed the co_production schema through the
-- Data API and the application is configured to target that schema.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS co_production;
CREATE SCHEMA IF NOT EXISTS co_production_private;

REVOKE ALL ON SCHEMA co_production FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA co_production_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA co_production TO authenticated, service_role;
GRANT USAGE ON SCHEMA co_production_private TO authenticated, service_role;

CREATE TABLE co_production.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (
    role IN ('owner', 'admin', 'producer', 'editor', 'member', 'reviewer', 'viewer')
  ),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE TABLE co_production.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(btrim(email)) BETWEEN 3 AND 320),
  role text NOT NULL DEFAULT 'member' CHECK (
    role IN ('admin', 'producer', 'editor', 'member', 'reviewer', 'viewer')
  ),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_ciphertext text NOT NULL CHECK (token_ciphertext LIKE 'v1.%'),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'declined', 'revoked')
  ),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'archived', 'completed')
  ),
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'reviewer' CHECK (
    role IN ('admin', 'producer', 'editor', 'reviewer', 'viewer')
  ),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE OR REPLACE FUNCTION co_production_private.role_rank(role_name text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE role_name
    WHEN 'owner' THEN 100
    WHEN 'admin' THEN 80
    WHEN 'producer' THEN 70
    WHEN 'editor' THEN 60
    WHEN 'member' THEN 50
    WHEN 'reviewer' THEN 30
    WHEN 'viewer' THEN 10
    ELSE 0
  END
$$;

CREATE OR REPLACE FUNCTION co_production_private.has_team_role(
  target_team_id uuid,
  required_rank integer DEFAULT 10
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM co_production.teams AS team
    WHERE team.id = target_team_id
      AND (
        team.owner_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM co_production.team_members AS member
          WHERE member.team_id = team.id
            AND member.user_id = (SELECT auth.uid())
            AND co_production_private.role_rank(member.role) >= required_rank
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.has_project_role(
  target_project_id uuid,
  required_rank integer DEFAULT 10
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM co_production.projects AS project
    WHERE project.id = target_project_id
      AND (
        project.owner_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM co_production.project_members AS member
          WHERE member.project_id = project.id
            AND member.user_id = (SELECT auth.uid())
            AND (member.expires_at IS NULL OR member.expires_at > now())
            AND co_production_private.role_rank(member.role) >= required_rank
        )
        OR (
          project.team_id IS NOT NULL
          AND co_production_private.has_team_role(project.team_id, required_rank)
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION co_production_private.role_rank(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION co_production_private.has_team_role(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION co_production_private.has_project_role(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production_private.role_rank(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production_private.has_team_role(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production_private.has_project_role(uuid, integer) TO authenticated, service_role;

CREATE TABLE co_production.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES co_production.folders(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES co_production.folders(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
  file_type text NOT NULL DEFAULT 'video' CHECK (
    file_type IN ('video', 'image', 'audio', 'document', 'other')
  ),
  file_url text,
  thumbnail_url text,
  proxy_url text,
  nas_path text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  duration_seconds double precision CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  ),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft', 'in_review', 'approved', 'needs_changes', 'final',
      'processing', 'ready', 'failed'
    )
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, project_id)
);

CREATE TABLE co_production.versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number > 0),
  file_url text NOT NULL,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  notes text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_current boolean NOT NULL DEFAULT false,
  thumbnail_url text,
  duration_seconds double precision CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  ),
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, version_number),
  UNIQUE (id, asset_id)
);

CREATE OR REPLACE FUNCTION co_production_private.has_asset_role(
  target_asset_id uuid,
  required_rank integer DEFAULT 10
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM co_production.assets AS asset
    WHERE asset.id = target_asset_id
      AND co_production_private.has_project_role(asset.project_id, required_rank)
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.has_version_role(
  target_version_id uuid,
  required_rank integer DEFAULT 10
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM co_production.versions AS version
    WHERE version.id = target_version_id
      AND co_production_private.has_asset_role(version.asset_id, required_rank)
  )
$$;

REVOKE ALL ON FUNCTION co_production_private.has_asset_role(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION co_production_private.has_version_role(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production_private.has_asset_role(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production_private.has_version_role(uuid, integer) TO authenticated, service_role;

CREATE TABLE co_production.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  version_id uuid,
  title text NOT NULL DEFAULT 'Review',
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'completed', 'cancelled')
  ),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (version_id, asset_id)
    REFERENCES co_production.versions(id, asset_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.review_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_ciphertext text NOT NULL CHECK (token_ciphertext LIKE 'v1.%'),
  password_hash text,
  reviewer_name text,
  reviewer_email text,
  permissions text NOT NULL DEFAULT 'comment' CHECK (
    permissions IN ('view', 'comment', 'approve')
  ),
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  watermark_enabled boolean NOT NULL DEFAULT false,
  watermark_text text,
  download_enabled boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  last_viewed_at timestamptz,
  max_views integer CHECK (max_views IS NULL OR max_views > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (version_id, asset_id)
    REFERENCES co_production.versions(id, asset_id)
    ON DELETE CASCADE
);

CREATE TABLE co_production.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid REFERENCES co_production.reviews(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  review_invite_id uuid REFERENCES co_production.review_invites(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES co_production.comments(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT 'Anonymous',
  author_email text,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  rich_body text,
  mentions text[] NOT NULL DEFAULT '{}',
  timecode_seconds double precision CHECK (
    timecode_seconds IS NULL OR timecode_seconds >= 0
  ),
  frame_number integer CHECK (frame_number IS NULL OR frame_number >= 0),
  pin_x double precision CONSTRAINT comments_pin_x_check
    CHECK (pin_x IS NULL OR (pin_x >= 0 AND pin_x <= 100)),
  pin_y double precision CONSTRAINT comments_pin_y_check
    CHECK (pin_y IS NULL OR (pin_y >= 0 AND pin_y <= 100)),
  CONSTRAINT comments_pin_pair_check
    CHECK ((pin_x IS NULL) = (pin_y IS NULL)),
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'resolved', 'archived')
  ),
  visibility text NOT NULL DEFAULT 'internal' CHECK (
    visibility IN ('internal', 'external')
  ),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (version_id, asset_id)
    REFERENCES co_production.versions(id, asset_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid REFERENCES co_production.comments(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  type text NOT NULL CHECK (
    type IN ('pin', 'rectangle', 'freehand', 'arrow', 'text', 'highlight')
  ),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  frame_number integer CHECK (frame_number IS NULL OR frame_number >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (version_id, asset_id)
    REFERENCES co_production.versions(id, asset_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES co_production.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (length(emoji) BETWEEN 1 AND 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id, emoji)
);

CREATE TABLE co_production.comment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES co_production.comments(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 500),
  file_type text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  storage_bucket text NOT NULL DEFAULT 'co-production-comment-attachments',
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);

CREATE TABLE co_production.approval_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'sequential' CHECK (
    mode IN ('sequential', 'parallel')
  ),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'completed', 'cancelled')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES co_production.approval_workflows(id) ON DELETE CASCADE,
  step_order integer NOT NULL DEFAULT 1 CHECK (step_order > 0),
  role_label text NOT NULL,
  assignee_email text,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending', 'approved', 'approved_with_changes', 'rejected', 'changes_requested'
    )
  ),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES co_production.approvals(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE VIEW co_production.approval_steps
WITH (security_invoker = true)
AS
SELECT
  id,
  asset_id,
  workflow_id,
  step_order,
  role_label,
  assignee_email,
  assignee_id,
  status,
  decision_note,
  decided_at,
  created_at,
  updated_at
FROM co_production.approvals;

CREATE TABLE co_production.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES co_production.projects(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES co_production.assets(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  action text NOT NULL CHECK (length(btrim(action)) BETWEEN 1 AND 160),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (project_id IS NOT NULL OR asset_id IS NOT NULL OR actor_id IS NOT NULL)
);

CREATE TABLE co_production.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  color text NOT NULL DEFAULT '#3b82f6' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE TABLE co_production.asset_tags (
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES co_production.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, tag_id)
);

CREATE TABLE co_production.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (length(btrim(type)) BETWEEN 1 AND 120),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.notification_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  email_enabled boolean NOT NULL DEFAULT true,
  email_frequency text NOT NULL DEFAULT 'instant' CHECK (
    email_frequency IN ('instant', 'hourly', 'daily', 'weekly', 'off')
  ),
  in_app_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  sms_phone_e164 text CHECK (
    sms_phone_e164 IS NULL OR sms_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  ),
  imessage_dry_run_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_type)
);

CREATE TABLE co_production.transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  language text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  provider text,
  provider_receipt_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (version_id, asset_id)
    REFERENCES co_production.versions(id, asset_id)
    ON DELETE CASCADE
);

CREATE TABLE co_production.brand_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  version_id uuid,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (version_id, asset_id)
    REFERENCES co_production.versions(id, asset_id)
    ON DELETE CASCADE
);

CREATE TABLE co_production.comparison_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_a_id uuid NOT NULL REFERENCES co_production.versions(id) ON DELETE CASCADE,
  version_b_id uuid NOT NULL REFERENCES co_production.versions(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (version_a_id <> version_b_id)
);

CREATE TABLE co_production.project_analytics_cache (
  project_id uuid PRIMARY KEY REFERENCES co_production.projects(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.edit_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  review_invite_id uuid REFERENCES co_production.review_invites(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT 'Unknown reviewer',
  decision_type text NOT NULL CHECK (
    decision_type IN (
      'cut', 'trim', 'mute', 'lift', 'ripple_delete',
      'remove_silence', 'remove_filler', 'replace'
    )
  ),
  source text NOT NULL DEFAULT 'manual' CHECK (
    source IN (
      'keyboard', 'manual', 'transcript_ai', 'silence_scan',
      'filler_scan', 'import'
    )
  ),
  status text NOT NULL DEFAULT 'proposed' CHECK (
    status IN ('proposed', 'accepted', 'rejected', 'applied')
  ),
  start_seconds double precision NOT NULL CHECK (
    start_seconds >= 0 AND start_seconds <= 604800
  ),
  end_seconds double precision CHECK (
    end_seconds IS NULL OR (
      end_seconds >= start_seconds AND end_seconds <= 604800
    )
  ),
  label text,
  confidence double precision CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  ),
  client_request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, client_request_id),
  FOREIGN KEY (version_id, asset_id)
    REFERENCES co_production.versions(id, asset_id)
    ON DELETE CASCADE
);

CREATE TABLE co_production.share_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES co_production.review_invites(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  viewer_ip_hash text,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (invite_id, client_request_id)
);

CREATE TABLE co_production.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url ~ '^https://'),
  events text[] NOT NULL DEFAULT '{}',
  secret_ciphertext text NOT NULL CHECK (secret_ciphertext LIKE 'v1.%'),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES co_production.webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_code integer,
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  error_code text,
  delivered_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.transcode_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  version_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')
  ),
  input_path text NOT NULL,
  output_hls_path text,
  output_thumbnail_path text,
  output_waveform_path text,
  duration_seconds double precision CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  ),
  resolution text,
  codec text,
  fps double precision CHECK (fps IS NULL OR fps > 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (version_id, asset_id)
    REFERENCES co_production.versions(id, asset_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES co_production.projects(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operation text NOT NULL,
  meter text NOT NULL,
  native_quantity numeric(24, 6) NOT NULL CHECK (native_quantity >= 0),
  co_units bigint NOT NULL CHECK (co_units >= 0),
  status text NOT NULL CHECK (
    status IN ('reserved', 'committed', 'released', 'reversed')
  ),
  idempotency_key text NOT NULL,
  provider_receipt_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, idempotency_key)
);

CREATE OR REPLACE FUNCTION co_production_private.has_comment_role(
  target_comment_id uuid,
  required_rank integer DEFAULT 10
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM co_production.comments AS comment
    WHERE comment.id = target_comment_id
      AND co_production_private.has_asset_role(comment.asset_id, required_rank)
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.has_approval_role(
  target_approval_id uuid,
  required_rank integer DEFAULT 10
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM co_production.approvals AS approval
    WHERE approval.id = target_approval_id
      AND co_production_private.has_asset_role(approval.asset_id, required_rank)
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.has_invite_role(
  target_invite_id uuid,
  required_rank integer DEFAULT 10
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM co_production.review_invites AS invite
    WHERE invite.id = target_invite_id
      AND co_production_private.has_asset_role(invite.asset_id, required_rank)
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.can_manage_asset_tag(
  target_asset_id uuid,
  target_tag_id uuid,
  required_rank integer DEFAULT 60
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM co_production.assets AS asset
    JOIN co_production.tags AS tag ON tag.project_id = asset.project_id
    WHERE asset.id = target_asset_id
      AND tag.id = target_tag_id
      AND co_production_private.has_project_role(asset.project_id, required_rank)
  )
$$;

REVOKE ALL ON FUNCTION co_production_private.has_comment_role(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION co_production_private.has_approval_role(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION co_production_private.has_invite_role(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION co_production_private.can_manage_asset_tag(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production_private.has_comment_role(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production_private.has_approval_role(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production_private.has_invite_role(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production_private.can_manage_asset_tag(uuid, uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION co_production_private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.ensure_single_current_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE co_production.versions
    SET is_current = false
    WHERE asset_id = NEW.asset_id
      AND id <> NEW.id
      AND is_current;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.seed_team_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO co_production.team_members (team_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.owner_id, 'owner', NEW.owner_id)
  ON CONFLICT (team_id, user_id) DO UPDATE SET role = 'owner';
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION co_production_private.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION co_production_private.ensure_single_current_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION co_production_private.seed_team_owner_membership() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER teams_set_updated_at
  BEFORE UPDATE ON co_production.teams
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER team_invites_set_updated_at
  BEFORE UPDATE ON co_production.team_invites
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON co_production.projects
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER project_members_set_updated_at
  BEFORE UPDATE ON co_production.project_members
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER folders_set_updated_at
  BEFORE UPDATE ON co_production.folders
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER assets_set_updated_at
  BEFORE UPDATE ON co_production.assets
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER versions_set_updated_at
  BEFORE UPDATE ON co_production.versions
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER reviews_set_updated_at
  BEFORE UPDATE ON co_production.reviews
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER review_invites_set_updated_at
  BEFORE UPDATE ON co_production.review_invites
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER comments_set_updated_at
  BEFORE UPDATE ON co_production.comments
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER approval_workflows_set_updated_at
  BEFORE UPDATE ON co_production.approval_workflows
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER approvals_set_updated_at
  BEFORE UPDATE ON co_production.approvals
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON co_production.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER transcriptions_set_updated_at
  BEFORE UPDATE ON co_production.transcriptions
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER edit_decisions_set_updated_at
  BEFORE UPDATE ON co_production.edit_decisions
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER webhooks_set_updated_at
  BEFORE UPDATE ON co_production.webhooks
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER transcode_jobs_set_updated_at
  BEFORE UPDATE ON co_production.transcode_jobs
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER versions_single_current
  BEFORE INSERT OR UPDATE OF is_current ON co_production.versions
  FOR EACH ROW
  WHEN (NEW.is_current)
  EXECUTE FUNCTION co_production_private.ensure_single_current_version();
CREATE TRIGGER teams_seed_owner_membership
  AFTER INSERT ON co_production.teams
  FOR EACH ROW EXECUTE FUNCTION co_production_private.seed_team_owner_membership();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'teams', 'team_members', 'team_invites', 'projects', 'project_members',
    'folders', 'assets', 'versions', 'reviews', 'review_invites', 'comments',
    'annotations', 'comment_reactions', 'comment_attachments',
    'approval_workflows', 'approvals', 'approval_history', 'activity_log',
    'tags', 'asset_tags', 'notifications', 'notification_preferences',
    'transcriptions', 'brand_checks', 'comparison_sessions',
    'project_analytics_cache', 'edit_decisions', 'share_analytics', 'webhooks',
    'webhook_deliveries', 'transcode_jobs', 'usage_events'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE co_production.%I ENABLE ROW LEVEL SECURITY',
      table_name
    );
    EXECUTE format(
      'ALTER TABLE co_production.%I FORCE ROW LEVEL SECURITY',
      table_name
    );
  END LOOP;
END
$$;

CREATE POLICY teams_select ON co_production.teams
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(id, 10));
CREATE POLICY teams_insert ON co_production.teams
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY teams_update ON co_production.teams
  FOR UPDATE TO authenticated
  USING (co_production_private.has_team_role(id, 80))
  WITH CHECK (co_production_private.has_team_role(id, 80));
CREATE POLICY teams_delete ON co_production.teams
  FOR DELETE TO authenticated
  USING (co_production_private.has_team_role(id, 100));

CREATE POLICY team_members_select ON co_production.team_members
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));
CREATE POLICY team_members_insert ON co_production.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    co_production_private.has_team_role(team_id, 80)
    AND (
      role NOT IN ('owner', 'admin')
      OR co_production_private.has_team_role(team_id, 100)
    )
  );
CREATE POLICY team_members_update ON co_production.team_members
  FOR UPDATE TO authenticated
  USING (co_production_private.has_team_role(team_id, 80))
  WITH CHECK (
    co_production_private.has_team_role(team_id, 80)
    AND (
      role NOT IN ('owner', 'admin')
      OR co_production_private.has_team_role(team_id, 100)
    )
  );
CREATE POLICY team_members_delete ON co_production.team_members
  FOR DELETE TO authenticated
  USING (
    co_production_private.has_team_role(team_id, 80)
    AND role <> 'owner'
  );

CREATE POLICY team_invites_select ON co_production.team_invites
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 80));
CREATE POLICY team_invites_insert ON co_production.team_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    co_production_private.has_team_role(team_id, 80)
    AND (
      role <> 'admin'
      OR co_production_private.has_team_role(team_id, 100)
    )
  );
CREATE POLICY team_invites_update ON co_production.team_invites
  FOR UPDATE TO authenticated
  USING (co_production_private.has_team_role(team_id, 80))
  WITH CHECK (co_production_private.has_team_role(team_id, 80));
CREATE POLICY team_invites_delete ON co_production.team_invites
  FOR DELETE TO authenticated
  USING (co_production_private.has_team_role(team_id, 80));

CREATE POLICY projects_select ON co_production.projects
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(id, 10));
CREATE POLICY projects_insert ON co_production.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (
      team_id IS NULL
      OR co_production_private.has_team_role(team_id, 80)
    )
  );
CREATE POLICY projects_update ON co_production.projects
  FOR UPDATE TO authenticated
  USING (co_production_private.has_project_role(id, 60))
  WITH CHECK (co_production_private.has_project_role(id, 60));
CREATE POLICY projects_delete ON co_production.projects
  FOR DELETE TO authenticated
  USING (co_production_private.has_project_role(id, 80));

CREATE POLICY project_members_select ON co_production.project_members
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 10));
CREATE POLICY project_members_insert ON co_production.project_members
  FOR INSERT TO authenticated
  WITH CHECK (co_production_private.has_project_role(project_id, 80));
CREATE POLICY project_members_update ON co_production.project_members
  FOR UPDATE TO authenticated
  USING (co_production_private.has_project_role(project_id, 80))
  WITH CHECK (co_production_private.has_project_role(project_id, 80));
CREATE POLICY project_members_delete ON co_production.project_members
  FOR DELETE TO authenticated
  USING (co_production_private.has_project_role(project_id, 80));

CREATE POLICY folders_select ON co_production.folders
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 10));
CREATE POLICY folders_insert ON co_production.folders
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND co_production_private.has_project_role(project_id, 60)
  );
CREATE POLICY folders_update ON co_production.folders
  FOR UPDATE TO authenticated
  USING (co_production_private.has_project_role(project_id, 60))
  WITH CHECK (co_production_private.has_project_role(project_id, 60));
CREATE POLICY folders_delete ON co_production.folders
  FOR DELETE TO authenticated
  USING (co_production_private.has_project_role(project_id, 60));

CREATE POLICY assets_select ON co_production.assets
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 10));
CREATE POLICY assets_insert ON co_production.assets
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND co_production_private.has_project_role(project_id, 60)
  );
CREATE POLICY assets_update ON co_production.assets
  FOR UPDATE TO authenticated
  USING (co_production_private.has_project_role(project_id, 60))
  WITH CHECK (co_production_private.has_project_role(project_id, 60));
CREATE POLICY assets_delete ON co_production.assets
  FOR DELETE TO authenticated
  USING (co_production_private.has_project_role(project_id, 60));

CREATE POLICY versions_select ON co_production.versions
  FOR SELECT TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 10));
CREATE POLICY versions_insert ON co_production.versions
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND co_production_private.has_asset_role(asset_id, 60)
  );
CREATE POLICY versions_update ON co_production.versions
  FOR UPDATE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 60))
  WITH CHECK (co_production_private.has_asset_role(asset_id, 60));
CREATE POLICY versions_delete ON co_production.versions
  FOR DELETE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 80));

CREATE POLICY reviews_select ON co_production.reviews
  FOR SELECT TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 10));
CREATE POLICY reviews_insert ON co_production.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND co_production_private.has_asset_role(asset_id, 60)
  );
CREATE POLICY reviews_update ON co_production.reviews
  FOR UPDATE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 60))
  WITH CHECK (co_production_private.has_asset_role(asset_id, 60));
CREATE POLICY reviews_delete ON co_production.reviews
  FOR DELETE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 80));

CREATE POLICY review_invites_select ON co_production.review_invites
  FOR SELECT TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 10));
CREATE POLICY review_invites_insert ON co_production.review_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND co_production_private.has_asset_role(asset_id, 70)
  );
CREATE POLICY review_invites_update ON co_production.review_invites
  FOR UPDATE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 70))
  WITH CHECK (co_production_private.has_asset_role(asset_id, 70));
CREATE POLICY review_invites_delete ON co_production.review_invites
  FOR DELETE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 70));

CREATE POLICY comments_select ON co_production.comments
  FOR SELECT TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 10));
CREATE POLICY comments_insert ON co_production.comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND review_invite_id IS NULL
    AND co_production_private.has_asset_role(asset_id, 30)
  );
CREATE POLICY comments_update ON co_production.comments
  FOR UPDATE TO authenticated
  USING (
    author_id = (SELECT auth.uid())
    OR co_production_private.has_asset_role(asset_id, 60)
  )
  WITH CHECK (
    co_production_private.has_asset_role(asset_id, 30)
    AND (
      author_id = (SELECT auth.uid())
      OR co_production_private.has_asset_role(asset_id, 60)
    )
  );
CREATE POLICY comments_delete ON co_production.comments
  FOR DELETE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 60));

CREATE POLICY annotations_select ON co_production.annotations
  FOR SELECT TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 10));
CREATE POLICY annotations_insert ON co_production.annotations
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND co_production_private.has_asset_role(asset_id, 30)
  );
CREATE POLICY annotations_update ON co_production.annotations
  FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR co_production_private.has_asset_role(asset_id, 60)
  )
  WITH CHECK (
    co_production_private.has_asset_role(asset_id, 30)
    AND (
      created_by = (SELECT auth.uid())
      OR co_production_private.has_asset_role(asset_id, 60)
    )
  );
CREATE POLICY annotations_delete ON co_production.annotations
  FOR DELETE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR co_production_private.has_asset_role(asset_id, 60)
  );

CREATE POLICY comment_reactions_select ON co_production.comment_reactions
  FOR SELECT TO authenticated
  USING (co_production_private.has_comment_role(comment_id, 10));
CREATE POLICY comment_reactions_insert ON co_production.comment_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND co_production_private.has_comment_role(comment_id, 10)
  );
CREATE POLICY comment_reactions_delete ON co_production.comment_reactions
  FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND co_production_private.has_comment_role(comment_id, 10)
  );

CREATE POLICY comment_attachments_select ON co_production.comment_attachments
  FOR SELECT TO authenticated
  USING (co_production_private.has_comment_role(comment_id, 10));
CREATE POLICY comment_attachments_insert ON co_production.comment_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND co_production_private.has_comment_role(comment_id, 30)
  );
CREATE POLICY comment_attachments_delete ON co_production.comment_attachments
  FOR DELETE TO authenticated
  USING (
    uploaded_by = (SELECT auth.uid())
    OR co_production_private.has_comment_role(comment_id, 60)
  );

CREATE POLICY approval_workflows_select ON co_production.approval_workflows
  FOR SELECT TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 10));
CREATE POLICY approval_workflows_insert ON co_production.approval_workflows
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND co_production_private.has_asset_role(asset_id, 70)
  );
CREATE POLICY approval_workflows_update ON co_production.approval_workflows
  FOR UPDATE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 70))
  WITH CHECK (co_production_private.has_asset_role(asset_id, 70));
CREATE POLICY approval_workflows_delete ON co_production.approval_workflows
  FOR DELETE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 70));

CREATE POLICY approvals_select ON co_production.approvals
  FOR SELECT TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 10));
CREATE POLICY approvals_insert ON co_production.approvals
  FOR INSERT TO authenticated
  WITH CHECK (co_production_private.has_asset_role(asset_id, 70));
CREATE POLICY approvals_update ON co_production.approvals
  FOR UPDATE TO authenticated
  USING (
    assignee_id = (SELECT auth.uid())
    OR co_production_private.has_asset_role(asset_id, 70)
  )
  WITH CHECK (
    assignee_id = (SELECT auth.uid())
    OR co_production_private.has_asset_role(asset_id, 70)
  );
CREATE POLICY approvals_delete ON co_production.approvals
  FOR DELETE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 70));

CREATE POLICY approval_history_select ON co_production.approval_history
  FOR SELECT TO authenticated
  USING (co_production_private.has_approval_role(approval_id, 10));

CREATE POLICY activity_log_select ON co_production.activity_log
  FOR SELECT TO authenticated
  USING (
    (project_id IS NOT NULL AND co_production_private.has_project_role(project_id, 10))
    OR (asset_id IS NOT NULL AND co_production_private.has_asset_role(asset_id, 10))
  );
CREATE POLICY activity_log_insert ON co_production.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = (SELECT auth.uid())
    AND (
      (project_id IS NOT NULL AND co_production_private.has_project_role(project_id, 10))
      OR (asset_id IS NOT NULL AND co_production_private.has_asset_role(asset_id, 10))
    )
  );

CREATE POLICY tags_select ON co_production.tags
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 10));
CREATE POLICY tags_insert ON co_production.tags
  FOR INSERT TO authenticated
  WITH CHECK (co_production_private.has_project_role(project_id, 60));
CREATE POLICY tags_update ON co_production.tags
  FOR UPDATE TO authenticated
  USING (co_production_private.has_project_role(project_id, 60))
  WITH CHECK (co_production_private.has_project_role(project_id, 60));
CREATE POLICY tags_delete ON co_production.tags
  FOR DELETE TO authenticated
  USING (co_production_private.has_project_role(project_id, 60));

CREATE POLICY asset_tags_select ON co_production.asset_tags
  FOR SELECT TO authenticated
  USING (co_production_private.can_manage_asset_tag(asset_id, tag_id, 10));
CREATE POLICY asset_tags_insert ON co_production.asset_tags
  FOR INSERT TO authenticated
  WITH CHECK (co_production_private.can_manage_asset_tag(asset_id, tag_id, 60));
CREATE POLICY asset_tags_delete ON co_production.asset_tags
  FOR DELETE TO authenticated
  USING (co_production_private.can_manage_asset_tag(asset_id, tag_id, 60));

CREATE POLICY notifications_select ON co_production.notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_update ON co_production.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_delete ON co_production.notifications
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY notification_preferences_select ON co_production.notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY notification_preferences_insert ON co_production.notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notification_preferences_update ON co_production.notification_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY notification_preferences_delete ON co_production.notification_preferences
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY transcriptions_select ON co_production.transcriptions
  FOR SELECT TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 10));

CREATE POLICY brand_checks_select ON co_production.brand_checks
  FOR SELECT TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 10));

CREATE POLICY comparison_sessions_select ON co_production.comparison_sessions
  FOR SELECT TO authenticated
  USING (
    co_production_private.has_version_role(version_a_id, 10)
    AND co_production_private.has_version_role(version_b_id, 10)
  );
CREATE POLICY comparison_sessions_insert ON co_production.comparison_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND co_production_private.has_version_role(version_a_id, 10)
    AND co_production_private.has_version_role(version_b_id, 10)
  );
CREATE POLICY comparison_sessions_delete ON co_production.comparison_sessions
  FOR DELETE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (
      co_production_private.has_version_role(version_a_id, 60)
      AND co_production_private.has_version_role(version_b_id, 60)
    )
  );

CREATE POLICY project_analytics_cache_select ON co_production.project_analytics_cache
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 10));

CREATE POLICY edit_decisions_select ON co_production.edit_decisions
  FOR SELECT TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 10));
CREATE POLICY edit_decisions_insert ON co_production.edit_decisions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND review_invite_id IS NULL
    AND (
      co_production_private.has_asset_role(asset_id, 60)
      OR (
        co_production_private.has_asset_role(asset_id, 30)
        AND decision_type = 'cut'
        AND source IN ('keyboard', 'manual')
        AND status = 'proposed'
      )
    )
  );
CREATE POLICY edit_decisions_update ON co_production.edit_decisions
  FOR UPDATE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 60))
  WITH CHECK (co_production_private.has_asset_role(asset_id, 60));
CREATE POLICY edit_decisions_delete ON co_production.edit_decisions
  FOR DELETE TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 60));

CREATE POLICY share_analytics_select ON co_production.share_analytics
  FOR SELECT TO authenticated
  USING (co_production_private.has_invite_role(invite_id, 10));

CREATE POLICY webhooks_select ON co_production.webhooks
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 80));
CREATE POLICY webhooks_insert ON co_production.webhooks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND co_production_private.has_team_role(team_id, 80)
  );
CREATE POLICY webhooks_update ON co_production.webhooks
  FOR UPDATE TO authenticated
  USING (co_production_private.has_team_role(team_id, 80))
  WITH CHECK (co_production_private.has_team_role(team_id, 80));
CREATE POLICY webhooks_delete ON co_production.webhooks
  FOR DELETE TO authenticated
  USING (co_production_private.has_team_role(team_id, 80));

CREATE POLICY webhook_deliveries_select ON co_production.webhook_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM co_production.webhooks AS webhook
      WHERE webhook.id = co_production.webhook_deliveries.webhook_id
        AND co_production_private.has_team_role(webhook.team_id, 80)
    )
  );

CREATE POLICY transcode_jobs_select ON co_production.transcode_jobs
  FOR SELECT TO authenticated
  USING (co_production_private.has_asset_role(asset_id, 60));

CREATE POLICY usage_events_select ON co_production.usage_events
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 80));

REVOKE ALL ON ALL TABLES IN SCHEMA co_production FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA co_production FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA co_production FROM PUBLIC, anon, authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA co_production TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA co_production TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  co_production.teams,
  co_production.team_members,
  co_production.team_invites,
  co_production.projects,
  co_production.project_members,
  co_production.folders,
  co_production.assets,
  co_production.versions,
  co_production.reviews,
  co_production.comments,
  co_production.annotations,
  co_production.comment_reactions,
  co_production.comment_attachments,
  co_production.approval_workflows,
  co_production.approvals,
  co_production.tags,
  co_production.asset_tags,
  co_production.notifications,
  co_production.notification_preferences,
  co_production.comparison_sessions,
  co_production.edit_decisions,
  co_production.webhooks
TO authenticated;

GRANT SELECT ON TABLE
  co_production.approval_history,
  co_production.activity_log,
  co_production.transcriptions,
  co_production.brand_checks,
  co_production.project_analytics_cache,
  co_production.share_analytics,
  co_production.webhook_deliveries,
  co_production.transcode_jobs,
  co_production.usage_events,
  co_production.approval_steps
TO authenticated;

GRANT INSERT ON TABLE co_production.activity_log TO authenticated;

REVOKE UPDATE ON TABLE
  co_production.teams,
  co_production.team_members,
  co_production.team_invites,
  co_production.projects,
  co_production.project_members,
  co_production.folders,
  co_production.assets,
  co_production.versions,
  co_production.reviews,
  co_production.comments,
  co_production.annotations,
  co_production.comment_reactions,
  co_production.comment_attachments,
  co_production.approval_workflows,
  co_production.approvals,
  co_production.tags,
  co_production.asset_tags,
  co_production.notifications,
  co_production.notification_preferences,
  co_production.comparison_sessions,
  co_production.edit_decisions,
  co_production.webhooks
FROM authenticated;

GRANT UPDATE (name, updated_at)
  ON co_production.teams TO authenticated;
GRANT UPDATE (role)
  ON co_production.team_members TO authenticated;
GRANT UPDATE (status, expires_at, updated_at)
  ON co_production.team_invites TO authenticated;
GRANT UPDATE (name, description, status, thumbnail_url, updated_at)
  ON co_production.projects TO authenticated;
GRANT UPDATE (role, expires_at, updated_at)
  ON co_production.project_members TO authenticated;
GRANT UPDATE (parent_id, name, position, updated_at)
  ON co_production.folders TO authenticated;
GRANT UPDATE (
  folder_id, title, file_type, file_url, thumbnail_url, proxy_url, nas_path,
  file_size, duration_seconds, status, metadata, position, deleted_at, updated_at
)
  ON co_production.assets TO authenticated;
GRANT UPDATE (
  file_url, file_size, notes, is_current, thumbnail_url, duration_seconds,
  resolution, updated_at
)
  ON co_production.versions TO authenticated;
GRANT UPDATE (version_id, title, status, updated_at)
  ON co_production.reviews TO authenticated;
GRANT UPDATE (
  body, rich_body, mentions, timecode_seconds, frame_number, pin_x, pin_y,
  status, resolved_by, resolved_at, updated_at
)
  ON co_production.comments TO authenticated;
GRANT UPDATE (type, data, frame_number)
  ON co_production.annotations TO authenticated;
GRANT UPDATE (mode, status, updated_at)
  ON co_production.approval_workflows TO authenticated;
GRANT UPDATE (status, decision_note, decided_at, updated_at)
  ON co_production.approvals TO authenticated;
GRANT UPDATE (name, color)
  ON co_production.tags TO authenticated;
GRANT UPDATE (read)
  ON co_production.notifications TO authenticated;
GRANT UPDATE (
  email_enabled, email_frequency, in_app_enabled, sms_enabled,
  sms_phone_e164, imessage_dry_run_enabled, updated_at
)
  ON co_production.notification_preferences TO authenticated;
GRANT UPDATE (status, label, metadata, updated_at)
  ON co_production.edit_decisions TO authenticated;
GRANT UPDATE (url, events, secret_ciphertext, active, updated_at)
  ON co_production.webhooks TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA co_production
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA co_production
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA co_production
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

CREATE INDEX teams_owner_idx ON co_production.teams(owner_id);
CREATE INDEX team_members_user_idx ON co_production.team_members(user_id, team_id);
CREATE INDEX team_invites_team_status_idx ON co_production.team_invites(team_id, status);
CREATE INDEX projects_owner_updated_idx ON co_production.projects(owner_id, updated_at DESC);
CREATE INDEX projects_team_updated_idx ON co_production.projects(team_id, updated_at DESC);
CREATE INDEX project_members_user_idx ON co_production.project_members(user_id, project_id);
CREATE INDEX folders_project_parent_idx ON co_production.folders(project_id, parent_id, position);
CREATE INDEX assets_project_status_idx ON co_production.assets(project_id, status, updated_at DESC);
CREATE INDEX assets_folder_position_idx ON co_production.assets(folder_id, position);
CREATE INDEX assets_deleted_idx ON co_production.assets(project_id, deleted_at)
  WHERE deleted_at IS NOT NULL;
CREATE UNIQUE INDEX versions_single_current_idx ON co_production.versions(asset_id)
  WHERE is_current;
CREATE INDEX comments_version_time_idx ON co_production.comments(version_id, created_at);
CREATE INDEX comments_asset_status_idx ON co_production.comments(asset_id, status, created_at);
CREATE INDEX annotations_version_frame_idx ON co_production.annotations(version_id, frame_number);
CREATE INDEX approvals_asset_step_idx ON co_production.approvals(asset_id, step_order);
CREATE INDEX approval_history_approval_idx ON co_production.approval_history(approval_id, created_at);
CREATE INDEX review_invites_asset_active_idx ON co_production.review_invites(asset_id, active, expires_at);
CREATE INDEX activity_project_created_idx ON co_production.activity_log(project_id, created_at DESC);
CREATE INDEX activity_asset_created_idx ON co_production.activity_log(asset_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON co_production.notifications(user_id, read, created_at DESC);
CREATE INDEX transcriptions_version_idx ON co_production.transcriptions(version_id, created_at DESC);
CREATE INDEX edit_decisions_version_time_idx ON co_production.edit_decisions(version_id, start_seconds, created_at);
CREATE INDEX share_analytics_invite_viewed_idx ON co_production.share_analytics(invite_id, viewed_at DESC);
CREATE INDEX webhook_deliveries_webhook_idx ON co_production.webhook_deliveries(webhook_id, delivered_at DESC);
CREATE INDEX transcode_jobs_status_created_idx ON co_production.transcode_jobs(status, created_at);
CREATE INDEX usage_events_team_created_idx ON co_production.usage_events(team_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'co_production'
      AND tablename = 'comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE co_production.comments;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'co_production'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE co_production.notifications;
  END IF;
END
$$;

COMMENT ON SCHEMA co_production IS
  'Canonical Co-Production product data. Public and anon access are denied; review links are server mediated.';
COMMENT ON TABLE co_production.review_invites IS
  'Stores only hashed and encrypted review credentials. Plaintext bearer tokens must never be persisted.';
COMMENT ON TABLE co_production.usage_events IS
  'Append-only durable Co-Credit usage evidence. Mutations are service-role only.';

COMMIT;
