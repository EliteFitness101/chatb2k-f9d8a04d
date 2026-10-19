-- Return only the authenticated user's active workspace role.
-- This replaces client-side CEO email comparisons with a server-authoritative role lookup.
CREATE OR REPLACE FUNCTION public.get_my_workspace_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
  SELECT w.role_code
  FROM auth.users AS u
  JOIN public.chatb2k_workspace_admins AS w
    ON lower(w.email) = lower(u.email)
  WHERE u.id = auth.uid()
    AND w.status = 'active'
  ORDER BY CASE WHEN w.role_code = 'super_admin' THEN 0 ELSE 1 END,
           w.created_at ASC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_my_workspace_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_workspace_role() TO authenticated;
