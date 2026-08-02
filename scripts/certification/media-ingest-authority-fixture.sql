\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE SCHEMA co_production;
CREATE SCHEMA co_production_private;

CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA auth, co_production TO anon, authenticated, service_role;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY
);

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    nullif(
      pg_catalog.current_setting('request.jwt.claims', true),
      ''
    )::jsonb,
    '{}'::jsonb
  )
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT nullif(
    coalesce(
      nullif(
        pg_catalog.current_setting('request.jwt.claim.sub', true),
        ''
      ),
      (SELECT auth.jwt()) ->> 'sub'
    ),
    ''
  )::uuid
$$;

CREATE TABLE co_production.projects (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  team_id uuid
);

CREATE TABLE co_production.folders (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL
    REFERENCES co_production.projects(id) ON DELETE RESTRICT,
  UNIQUE (id, project_id)
);

CREATE OR REPLACE FUNCTION co_production_private.has_project_role(
  p_project_id uuid,
  p_required_rank integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_required_rank BETWEEN 0 AND 100
    AND EXISTS (
      SELECT 1
      FROM co_production.projects AS project
      WHERE project.id = p_project_id
        AND project.owner_id = (SELECT auth.uid())
    )
$$;

INSERT INTO auth.users (id)
VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('12121212-1212-4121-8121-121212121212');

INSERT INTO co_production.projects (id, owner_id, team_id)
VALUES
  (
    '33333333-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  ),
  (
    '34343434-3434-4343-8343-343434343434',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  );

INSERT INTO co_production.folders (id, project_id)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333'
);
