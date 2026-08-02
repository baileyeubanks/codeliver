-- Co-VideoPro identity, tenant policy, preference, and brand authority.
--
-- This migration is additive and depends on the isolated co_production schema.
-- It is intentionally unapplied. Production activation still requires the
-- staging migration, rollback, RLS, and cross-tenant proof gates.

BEGIN;

ALTER TABLE co_production.projects
  ADD CONSTRAINT projects_id_team_unique UNIQUE (id, team_id);

CREATE TABLE co_production.identity_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '' CHECK (length(first_name) <= 80),
  last_name text NOT NULL DEFAULT '' CHECK (length(last_name) <= 80),
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 120),
  locale text NOT NULL DEFAULT 'en-US' CHECK (locale IN ('en-US', 'en-GB', 'es-US')),
  time_zone text NOT NULL DEFAULT 'America/Chicago' CHECK (
    time_zone IN ('America/Chicago', 'America/New_York', 'America/Los_Angeles', 'UTC')
  ),
  week_starts_on text NOT NULL DEFAULT 'sunday' CHECK (week_starts_on IN ('sunday', 'monday')),
  high_contrast boolean NOT NULL DEFAULT false,
  reviewer_color text NOT NULL DEFAULT '#4c8ef5' CHECK (reviewer_color ~ '^#[0-9A-Fa-f]{6}$'),
  authority_version integer NOT NULL DEFAULT 1 CHECK (authority_version BETWEEN 1 AND 2147483647),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.identity_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_team_id uuid REFERENCES co_production.teams(id) ON DELETE SET NULL,
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  density text NOT NULL DEFAULT 'comfortable' CHECK (density IN ('comfortable', 'compact')),
  reduce_motion boolean NOT NULL DEFAULT false,
  default_landing_page text NOT NULL DEFAULT 'projects' CHECK (
    default_landing_page IN ('projects', 'reviews', 'activity')
  ),
  authority_version integer NOT NULL DEFAULT 1 CHECK (authority_version BETWEEN 1 AND 2147483647),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE co_production.team_identity_policies (
  team_id uuid PRIMARY KEY REFERENCES co_production.teams(id) ON DELETE CASCADE,
  mfa_requirement text NOT NULL DEFAULT 'optional' CHECK (
    mfa_requirement IN ('optional', 'administrators', 'everyone')
  ),
  session_idle_minutes integer NOT NULL DEFAULT 60 CHECK (
    session_idle_minutes IN (15, 30, 60, 120, 240)
  ),
  session_max_days integer NOT NULL DEFAULT 14 CHECK (session_max_days IN (1, 7, 14, 30, 90)),
  password_authentication_enabled boolean NOT NULL DEFAULT true,
  admin_approval_required boolean NOT NULL DEFAULT true,
  sso_status text NOT NULL DEFAULT 'not_configured' CHECK (
    sso_status IN ('not_configured', 'preview', 'verified')
  ),
  scim_status text NOT NULL DEFAULT 'not_configured' CHECK (
    scim_status IN ('not_configured', 'preview', 'verified')
  ),
  authority_version integer NOT NULL DEFAULT 1 CHECK (authority_version BETWEEN 1 AND 2147483647),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE co_production.team_members
  ADD COLUMN delegated_capabilities text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN authority_version integer NOT NULL DEFAULT 1,
  ADD COLUMN updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE co_production.team_members
  ADD CONSTRAINT team_members_authority_version_check CHECK (
    authority_version BETWEEN 1 AND 2147483647
  ),
  ADD CONSTRAINT team_members_delegated_capabilities_check CHECK (
    delegated_capabilities <@ ARRAY[
      'organization.manage',
      'workspace.manage',
      'policy.manage',
      'brand.manage',
      'session.manage',
      'audit.export',
      'feature_flags.manage'
    ]::text[]
    AND cardinality(delegated_capabilities) <= 7
  );

CREATE TABLE co_production.team_feature_flags (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE CASCADE,
  project_id uuid,
  key text NOT NULL CHECK (
    key IN ('identity.policy_preview', 'identity.audit_export', 'branding.version_history')
  ),
  enabled boolean NOT NULL DEFAULT false,
  authority_version integer NOT NULL DEFAULT 1 CHECK (authority_version BETWEEN 1 AND 2147483647),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, team_id)
    REFERENCES co_production.projects(id, team_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX team_feature_flags_scope_key_unique
  ON co_production.team_feature_flags (
    team_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    key
  );

CREATE TABLE co_production.team_brand_revisions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE CASCADE,
  project_id uuid,
  scope text NOT NULL CHECK (scope IN ('organization', 'project')),
  revision_number integer NOT NULL CHECK (revision_number BETWEEN 1 AND 2147483647),
  idempotency_key text NOT NULL CHECK (
    length(idempotency_key) BETWEEN 8 AND 128
    AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  ),
  values jsonb NOT NULL,
  values_hash text NOT NULL CHECK (values_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'organization' AND project_id IS NULL)
    OR (scope = 'project' AND project_id IS NOT NULL)
  ),
  UNIQUE (team_id, idempotency_key),
  UNIQUE (id, team_id, scope),
  UNIQUE (id, team_id, scope, project_id),
  FOREIGN KEY (project_id, team_id)
    REFERENCES co_production.projects(id, team_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX team_brand_revisions_scope_version_unique
  ON co_production.team_brand_revisions (
    team_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    revision_number
  );

CREATE TABLE co_production.team_brand_publications (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE CASCADE,
  project_id uuid,
  scope text NOT NULL CHECK (scope IN ('organization', 'project')),
  revision_id uuid NOT NULL,
  authority_version integer NOT NULL DEFAULT 1 CHECK (authority_version BETWEEN 1 AND 2147483647),
  published_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'organization' AND project_id IS NULL)
    OR (scope = 'project' AND project_id IS NOT NULL)
  ),
  FOREIGN KEY (project_id, team_id)
    REFERENCES co_production.projects(id, team_id) ON DELETE CASCADE,
  FOREIGN KEY (revision_id, team_id, scope)
    REFERENCES co_production.team_brand_revisions(id, team_id, scope) ON DELETE RESTRICT,
  FOREIGN KEY (revision_id, team_id, scope, project_id)
    REFERENCES co_production.team_brand_revisions(id, team_id, scope, project_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX team_brand_publications_scope_unique
  ON co_production.team_brand_publications (
    team_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE TABLE co_production.identity_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id uuid REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 3 AND 160),
  target_type text NOT NULL CHECK (length(target_type) BETWEEN 3 AND 80),
  target_id text NOT NULL CHECK (length(target_id) BETWEEN 1 AND 240),
  before_hash text CHECK (before_hash IS NULL OR before_hash ~ '^[0-9a-f]{64}$'),
  after_hash text CHECK (after_hash IS NULL OR after_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_audit_log_team_created_idx
  ON co_production.identity_audit_log(team_id, created_at DESC);
CREATE INDEX identity_audit_log_actor_created_idx
  ON co_production.identity_audit_log(actor_id, created_at DESC);

ALTER TABLE co_production.identity_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.identity_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.identity_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.identity_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.team_identity_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.team_identity_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.team_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.team_feature_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.team_brand_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.team_brand_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.team_brand_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.team_brand_publications FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.identity_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.identity_audit_log FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION co_production_private.has_active_surface_identity()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND coalesce(auth.jwt() -> 'app_metadata' ->> 'content_coop_role', '')
      IN ('staff', 'client')
$$;

CREATE OR REPLACE FUNCTION co_production_private.identity_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
BEGIN
  IF actor IS NULL OR NOT co_production_private.has_active_surface_identity() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'identity_forbidden';
  END IF;
  RETURN actor;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.can_seed_owned_team_membership(
  target_team_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    co_production_private.has_active_surface_identity()
    AND target_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM co_production.teams AS team
      WHERE team.id = target_team_id
        AND team.owner_id = (SELECT auth.uid())
    )
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
  SELECT
    co_production_private.has_active_surface_identity()
    AND EXISTS (
      SELECT 1
      FROM co_production.team_members AS member
      WHERE member.team_id = target_team_id
        AND member.user_id = (SELECT auth.uid())
        AND co_production_private.role_rank(member.role) >= required_rank
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
  SELECT
    co_production_private.has_active_surface_identity()
    AND EXISTS (
      SELECT 1
      FROM co_production.projects AS project
      WHERE project.id = target_project_id
        AND (
          (
            project.team_id IS NULL
            AND project.owner_id = (SELECT auth.uid())
          )
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

CREATE OR REPLACE FUNCTION co_production_private.identity_has_capability(
  p_team_id uuid,
  p_capability text,
  p_minimum_rank integer DEFAULT 80
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    co_production_private.has_team_role(p_team_id, p_minimum_rank)
    OR EXISTS (
      SELECT 1
      FROM co_production.team_members AS member
      WHERE member.team_id = p_team_id
        AND member.user_id = (SELECT auth.uid())
        AND p_capability = ANY(member.delegated_capabilities)
    )
$$;

CREATE OR REPLACE FUNCTION co_production_private.append_identity_audit(
  p_team_id uuid,
  p_actor_id uuid,
  p_request_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_before jsonb,
  p_after jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO co_production.identity_audit_log (
    team_id,
    actor_id,
    request_id,
    action,
    target_type,
    target_id,
    before_hash,
    after_hash
  ) VALUES (
    p_team_id,
    p_actor_id,
    p_request_id,
    p_action,
    p_target_type,
    p_target_id,
    CASE WHEN p_before IS NULL THEN NULL ELSE pg_catalog.encode(extensions.digest(p_before::text, 'sha256'), 'hex') END,
    CASE WHEN p_after IS NULL THEN NULL ELSE pg_catalog.encode(extensions.digest(p_after::text, 'sha256'), 'hex') END
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.reject_identity_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'identity_history_is_immutable';
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.enforce_team_member_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.delegated_capabilities <> '{}'::text[]
      OR NEW.authority_version <> 1
      OR NEW.updated_by IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'identity_membership_mutation_forbidden';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.delegated_capabilities IS DISTINCT FROM OLD.delegated_capabilities
    OR NEW.authority_version IS DISTINCT FROM OLD.authority_version
    OR NEW.updated_by IS DISTINCT FROM OLD.updated_by THEN
    actor := (SELECT auth.uid());
    IF actor IS NULL
      OR NEW.updated_by IS DISTINCT FROM actor
      OR NEW.authority_version <> OLD.authority_version + 1
      OR NOT co_production_private.has_team_role(OLD.team_id, 100) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'identity_membership_mutation_forbidden';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.clear_inactive_team_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE co_production.identity_preferences AS preference
  SET
    active_team_id = NULL,
    authority_version = preference.authority_version + 1,
    updated_by = coalesce((SELECT auth.uid()), OLD.user_id)
  WHERE preference.user_id = OLD.user_id
    AND preference.active_team_id = OLD.team_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER team_brand_revisions_immutable
  BEFORE UPDATE OR DELETE ON co_production.team_brand_revisions
  FOR EACH ROW EXECUTE FUNCTION co_production_private.reject_identity_history_mutation();
CREATE TRIGGER team_brand_revisions_no_truncate
  BEFORE TRUNCATE ON co_production.team_brand_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION co_production_private.reject_identity_history_mutation();
CREATE TRIGGER identity_audit_log_immutable
  BEFORE UPDATE OR DELETE ON co_production.identity_audit_log
  FOR EACH ROW EXECUTE FUNCTION co_production_private.reject_identity_history_mutation();
CREATE TRIGGER identity_audit_log_no_truncate
  BEFORE TRUNCATE ON co_production.identity_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION co_production_private.reject_identity_history_mutation();
CREATE TRIGGER team_members_identity_mutation_guard
  BEFORE INSERT OR UPDATE OF delegated_capabilities, authority_version, updated_by
  ON co_production.team_members
  FOR EACH ROW EXECUTE FUNCTION co_production_private.enforce_team_member_identity_mutation();
CREATE TRIGGER team_members_clear_inactive_preference
  AFTER DELETE OR UPDATE OF team_id, user_id ON co_production.team_members
  FOR EACH ROW EXECUTE FUNCTION co_production_private.clear_inactive_team_preference();

CREATE TRIGGER identity_profiles_set_updated_at
  BEFORE UPDATE ON co_production.identity_profiles
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER identity_preferences_set_updated_at
  BEFORE UPDATE ON co_production.identity_preferences
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER team_identity_policies_set_updated_at
  BEFORE UPDATE ON co_production.team_identity_policies
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER team_members_identity_set_updated_at
  BEFORE UPDATE OF delegated_capabilities, authority_version ON co_production.team_members
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();
CREATE TRIGGER team_feature_flags_set_updated_at
  BEFORE UPDATE ON co_production.team_feature_flags
  FOR EACH ROW EXECUTE FUNCTION co_production_private.set_updated_at();

CREATE POLICY identity_profiles_select ON co_production.identity_profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY identity_preferences_select ON co_production.identity_preferences
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY team_identity_policies_select ON co_production.team_identity_policies
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));
CREATE POLICY team_feature_flags_select ON co_production.team_feature_flags
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));
CREATE POLICY team_brand_revisions_select ON co_production.team_brand_revisions
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));
CREATE POLICY team_brand_publications_select ON co_production.team_brand_publications
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));
CREATE POLICY identity_audit_log_select ON co_production.identity_audit_log
  FOR SELECT TO authenticated
  USING (
    (team_id IS NULL AND actor_id = (SELECT auth.uid()))
    OR co_production_private.identity_has_capability(team_id, 'audit.export', 80)
  );

DROP POLICY teams_insert ON co_production.teams;
CREATE POLICY teams_insert ON co_production.teams
  FOR INSERT TO authenticated
  WITH CHECK (
    co_production_private.has_active_surface_identity()
    AND owner_id = (SELECT auth.uid())
  );

DROP POLICY team_members_insert ON co_production.team_members;
CREATE POLICY team_members_insert ON co_production.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    delegated_capabilities = '{}'::text[]
    AND authority_version = 1
    AND updated_by IS NULL
    AND (
      (
        role = 'owner'
        AND co_production_private.can_seed_owned_team_membership(team_id, user_id)
      )
      OR (
        role <> 'owner'
        AND co_production_private.has_team_role(team_id, 80)
        AND (
          role <> 'admin'
          OR co_production_private.has_team_role(team_id, 100)
        )
      )
    )
  );

