-- Folder deletion changes child folders, assets, and the folder itself. Keep
-- those writes in one transaction and re-check authority inside the function.

CREATE OR REPLACE FUNCTION public.delete_folder_atomically(
  p_folder_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent_id uuid;
BEGIN
  SELECT folder.parent_id
  INTO v_parent_id
  FROM public.folders AS folder
  JOIN public.projects AS project ON project.id = folder.project_id
  WHERE folder.id = p_folder_id
    AND folder.project_id = p_project_id
    AND project.owner_id = (SELECT auth.uid())
  FOR UPDATE OF folder;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.folders
  SET parent_id = v_parent_id
  WHERE parent_id = p_folder_id
    AND project_id = p_project_id;

  UPDATE public.assets
  SET folder_id = NULL
  WHERE folder_id = p_folder_id
    AND project_id = p_project_id;

  DELETE FROM public.folders
  WHERE id = p_folder_id
    AND project_id = p_project_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_folder_atomically(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_folder_atomically(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION co_production.delete_folder_atomically(
  p_folder_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent_id uuid;
BEGIN
  IF NOT co_production_private.has_project_role(p_project_id, 60) THEN
    RETURN false;
  END IF;

  SELECT folder.parent_id
  INTO v_parent_id
  FROM co_production.folders AS folder
  WHERE folder.id = p_folder_id
    AND folder.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE co_production.folders
  SET parent_id = v_parent_id,
      updated_at = now()
  WHERE parent_id = p_folder_id
    AND project_id = p_project_id;

  UPDATE co_production.assets
  SET folder_id = NULL,
      updated_at = now()
  WHERE folder_id = p_folder_id
    AND project_id = p_project_id;

  DELETE FROM co_production.folders
  WHERE id = p_folder_id
    AND project_id = p_project_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION co_production.delete_folder_atomically(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION co_production.delete_folder_atomically(uuid, uuid) TO authenticated, service_role;
