-- The stable lookup cannot see a newly inserted row during INSERT RETURNING.
-- Direct ownership preserves the same intended access and permits the return.
ALTER POLICY projects_select ON co_production.projects
USING (owner_id = (SELECT auth.uid()) OR co_production_private.has_project_role(id, 10));
