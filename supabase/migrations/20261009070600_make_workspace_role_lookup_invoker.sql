-- Keep the caller's role lookup under RLS instead of a SECURITY DEFINER RPC.
-- Preserve the existing admin-wide read capability while allowing a user to read only their own active role row.
DROP POLICY IF EXISTS "chatb2k workspace admins admin read" ON public.chatb2k_workspace_admins;
CREATE POLICY "chatb2k workspace admins own or admin read"
ON public.chatb2k_workspace_admins
FOR SELECT
TO authenticated
USING (
  (status = 'active' AND lower(email) = lower(auth.jwt() ->> 'email'))
  OR EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = ANY (ARRAY['super_admin'::text, 'admin'::text])
  )
);

CREATE OR REPLACE FUNCTION public.get_my_workspace_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, auth
AS $function$
  SELECT w.role_code
  FROM public.chatb2k_workspace_admins AS w
  WHERE w.status = 'active'
    AND lower(w.email) = lower(auth.jwt() ->> 'email')
  ORDER BY CASE WHEN w.role_code = 'super_admin' THEN 0 ELSE 1 END,
           w.created_at ASC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_my_workspace_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_workspace_role() TO authenticated;
