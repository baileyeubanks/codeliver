-- Atomic, service-only rate authority for Stripe Checkout session creation.

BEGIN;

CREATE TABLE IF NOT EXISTS co_production.checkout_rate_limits (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, project_id, window_start)
);

ALTER TABLE co_production.checkout_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.checkout_rate_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE co_production.checkout_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE co_production.checkout_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION co_production.reserve_checkout_rate_limit(
  p_actor_id uuid,
  p_project_id uuid,
  p_limit integer DEFAULT 5,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, co_production
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_attempt_count integer;
BEGIN
  IF p_actor_id IS NULL OR p_project_id IS NULL
     OR p_limit < 1 OR p_limit > 100
     OR p_window_seconds < 1 OR p_window_seconds > 3600 THEN
    RAISE EXCEPTION 'invalid checkout rate authority input';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO co_production.checkout_rate_limits (
    actor_id,
    project_id,
    window_start,
    attempt_count,
    updated_at
  )
  VALUES (
    p_actor_id,
    p_project_id,
    v_window_start,
    1,
    v_now
  )
  ON CONFLICT (actor_id, project_id, window_start)
  DO UPDATE
    SET attempt_count = co_production.checkout_rate_limits.attempt_count + 1,
        updated_at = v_now
    WHERE co_production.checkout_rate_limits.attempt_count < p_limit
  RETURNING attempt_count INTO v_attempt_count;

  allowed := v_attempt_count IS NOT NULL;
  retry_after_seconds := greatest(
    1,
    ceil(
      extract(
        epoch FROM (
          v_window_start + make_interval(secs => p_window_seconds) - v_now
        )
      )
    )::integer
  );
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION co_production.reserve_checkout_rate_limit(
  uuid,
  uuid,
  integer,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production.reserve_checkout_rate_limit(
  uuid,
  uuid,
  integer,
  integer
) TO service_role;

COMMIT;
