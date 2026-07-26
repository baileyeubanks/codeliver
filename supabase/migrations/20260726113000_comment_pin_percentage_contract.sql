-- Align persisted review pins with the 0-100 percentage coordinates produced
-- and rendered by both review cockpits. The prior schema allowed only 0-1,
-- whose meaning is ambiguous once the application percentage contract is
-- authoritative. Refuse to reinterpret any existing pin without an explicit,
-- separately reviewed data-remediation decision.

BEGIN;

LOCK TABLE co_production.comments IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM co_production.comments
    WHERE pin_x IS NOT NULL OR pin_y IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'legacy comment pins require explicit coordinate remediation before the 0-100 percentage contract can be applied'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

ALTER TABLE co_production.comments
  DROP CONSTRAINT IF EXISTS comments_pin_x_check,
  DROP CONSTRAINT IF EXISTS comments_pin_y_check,
  DROP CONSTRAINT IF EXISTS comments_pin_pair_check;

ALTER TABLE co_production.comments
  ADD CONSTRAINT comments_pin_x_check
    CHECK (pin_x IS NULL OR (pin_x >= 0 AND pin_x <= 100)),
  ADD CONSTRAINT comments_pin_y_check
    CHECK (pin_y IS NULL OR (pin_y >= 0 AND pin_y <= 100)),
  ADD CONSTRAINT comments_pin_pair_check
    CHECK ((pin_x IS NULL) = (pin_y IS NULL)) NOT VALID;

ALTER TABLE co_production.comments
  VALIDATE CONSTRAINT comments_pin_pair_check;

COMMENT ON COLUMN co_production.comments.pin_x IS
  'Horizontal frame coordinate as a percentage from 0 through 100.';
COMMENT ON COLUMN co_production.comments.pin_y IS
  'Vertical frame coordinate as a percentage from 0 through 100.';

COMMIT;
