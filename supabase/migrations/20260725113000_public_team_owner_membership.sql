-- Team creation must atomically establish the owner membership used by RLS.
-- co_production already has the equivalent trigger; add it to public for
-- legacy-schema parity.

CREATE OR REPLACE FUNCTION public.seed_team_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.team_members (team_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.owner_id, 'owner', NEW.owner_id)
  ON CONFLICT (team_id, user_id) DO UPDATE SET role = 'owner';
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.seed_team_owner_membership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS teams_seed_owner_membership ON public.teams;
CREATE TRIGGER teams_seed_owner_membership
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.seed_team_owner_membership();
