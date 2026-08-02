-- Review comments are one root note with direct replies. A reply inherits the
-- root moment and cannot become a second pin or carry its own resolution state.

BEGIN;

LOCK TABLE public.comments IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE co_production.comments IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.enforce_review_comment_thread_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $public_review_comment_thread_integrity$
DECLARE
  parent_comment public.comments%ROWTYPE;
BEGIN
  IF (NEW.pin_x IS NULL) <> (NEW.pin_y IS NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Review pins require both pin_x and pin_y coordinates.';
  END IF;

  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT parent.*
  INTO parent_comment
  FROM public.comments AS parent
  WHERE parent.id = NEW.parent_id
    AND parent.asset_id = NEW.asset_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Reply parent comment was not found for this asset.';
  END IF;

  IF parent_comment.parent_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Replies must target an original review comment.';
  END IF;

  IF NEW.version_id IS DISTINCT FROM parent_comment.version_id
    OR NEW.visibility IS DISTINCT FROM parent_comment.visibility
    OR NEW.review_invite_id IS DISTINCT FROM parent_comment.review_invite_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Replies must preserve the root comment version and audience.';
  END IF;

  IF NEW.pin_x IS NOT NULL
    OR NEW.pin_y IS NOT NULL
    OR NEW.timecode_seconds IS DISTINCT FROM parent_comment.timecode_seconds
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Replies inherit the root moment and cannot create another frame pin.';
  END IF;

  IF NEW.status <> 'open'
    OR NEW.resolved_by IS NOT NULL
    OR NEW.resolved_at IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Only original comments can carry thread resolution state.';
  END IF;

  RETURN NEW;
END
$public_review_comment_thread_integrity$;

REVOKE ALL ON FUNCTION public.enforce_review_comment_thread_integrity()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_review_comment_thread_integrity()
  TO service_role;

DROP TRIGGER IF EXISTS comments_review_thread_integrity
  ON public.comments;
CREATE TRIGGER comments_review_thread_integrity
  BEFORE INSERT OR UPDATE OF parent_id, asset_id, version_id, review_invite_id, visibility,
    timecode_seconds, pin_x, pin_y, status, resolved_by, resolved_at
  ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_review_comment_thread_integrity();

CREATE OR REPLACE FUNCTION co_production_private.enforce_review_comment_thread_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $co_production_review_comment_thread_integrity$
DECLARE
  parent_comment co_production.comments%ROWTYPE;
BEGIN
  IF (NEW.pin_x IS NULL) <> (NEW.pin_y IS NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Review pins require both pin_x and pin_y coordinates.';
  END IF;

  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT parent.*
  INTO parent_comment
  FROM co_production.comments AS parent
  WHERE parent.id = NEW.parent_id
    AND parent.asset_id = NEW.asset_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Reply parent comment was not found for this asset.';
  END IF;

  IF parent_comment.parent_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Replies must target an original review comment.';
  END IF;

  IF NEW.version_id IS DISTINCT FROM parent_comment.version_id
    OR NEW.visibility IS DISTINCT FROM parent_comment.visibility
    OR NEW.review_invite_id IS DISTINCT FROM parent_comment.review_invite_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Replies must preserve the root comment version and audience.';
  END IF;

  IF NEW.pin_x IS NOT NULL
    OR NEW.pin_y IS NOT NULL
    OR NEW.timecode_seconds IS DISTINCT FROM parent_comment.timecode_seconds
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Replies inherit the root moment and cannot create another frame pin.';
  END IF;

  IF NEW.status <> 'open'
    OR NEW.resolved_by IS NOT NULL
    OR NEW.resolved_at IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Only original comments can carry thread resolution state.';
  END IF;

  RETURN NEW;
END
$co_production_review_comment_thread_integrity$;

REVOKE ALL ON FUNCTION co_production_private.enforce_review_comment_thread_integrity()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production_private.enforce_review_comment_thread_integrity()
  TO service_role;

DROP TRIGGER IF EXISTS comments_review_thread_integrity
  ON co_production.comments;
CREATE TRIGGER comments_review_thread_integrity
  BEFORE INSERT OR UPDATE OF parent_id, asset_id, version_id, review_invite_id, visibility,
    timecode_seconds, pin_x, pin_y, status, resolved_by, resolved_at
  ON co_production.comments
  FOR EACH ROW
  EXECUTE FUNCTION co_production_private.enforce_review_comment_thread_integrity();

COMMIT;