DROP POLICY team_members_update ON co_production.team_members;
CREATE POLICY team_members_update ON co_production.team_members
  FOR UPDATE TO authenticated
  USING (
    co_production_private.has_team_role(team_id, 80)
    AND role <> 'owner'
    AND (
      role <> 'admin'
      OR co_production_private.has_team_role(team_id, 100)
    )
  )
  WITH CHECK (
    co_production_private.has_team_role(team_id, 80)
    AND role <> 'owner'
    AND (
      role <> 'admin'
      OR co_production_private.has_team_role(team_id, 100)
    )
  );

DROP POLICY team_members_delete ON co_production.team_members;
CREATE POLICY team_members_delete ON co_production.team_members
  FOR DELETE TO authenticated
  USING (
    co_production_private.has_team_role(team_id, 80)
    AND role <> 'owner'
    AND (
      role <> 'admin'
      OR co_production_private.has_team_role(team_id, 100)
    )
  );

DROP POLICY projects_insert ON co_production.projects;
CREATE POLICY projects_insert ON co_production.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    co_production_private.has_active_surface_identity()
    AND owner_id = (SELECT auth.uid())
    AND (
      team_id IS NULL
      OR co_production_private.has_team_role(team_id, 80)
    )
  );

CREATE OR REPLACE FUNCTION co_production.ensure_identity_principal()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := co_production_private.identity_actor();
  metadata jsonb;
