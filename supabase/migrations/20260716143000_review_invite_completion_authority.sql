-- Preserve a reviewer finishing a review as a durable, version-bound signal.
-- This record deliberately does not mutate workflow decisions or asset status.

BEGIN;

CREATE TABLE IF NOT EXISTS public.review_invite_completions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  review_invite_id uuid NOT NULL REFERENCES public.review_invites(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  reviewer_name text NOT NULL CHECK (length(btrim(reviewer_name)) BETWEEN 1 AND 120),
  reviewer_email text NOT NULL CHECK (length(btrim(reviewer_email)) BETWEEN 3 AND 320),
  note text CHECK (note IS NULL OR length(note) <= 2000),
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_invite_completions_one_per_invite UNIQUE (review_invite_id),
  CONSTRAINT review_invite_completions_version_asset_fk
    FOREIGN KEY (version_id, asset_id)
    REFERENCES public.versions(id, asset_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS review_invite_completions_asset_version_idx
  ON public.review_invite_completions(asset_id, version_id, completed_at DESC);

ALTER TABLE public.review_invite_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.review_invite_completions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.review_invite_completions TO service_role;

CREATE OR REPLACE FUNCTION public.complete_review_invite(
  p_review_invite_id uuid,
  p_asset_id uuid,
  p_version_id uuid,
  p_reviewer_name text,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  review_invite_id uuid,
  asset_id uuid,
  version_id uuid,
  reviewer_name text,
  reviewer_email text,
  note text,
  completed_at timestamptz,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $complete_review_invite$
DECLARE
  v_invite_id uuid;
  v_invite_asset_id uuid;
  v_invite_version_id uuid;
  v_permissions text;
  v_invite_email text;
  v_expires_at timestamptz;
  v_project_id uuid;
  v_reviewer_name text := pg_catalog.btrim(coalesce(p_reviewer_name, ''));
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_completion public.review_invite_completions%ROWTYPE;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Review completion requires the server authority.';
  END IF;

  IF length(v_reviewer_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Reviewer name must contain between 1 and 120 characters.';
  END IF;

  IF v_note IS NOT NULL AND length(v_note) > 2000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Completion note must contain 2000 characters or fewer.';
  END IF;

  SELECT
    review_invite.id,
    review_invite.asset_id,
    review_invite.version_id,
    review_invite.permissions,
    review_invite.reviewer_email,
    review_invite.expires_at,
    asset.project_id
  INTO
    v_invite_id,
    v_invite_asset_id,
    v_invite_version_id,
    v_permissions,
    v_invite_email,
    v_expires_at,
    v_project_id
  FROM public.review_invites AS review_invite
  JOIN public.assets AS asset
    ON asset.id = review_invite.asset_id
  WHERE review_invite.id = p_review_invite_id
  FOR UPDATE OF review_invite;

  IF NOT FOUND
    OR v_invite_asset_id IS DISTINCT FROM p_asset_id
    OR v_invite_version_id IS DISTINCT FROM p_version_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Review completion does not match this review link.';
  END IF;

  IF v_permissions NOT IN ('comment', 'approve')
    OR nullif(pg_catalog.btrim(coalesce(v_invite_email, '')), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'This review link cannot mark a review complete.';
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at <= now() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'This review link has expired.';
  END IF;

  PERFORM 1
  FROM public.versions AS version
  WHERE version.id = p_version_id
    AND version.asset_id = p_asset_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Review completion version does not belong to this asset.';
  END IF;

  INSERT INTO public.review_invite_completions (
    review_invite_id,
    asset_id,
    version_id,
    reviewer_name,
    reviewer_email,
    note
  )
  VALUES (
    p_review_invite_id,
    p_asset_id,
    p_version_id,
    v_reviewer_name,
    pg_catalog.btrim(v_invite_email),
    v_note
  )
  ON CONFLICT (review_invite_id) DO NOTHING
  RETURNING * INTO v_completion;

  IF FOUND THEN
    INSERT INTO public.activity_log (
      project_id,
      asset_id,
      actor_id,
      actor_name,
      action,
      details
    )
    VALUES (
      v_project_id,
      p_asset_id,
      NULL,
      v_reviewer_name,
      'review_completed',
      pg_catalog.jsonb_build_object(
        'version_id', p_version_id,
        'review_invite_id', p_review_invite_id,
        'completion_id', v_completion.id
      )
    );

    RETURN QUERY
    SELECT
      v_completion.id,
      v_completion.review_invite_id,
      v_completion.asset_id,
      v_completion.version_id,
      v_completion.reviewer_name,
      v_completion.reviewer_email,
      v_completion.note,
      v_completion.completed_at,
      true;
    RETURN;
  END IF;

  SELECT *
  INTO v_completion
  FROM public.review_invite_completions AS completion
  WHERE completion.review_invite_id = p_review_invite_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_completion.asset_id IS DISTINCT FROM p_asset_id
    OR v_completion.version_id IS DISTINCT FROM p_version_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Review completion has conflicting immutable scope.';
  END IF;

  RETURN QUERY
  SELECT
    v_completion.id,
    v_completion.review_invite_id,
    v_completion.asset_id,
    v_completion.version_id,
    v_completion.reviewer_name,
    v_completion.reviewer_email,
    v_completion.note,
    v_completion.completed_at,
    false;
END
$complete_review_invite$;

REVOKE ALL ON FUNCTION public.complete_review_invite(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_review_invite(uuid, uuid, uuid, text, text)
  TO service_role;

CREATE TABLE IF NOT EXISTS co_production.review_invite_completions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  review_invite_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  version_id uuid NOT NULL,
  reviewer_name text NOT NULL CHECK (length(btrim(reviewer_name)) BETWEEN 1 AND 120),
  reviewer_email text NOT NULL CHECK (length(btrim(reviewer_email)) BETWEEN 3 AND 320),
  note text CHECK (note IS NULL OR length(note) <= 2000),
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT co_production_review_invite_completions_one_per_invite
    UNIQUE (review_invite_id),
  CONSTRAINT co_production_review_invite_completion_invite_asset_fk
    FOREIGN KEY (review_invite_id, asset_id)
    REFERENCES co_production.review_invites(id, asset_id)
    ON DELETE RESTRICT,
  CONSTRAINT co_production_review_invite_completion_version_asset_fk
    FOREIGN KEY (version_id, asset_id)
    REFERENCES co_production.versions(id, asset_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS co_production_review_invite_completions_asset_version_idx
  ON co_production.review_invite_completions(asset_id, version_id, completed_at DESC);

ALTER TABLE co_production.review_invite_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE co_production.review_invite_completions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE co_production.review_invite_completions TO service_role;

CREATE OR REPLACE FUNCTION co_production.complete_review_invite(
  p_review_invite_id uuid,
  p_asset_id uuid,
  p_version_id uuid,
  p_reviewer_name text,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  review_invite_id uuid,
  asset_id uuid,
  version_id uuid,
  reviewer_name text,
  reviewer_email text,
  note text,
  completed_at timestamptz,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $complete_review_invite$
DECLARE
  v_invite_id uuid;
  v_invite_asset_id uuid;
  v_invite_version_id uuid;
  v_permissions text;
  v_invite_email text;
  v_expires_at timestamptz;
  v_active boolean;
  v_project_id uuid;
  v_reviewer_name text := pg_catalog.btrim(coalesce(p_reviewer_name, ''));
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_completion co_production.review_invite_completions%ROWTYPE;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Review completion requires the server authority.';
  END IF;

  IF length(v_reviewer_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Reviewer name must contain between 1 and 120 characters.';
  END IF;

  IF v_note IS NOT NULL AND length(v_note) > 2000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Completion note must contain 2000 characters or fewer.';
  END IF;

  SELECT
    review_invite.id,
    review_invite.asset_id,
    review_invite.version_id,
    review_invite.permissions,
    review_invite.reviewer_email,
    review_invite.expires_at,
    review_invite.active,
    asset.project_id
  INTO
    v_invite_id,
    v_invite_asset_id,
    v_invite_version_id,
    v_permissions,
    v_invite_email,
    v_expires_at,
    v_active,
    v_project_id
  FROM co_production.review_invites AS review_invite
  JOIN co_production.assets AS asset
    ON asset.id = review_invite.asset_id
  WHERE review_invite.id = p_review_invite_id
  FOR UPDATE OF review_invite;

  IF NOT FOUND
    OR v_invite_asset_id IS DISTINCT FROM p_asset_id
    OR v_invite_version_id IS DISTINCT FROM p_version_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Review completion does not match this review link.';
  END IF;

  IF v_active IS NOT TRUE
    OR v_permissions NOT IN ('comment', 'approve')
    OR nullif(pg_catalog.btrim(coalesce(v_invite_email, '')), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'This review link cannot mark a review complete.';
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at <= now() THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'This review link has expired.';
  END IF;

  INSERT INTO co_production.review_invite_completions (
    review_invite_id,
    asset_id,
    version_id,
    reviewer_name,
    reviewer_email,
    note
  )
  VALUES (
    p_review_invite_id,
    p_asset_id,
    p_version_id,
    v_reviewer_name,
    pg_catalog.btrim(v_invite_email),
    v_note
  )
  ON CONFLICT (review_invite_id) DO NOTHING
  RETURNING * INTO v_completion;

  IF FOUND THEN
    INSERT INTO co_production.activity_log (
      project_id,
      asset_id,
      actor_id,
      actor_name,
      action,
      details
    )
    VALUES (
      v_project_id,
      p_asset_id,
      NULL,
      v_reviewer_name,
      'review_completed',
      pg_catalog.jsonb_build_object(
        'version_id', p_version_id,
        'review_invite_id', p_review_invite_id,
        'completion_id', v_completion.id
      )
    );

    RETURN QUERY
    SELECT
      v_completion.id,
      v_completion.review_invite_id,
      v_completion.asset_id,
      v_completion.version_id,
      v_completion.reviewer_name,
      v_completion.reviewer_email,
      v_completion.note,
      v_completion.completed_at,
      true;
    RETURN;
  END IF;

  SELECT *
  INTO v_completion
  FROM co_production.review_invite_completions AS completion
  WHERE completion.review_invite_id = p_review_invite_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_completion.asset_id IS DISTINCT FROM p_asset_id
    OR v_completion.version_id IS DISTINCT FROM p_version_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Review completion has conflicting immutable scope.';
  END IF;

  RETURN QUERY
  SELECT
    v_completion.id,
    v_completion.review_invite_id,
    v_completion.asset_id,
    v_completion.version_id,
    v_completion.reviewer_name,
    v_completion.reviewer_email,
    v_completion.note,
    v_completion.completed_at,
    false;
END
$complete_review_invite$;

REVOKE ALL ON FUNCTION co_production.complete_review_invite(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production.complete_review_invite(uuid, uuid, uuid, text, text)
  TO service_role;

COMMIT;