BEGIN
  SELECT coalesce(raw_user_meta_data, '{}'::jsonb)
  INTO metadata
  FROM auth.users
  WHERE id = actor;

  INSERT INTO co_production.identity_profiles (
    user_id,
    first_name,
    last_name,
    updated_by
  ) VALUES (
    actor,
    left(coalesce(metadata ->> 'first_name', ''), 80),
    left(coalesce(metadata ->> 'last_name', ''), 80),
    actor
  ) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO co_production.identity_preferences (user_id, updated_by)
  VALUES (actor, actor)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN pg_catalog.jsonb_build_object('userId', actor);
END
$$;

CREATE OR REPLACE FUNCTION co_production.get_identity_context(p_team_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := co_production_private.identity_actor();
  active_team uuid;
  result jsonb;
BEGIN
  PERFORM co_production.ensure_identity_principal();

  IF p_team_id IS NOT NULL THEN
    IF NOT co_production_private.has_team_role(p_team_id, 10) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'identity_forbidden';
    END IF;
    active_team := p_team_id;
  ELSE
    SELECT preference.active_team_id
    INTO active_team
    FROM co_production.identity_preferences AS preference
    WHERE preference.user_id = actor
      AND preference.active_team_id IS NOT NULL
      AND co_production_private.has_team_role(preference.active_team_id, 10);

    IF active_team IS NULL THEN
      SELECT member.team_id
      INTO active_team
      FROM co_production.team_members AS member
      WHERE member.user_id = actor
      ORDER BY member.joined_at, member.team_id
      LIMIT 1;
    END IF;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'actor', pg_catalog.jsonb_build_object(
      'id', actor,
      'email', auth_user.email,
      'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
      'sessionId', auth.jwt() ->> 'session_id'
    ),
    'profile', pg_catalog.jsonb_build_object(
      'firstName', profile.first_name,
      'lastName', profile.last_name,
      'title', profile.title,
      'locale', profile.locale,
      'timeZone', profile.time_zone,
      'weekStartsOn', profile.week_starts_on,
      'highContrast', profile.high_contrast,
      'reviewerColor', profile.reviewer_color,
      'version', profile.authority_version,
      'updatedAt', profile.updated_at
    ),
    'preferences', pg_catalog.jsonb_build_object(
      'activeTeamId', preference.active_team_id,
      'theme', preference.theme,
      'density', preference.density,
      'reduceMotion', preference.reduce_motion,
      'defaultLandingPage', preference.default_landing_page,
      'version', preference.authority_version,
      'updatedAt', preference.updated_at
    ),
    'activeTeamId', active_team,
    'memberships', coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'teamId', team.id,
        'teamName', team.name,
        'role', member.role,
        'delegatedCapabilities', member.delegated_capabilities,
        'version', member.authority_version
      ) ORDER BY team.name, team.id)
      FROM co_production.team_members AS member
      JOIN co_production.teams AS team ON team.id = member.team_id
      WHERE member.user_id = actor
    ), '[]'::jsonb),
    'policy', CASE WHEN active_team IS NULL THEN NULL ELSE coalesce((
      SELECT pg_catalog.jsonb_build_object(
        'teamId', policy.team_id,
        'mfaRequirement', policy.mfa_requirement,
        'sessionIdleMinutes', policy.session_idle_minutes,
        'sessionMaxDays', policy.session_max_days,
        'passwordAuthenticationEnabled', policy.password_authentication_enabled,
        'adminApprovalRequired', policy.admin_approval_required,
        'ssoStatus', policy.sso_status,
        'scimStatus', policy.scim_status,
        'version', policy.authority_version,
        'updatedAt', policy.updated_at
      )
      FROM co_production.team_identity_policies AS policy
      WHERE policy.team_id = active_team
    ), pg_catalog.jsonb_build_object(
      'teamId', active_team,
      'mfaRequirement', 'optional',
      'sessionIdleMinutes', 60,
      'sessionMaxDays', 14,
      'passwordAuthenticationEnabled', true,
      'adminApprovalRequired', true,
      'ssoStatus', 'not_configured',
      'scimStatus', 'not_configured',
      'version', 0
    )) END,
    'featureFlags', CASE WHEN active_team IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', flag.id,
        'key', flag.key,
        'projectId', flag.project_id,
        'enabled', flag.enabled,
        'version', flag.authority_version
      ) ORDER BY flag.key, flag.project_id NULLS FIRST)
      FROM co_production.team_feature_flags AS flag
      WHERE flag.team_id = active_team
    ), '[]'::jsonb) END,
    'brand', CASE WHEN active_team IS NULL THEN NULL ELSE (
      SELECT pg_catalog.jsonb_build_object(
        'publicationId', publication.id,
        'publicationVersion', publication.authority_version,
        'revisionId', revision.id,
        'revisionNumber', revision.revision_number,
        'scope', revision.scope,
        'projectId', revision.project_id,
        'values', revision.values,
        'publishedAt', publication.published_at
      )
      FROM co_production.team_brand_publications AS publication
      JOIN co_production.team_brand_revisions AS revision ON revision.id = publication.revision_id
      WHERE publication.team_id = active_team
        AND publication.project_id IS NULL
      LIMIT 1
    ) END
  )
  INTO result
  FROM auth.users AS auth_user
  JOIN co_production.identity_profiles AS profile ON profile.user_id = auth_user.id
  JOIN co_production.identity_preferences AS preference ON preference.user_id = auth_user.id
  WHERE auth_user.id = actor;

  RETURN result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.update_identity_profile(
  p_expected_version integer,
  p_patch jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := co_production_private.identity_actor();
  before_row jsonb;
  after_row jsonb;
  active_team uuid;
BEGIN
  PERFORM co_production.ensure_identity_principal();
  IF p_request_id IS NULL OR p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_profile';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_patch) AS key
    WHERE key <> ALL(ARRAY[
      'firstName', 'lastName', 'title', 'locale', 'timeZone',
      'weekStartsOn', 'highContrast', 'reviewerColor'
    ]::text[])
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_profile';
  END IF;
  IF p_patch ? 'firstName' AND (length(btrim(p_patch ->> 'firstName')) < 1 OR length(p_patch ->> 'firstName') > 80) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_profile';
  END IF;
  IF p_patch ? 'lastName' AND (length(btrim(p_patch ->> 'lastName')) < 1 OR length(p_patch ->> 'lastName') > 80) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_profile';
  END IF;
  IF p_patch ? 'title' AND length(p_patch ->> 'title') > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_profile';
  END IF;
  IF p_patch ? 'locale' AND p_patch ->> 'locale' NOT IN ('en-US', 'en-GB', 'es-US') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_profile';
  END IF;
  IF p_patch ? 'timeZone' AND p_patch ->> 'timeZone' NOT IN (
    'America/Chicago', 'America/New_York', 'America/Los_Angeles', 'UTC'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_profile';
  END IF;
  IF p_patch ? 'weekStartsOn' AND p_patch ->> 'weekStartsOn' NOT IN ('sunday', 'monday') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_profile';
  END IF;
  IF p_patch ? 'highContrast' AND pg_catalog.jsonb_typeof(p_patch -> 'highContrast') <> 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_profile';
  END IF;
  IF p_patch ? 'reviewerColor' AND p_patch ->> 'reviewerColor' !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_profile';
  END IF;

  SELECT
    to_jsonb(profile),
    CASE
      WHEN preference.active_team_id IS NOT NULL
        AND co_production_private.has_team_role(preference.active_team_id, 10)
      THEN preference.active_team_id
      ELSE NULL
    END
  INTO before_row, active_team
  FROM co_production.identity_profiles AS profile
  JOIN co_production.identity_preferences AS preference ON preference.user_id = profile.user_id
  WHERE profile.user_id = actor;

  UPDATE co_production.identity_profiles AS profile
  SET
    first_name = CASE WHEN p_patch ? 'firstName' THEN btrim(p_patch ->> 'firstName') ELSE profile.first_name END,
    last_name = CASE WHEN p_patch ? 'lastName' THEN btrim(p_patch ->> 'lastName') ELSE profile.last_name END,
    title = CASE WHEN p_patch ? 'title' THEN btrim(p_patch ->> 'title') ELSE profile.title END,
    locale = CASE WHEN p_patch ? 'locale' THEN p_patch ->> 'locale' ELSE profile.locale END,
    time_zone = CASE WHEN p_patch ? 'timeZone' THEN p_patch ->> 'timeZone' ELSE profile.time_zone END,
    week_starts_on = CASE WHEN p_patch ? 'weekStartsOn' THEN p_patch ->> 'weekStartsOn' ELSE profile.week_starts_on END,
    high_contrast = CASE WHEN p_patch ? 'highContrast' THEN (p_patch ->> 'highContrast')::boolean ELSE profile.high_contrast END,
    reviewer_color = CASE WHEN p_patch ? 'reviewerColor' THEN p_patch ->> 'reviewerColor' ELSE profile.reviewer_color END,
    authority_version = profile.authority_version + 1,
    updated_by = actor
  WHERE profile.user_id = actor
    AND profile.authority_version = p_expected_version
  RETURNING to_jsonb(profile) INTO after_row;

  IF after_row IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
  END IF;
  PERFORM co_production_private.append_identity_audit(
    active_team, actor, p_request_id, 'identity.profile.updated', 'user', actor::text, before_row, after_row
  );
  RETURN after_row;
END
$$;

CREATE OR REPLACE FUNCTION co_production.update_identity_preferences(
  p_expected_version integer,
  p_patch jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := co_production_private.identity_actor();
  requested_team uuid;
  before_row jsonb;
  after_row jsonb;
BEGIN
  PERFORM co_production.ensure_identity_principal();
  IF p_request_id IS NULL OR p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_preferences';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_patch) AS key
    WHERE key <> ALL(ARRAY[
      'activeTeamId', 'theme', 'density', 'reduceMotion', 'defaultLandingPage'
    ]::text[])
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_preferences';
  END IF;
  IF p_patch ? 'activeTeamId' AND p_patch -> 'activeTeamId' <> 'null'::jsonb THEN
    BEGIN
      requested_team := (p_patch ->> 'activeTeamId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_preferences';
    END;
    IF NOT co_production_private.has_team_role(requested_team, 10) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'cross_tenant_identity_forbidden';
    END IF;
  END IF;
  IF p_patch ? 'theme' AND p_patch ->> 'theme' NOT IN ('system', 'light', 'dark') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_preferences';
  END IF;
  IF p_patch ? 'density' AND p_patch ->> 'density' NOT IN ('comfortable', 'compact') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_preferences';
  END IF;
  IF p_patch ? 'defaultLandingPage' AND p_patch ->> 'defaultLandingPage' NOT IN ('projects', 'reviews', 'activity') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_preferences';
  END IF;
  IF p_patch ? 'reduceMotion' AND pg_catalog.jsonb_typeof(p_patch -> 'reduceMotion') <> 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_preferences';
  END IF;

  SELECT to_jsonb(preference) INTO before_row
  FROM co_production.identity_preferences AS preference
  WHERE preference.user_id = actor;

  UPDATE co_production.identity_preferences AS preference
  SET
    active_team_id = CASE
      WHEN p_patch ? 'activeTeamId' AND p_patch -> 'activeTeamId' = 'null'::jsonb THEN NULL
      WHEN p_patch ? 'activeTeamId' THEN requested_team
      ELSE preference.active_team_id
    END,
    theme = CASE WHEN p_patch ? 'theme' THEN p_patch ->> 'theme' ELSE preference.theme END,
    density = CASE WHEN p_patch ? 'density' THEN p_patch ->> 'density' ELSE preference.density END,
    reduce_motion = CASE WHEN p_patch ? 'reduceMotion' THEN (p_patch ->> 'reduceMotion')::boolean ELSE preference.reduce_motion END,
    default_landing_page = CASE WHEN p_patch ? 'defaultLandingPage' THEN p_patch ->> 'defaultLandingPage' ELSE preference.default_landing_page END,
    authority_version = preference.authority_version + 1,
    updated_by = actor
  WHERE preference.user_id = actor
    AND preference.authority_version = p_expected_version
  RETURNING to_jsonb(preference) INTO after_row;

  IF after_row IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
  END IF;
  PERFORM co_production_private.append_identity_audit(
    coalesce(requested_team, (after_row ->> 'active_team_id')::uuid),
    actor,
    p_request_id,
    'identity.preferences.updated',
    'user',
    actor::text,
    before_row,
    after_row
  );
  RETURN after_row;
END
$$;

CREATE OR REPLACE FUNCTION co_production.update_team_identity_policy(
  p_team_id uuid,
  p_expected_version integer,
  p_patch jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := co_production_private.identity_actor();
  before_row jsonb;
  after_row jsonb;
  current_policy co_production.team_identity_policies%ROWTYPE;
  next_sso_status text;
BEGIN
  IF p_request_id IS NULL OR p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
  END IF;
  IF NOT co_production_private.has_team_role(p_team_id, 80) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'identity_forbidden';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_patch) AS key
    WHERE key <> ALL(ARRAY[
      'mfaRequirement', 'sessionIdleMinutes', 'sessionMaxDays',
      'passwordAuthenticationEnabled', 'adminApprovalRequired', 'ssoStatus', 'scimStatus'
    ]::text[])
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
  END IF;
  IF p_patch ? 'mfaRequirement' AND p_patch ->> 'mfaRequirement' NOT IN ('optional', 'administrators', 'everyone') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
  END IF;
  IF p_patch ? 'sessionIdleMinutes' AND pg_catalog.jsonb_typeof(p_patch -> 'sessionIdleMinutes') <> 'number' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
  END IF;
  IF p_patch ? 'sessionIdleMinutes' AND (p_patch ->> 'sessionIdleMinutes')::integer NOT IN (15, 30, 60, 120, 240) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
  END IF;
  IF p_patch ? 'sessionMaxDays' AND pg_catalog.jsonb_typeof(p_patch -> 'sessionMaxDays') <> 'number' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
  END IF;
  IF p_patch ? 'sessionMaxDays' AND (p_patch ->> 'sessionMaxDays')::integer NOT IN (1, 7, 14, 30, 90) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
  END IF;
  IF p_patch ? 'ssoStatus' AND p_patch ->> 'ssoStatus' NOT IN ('not_configured', 'preview', 'verified') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
  END IF;
  IF p_patch ? 'scimStatus' AND p_patch ->> 'scimStatus' NOT IN ('not_configured', 'preview', 'verified') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
  END IF;
  IF p_patch ? 'passwordAuthenticationEnabled'
    AND pg_catalog.jsonb_typeof(p_patch -> 'passwordAuthenticationEnabled') <> 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
  END IF;
  IF p_patch ? 'adminApprovalRequired'
    AND pg_catalog.jsonb_typeof(p_patch -> 'adminApprovalRequired') <> 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
  END IF;
  IF (p_patch ? 'ssoStatus' OR p_patch ? 'scimStatus')
    AND NOT co_production_private.has_team_role(p_team_id, 100) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'identity_forbidden';
  END IF;

  SELECT * INTO current_policy
  FROM co_production.team_identity_policies
  WHERE team_id = p_team_id
  FOR UPDATE;

  next_sso_status := CASE
    WHEN p_patch ? 'ssoStatus' THEN p_patch ->> 'ssoStatus'
    WHEN FOUND THEN current_policy.sso_status
    ELSE 'not_configured'
  END;
  IF p_patch ? 'passwordAuthenticationEnabled'
    AND NOT (p_patch ->> 'passwordAuthenticationEnabled')::boolean
    AND (
      next_sso_status <> 'verified'
      OR NOT co_production_private.has_team_role(p_team_id, 100)
      OR coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'identity_assurance_required';
  END IF;

  IF NOT FOUND THEN
    IF p_expected_version <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
    END IF;
    INSERT INTO co_production.team_identity_policies (
      team_id,
      mfa_requirement,
      session_idle_minutes,
      session_max_days,
      password_authentication_enabled,
      admin_approval_required,
      sso_status,
      scim_status,
      updated_by
    ) VALUES (
      p_team_id,
      coalesce(p_patch ->> 'mfaRequirement', 'optional'),
      coalesce((p_patch ->> 'sessionIdleMinutes')::integer, 60),
      coalesce((p_patch ->> 'sessionMaxDays')::integer, 14),
      coalesce((p_patch ->> 'passwordAuthenticationEnabled')::boolean, true),
      coalesce((p_patch ->> 'adminApprovalRequired')::boolean, true),
      coalesce(p_patch ->> 'ssoStatus', 'not_configured'),
      coalesce(p_patch ->> 'scimStatus', 'not_configured'),
      actor
    )
    ON CONFLICT (team_id) DO NOTHING
    RETURNING to_jsonb(team_identity_policies) INTO after_row;
    IF after_row IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
    END IF;
  ELSE
    before_row := to_jsonb(current_policy);
    UPDATE co_production.team_identity_policies AS policy
    SET
      mfa_requirement = CASE WHEN p_patch ? 'mfaRequirement' THEN p_patch ->> 'mfaRequirement' ELSE policy.mfa_requirement END,
      session_idle_minutes = CASE WHEN p_patch ? 'sessionIdleMinutes' THEN (p_patch ->> 'sessionIdleMinutes')::integer ELSE policy.session_idle_minutes END,
      session_max_days = CASE WHEN p_patch ? 'sessionMaxDays' THEN (p_patch ->> 'sessionMaxDays')::integer ELSE policy.session_max_days END,
      password_authentication_enabled = CASE WHEN p_patch ? 'passwordAuthenticationEnabled' THEN (p_patch ->> 'passwordAuthenticationEnabled')::boolean ELSE policy.password_authentication_enabled END,
      admin_approval_required = CASE WHEN p_patch ? 'adminApprovalRequired' THEN (p_patch ->> 'adminApprovalRequired')::boolean ELSE policy.admin_approval_required END,
      sso_status = CASE WHEN p_patch ? 'ssoStatus' THEN p_patch ->> 'ssoStatus' ELSE policy.sso_status END,
      scim_status = CASE WHEN p_patch ? 'scimStatus' THEN p_patch ->> 'scimStatus' ELSE policy.scim_status END,
      authority_version = policy.authority_version + 1,
      updated_by = actor
    WHERE policy.team_id = p_team_id
      AND policy.authority_version = p_expected_version
    RETURNING to_jsonb(policy) INTO after_row;
    IF after_row IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
    END IF;
  END IF;

  PERFORM co_production_private.append_identity_audit(
    p_team_id, actor, p_request_id, 'identity.policy.updated', 'team', p_team_id::text, before_row, after_row
  );
  RETURN after_row;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_policy';
END
$$;

CREATE OR REPLACE FUNCTION co_production.update_team_member_capabilities(
  p_team_id uuid,
  p_target_user_id uuid,
  p_expected_version integer,
  p_capabilities text[],
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := co_production_private.identity_actor();
  before_row jsonb;
  after_row jsonb;
  normalized text[];
BEGIN
  IF p_request_id IS NULL OR NOT co_production_private.has_team_role(p_team_id, 100) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'identity_forbidden';
  END IF;
  SELECT coalesce(array_agg(DISTINCT capability ORDER BY capability), '{}'::text[])
  INTO normalized
  FROM unnest(coalesce(p_capabilities, '{}'::text[])) AS capability;
  IF cardinality(normalized) > 7 OR NOT normalized <@ ARRAY[
    'organization.manage', 'workspace.manage', 'policy.manage', 'brand.manage',
    'session.manage', 'audit.export', 'feature_flags.manage'
  ]::text[] THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_capabilities';
  END IF;

  SELECT to_jsonb(member) INTO before_row
  FROM co_production.team_members AS member
  WHERE member.team_id = p_team_id
    AND member.user_id = p_target_user_id
    AND member.role <> 'owner';
  IF before_row IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'identity_not_found';
  END IF;

  UPDATE co_production.team_members AS member
  SET
    delegated_capabilities = normalized,
    authority_version = member.authority_version + 1,
    updated_by = actor
  WHERE member.team_id = p_team_id
    AND member.user_id = p_target_user_id
    AND member.role <> 'owner'
    AND member.authority_version = p_expected_version
  RETURNING to_jsonb(member) INTO after_row;
  IF after_row IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
  END IF;

  PERFORM co_production_private.append_identity_audit(
    p_team_id,
    actor,
    p_request_id,
    'identity.membership.capabilities_updated',
    'team_member',
    p_target_user_id::text,
    before_row,
    after_row
  );
  RETURN after_row;
END
$$;

CREATE OR REPLACE FUNCTION co_production.update_team_feature_flag(
  p_team_id uuid,
  p_project_id uuid,
  p_expected_version integer,
  p_key text,
  p_enabled boolean,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := co_production_private.identity_actor();
  current_row co_production.team_feature_flags%ROWTYPE;
  before_row jsonb;
  after_row jsonb;
BEGIN
  IF p_request_id IS NULL OR NOT co_production_private.identity_has_capability(
    p_team_id, 'feature_flags.manage', 100
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'identity_forbidden';
  END IF;
  IF p_key NOT IN ('identity.policy_preview', 'identity.audit_export', 'branding.version_history') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_feature_flag';
  END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM co_production.projects AS project
    WHERE project.id = p_project_id AND project.team_id = p_team_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'cross_tenant_identity_forbidden';
  END IF;

  SELECT * INTO current_row
  FROM co_production.team_feature_flags AS flag
  WHERE flag.team_id = p_team_id
    AND flag.project_id IS NOT DISTINCT FROM p_project_id
    AND flag.key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_expected_version <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
    END IF;
    INSERT INTO co_production.team_feature_flags (
      team_id, project_id, key, enabled, updated_by
    ) VALUES (
      p_team_id, p_project_id, p_key, p_enabled, actor
    )
    ON CONFLICT DO NOTHING
    RETURNING to_jsonb(team_feature_flags) INTO after_row;
    IF after_row IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
    END IF;
  ELSE
    before_row := to_jsonb(current_row);
    UPDATE co_production.team_feature_flags AS flag
    SET
      enabled = p_enabled,
      authority_version = flag.authority_version + 1,
      updated_by = actor
    WHERE flag.id = current_row.id
      AND flag.authority_version = p_expected_version
    RETURNING to_jsonb(flag) INTO after_row;
    IF after_row IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
    END IF;
  END IF;

  PERFORM co_production_private.append_identity_audit(
    p_team_id, actor, p_request_id, 'identity.feature_flag.updated', 'feature_flag', p_key, before_row, after_row
  );
  RETURN after_row;
END
$$;

CREATE OR REPLACE FUNCTION co_production.create_team_brand_revision(
  p_team_id uuid,
  p_project_id uuid,
  p_scope text,
  p_expected_published_version integer,
  p_idempotency_key text,
  p_values jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := co_production_private.identity_actor();
  existing_row co_production.team_brand_revisions%ROWTYPE;
  publication_version integer;
  next_revision integer;
  inserted_row jsonb;
  values_hash text;
BEGIN
  IF p_request_id IS NULL OR NOT co_production_private.identity_has_capability(
    p_team_id, 'brand.manage', 80
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'identity_forbidden';
  END IF;
  IF p_scope NOT IN ('organization', 'project')
    OR (p_scope = 'organization' AND p_project_id IS NOT NULL)
    OR (p_scope = 'project' AND p_project_id IS NULL)
    OR length(p_idempotency_key) NOT BETWEEN 8 AND 128
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
    OR p_values IS NULL
    OR pg_catalog.jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_brand';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_values) AS key
    WHERE key <> ALL(ARRAY[
      'displayName', 'playerLabel', 'primaryColor', 'logoAssetId', 'cornerRadius', 'showPoweredBy'
    ]::text[])
  ) OR (
    SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_values)
  ) <> 6 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_brand';
  END IF;
  IF length(btrim(p_values ->> 'displayName')) NOT BETWEEN 1 AND 80
    OR length(btrim(p_values ->> 'playerLabel')) NOT BETWEEN 1 AND 120
    OR p_values ->> 'primaryColor' !~ '^#[0-9A-Fa-f]{6}$'
    OR pg_catalog.jsonb_typeof(p_values -> 'cornerRadius') <> 'number'
    OR (p_values ->> 'cornerRadius')::integer NOT BETWEEN 0 AND 16
    OR pg_catalog.jsonb_typeof(p_values -> 'showPoweredBy') <> 'boolean'
    OR (
      p_values -> 'logoAssetId' <> 'null'::jsonb
      AND NOT EXISTS (
        SELECT 1
        FROM co_production.assets AS asset
        JOIN co_production.projects AS project ON project.id = asset.project_id
        WHERE asset.id = (p_values ->> 'logoAssetId')::uuid
          AND project.team_id = p_team_id
          AND (p_project_id IS NULL OR project.id = p_project_id)
          AND co_production_private.has_asset_role(asset.id, 10)
      )
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_brand';
  END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM co_production.projects AS project
    WHERE project.id = p_project_id AND project.team_id = p_team_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'cross_tenant_identity_forbidden';
  END IF;

  values_hash := pg_catalog.encode(extensions.digest(p_values::text, 'sha256'), 'hex');
  SELECT * INTO existing_row
  FROM co_production.team_brand_revisions AS revision
  WHERE revision.team_id = p_team_id
    AND revision.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_row.project_id IS NOT DISTINCT FROM p_project_id
      AND existing_row.scope = p_scope
      AND existing_row.values_hash = values_hash THEN
      RETURN to_jsonb(existing_row);
    END IF;
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'identity_idempotency_conflict';
  END IF;

  PERFORM 1 FROM co_production.teams AS team WHERE team.id = p_team_id FOR UPDATE;
  SELECT coalesce(publication.authority_version, 0)
  INTO publication_version
  FROM co_production.team_brand_publications AS publication
  WHERE publication.team_id = p_team_id
    AND publication.project_id IS NOT DISTINCT FROM p_project_id;
  publication_version := coalesce(publication_version, 0);
  IF publication_version <> p_expected_published_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
  END IF;

  SELECT coalesce(max(revision.revision_number), 0) + 1
  INTO next_revision
  FROM co_production.team_brand_revisions AS revision
  WHERE revision.team_id = p_team_id
    AND revision.project_id IS NOT DISTINCT FROM p_project_id;

  INSERT INTO co_production.team_brand_revisions (
    team_id,
    project_id,
    scope,
    revision_number,
    idempotency_key,
    values,
    values_hash,
    created_by
  ) VALUES (
    p_team_id,
    p_project_id,
    p_scope,
    next_revision,
    p_idempotency_key,
    p_values,
    values_hash,
    actor
  ) RETURNING to_jsonb(team_brand_revisions) INTO inserted_row;

  PERFORM co_production_private.append_identity_audit(
    p_team_id,
    actor,
    p_request_id,
    'identity.brand.revision_created',
    'brand_revision',
    inserted_row ->> 'id',
    NULL,
    inserted_row
  );
  RETURN inserted_row;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'identity_invalid_brand';
END
$$;

CREATE OR REPLACE FUNCTION co_production.publish_team_brand_revision(
  p_team_id uuid,
  p_revision_id uuid,
  p_expected_published_version integer,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := co_production_private.identity_actor();
  revision co_production.team_brand_revisions%ROWTYPE;
  publication co_production.team_brand_publications%ROWTYPE;
  before_row jsonb;
  after_row jsonb;
BEGIN
  IF p_request_id IS NULL OR NOT co_production_private.identity_has_capability(
    p_team_id, 'brand.manage', 80
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'identity_forbidden';
  END IF;
  SELECT * INTO revision
  FROM co_production.team_brand_revisions
  WHERE id = p_revision_id AND team_id = p_team_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'identity_not_found';
  END IF;

  PERFORM 1 FROM co_production.teams AS team WHERE team.id = p_team_id FOR UPDATE;
  SELECT * INTO publication
  FROM co_production.team_brand_publications AS current_publication
  WHERE current_publication.team_id = p_team_id
    AND current_publication.project_id IS NOT DISTINCT FROM revision.project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_expected_published_version <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
    END IF;
    INSERT INTO co_production.team_brand_publications (
      team_id, project_id, scope, revision_id, published_by
    ) VALUES (
      p_team_id, revision.project_id, revision.scope, revision.id, actor
    )
    ON CONFLICT DO NOTHING
    RETURNING to_jsonb(team_brand_publications) INTO after_row;
    IF after_row IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
    END IF;
  ELSE
    before_row := to_jsonb(publication);
    UPDATE co_production.team_brand_publications AS target
    SET
      revision_id = revision.id,
      authority_version = target.authority_version + 1,
      published_by = actor,
      published_at = now()
    WHERE target.id = publication.id
      AND target.authority_version = p_expected_published_version
    RETURNING to_jsonb(target) INTO after_row;
    IF after_row IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'authority_version_conflict';
    END IF;
  END IF;

  PERFORM co_production_private.append_identity_audit(
    p_team_id,
    actor,
    p_request_id,
    'identity.brand.published',
    'brand_publication',
    after_row ->> 'id',
    before_row,
    after_row
  );
  RETURN after_row || pg_catalog.jsonb_build_object('values', revision.values);
END
$$;

REVOKE ALL ON TABLE
  co_production.identity_profiles,
  co_production.identity_preferences,
  co_production.team_identity_policies,
  co_production.team_feature_flags,
  co_production.team_brand_revisions,
  co_production.team_brand_publications,
  co_production.identity_audit_log
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  co_production.identity_profiles,
  co_production.identity_preferences,
  co_production.team_identity_policies,
  co_production.team_feature_flags,
  co_production.team_brand_revisions,
  co_production.team_brand_publications,
  co_production.identity_audit_log
TO authenticated, service_role;

REVOKE ALL ON FUNCTION co_production_private.identity_actor() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.has_active_surface_identity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.can_seed_owned_team_membership(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.identity_has_capability(uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.append_identity_audit(uuid, uuid, uuid, text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.reject_identity_history_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.enforce_team_member_identity_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.clear_inactive_team_preference() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production_private.has_active_surface_identity() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production_private.can_seed_owned_team_membership(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production_private.identity_has_capability(uuid, text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.ensure_identity_principal() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.get_identity_context(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.update_identity_profile(integer, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.update_identity_preferences(integer, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.update_team_identity_policy(uuid, integer, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.update_team_member_capabilities(uuid, uuid, integer, text[], uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.update_team_feature_flag(uuid, uuid, integer, text, boolean, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.create_team_brand_revision(uuid, uuid, text, integer, text, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.publish_team_brand_revision(uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production.ensure_identity_principal() TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.get_identity_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.update_identity_profile(integer, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.update_identity_preferences(integer, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.update_team_identity_policy(uuid, integer, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.update_team_member_capabilities(uuid, uuid, integer, text[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.update_team_feature_flag(uuid, uuid, integer, text, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.create_team_brand_revision(uuid, uuid, text, integer, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.publish_team_brand_revision(uuid, uuid, integer, uuid) TO authenticated;

REVOKE INSERT ON TABLE co_production.team_members FROM authenticated;
GRANT INSERT (team_id, user_id, role, invited_by)
  ON co_production.team_members TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  co_production.identity_profiles,
  co_production.identity_preferences,
  co_production.team_identity_policies,
  co_production.team_feature_flags,
  co_production.team_brand_revisions,
  co_production.team_brand_publications,
  co_production.identity_audit_log
FROM authenticated, service_role;

COMMIT;
