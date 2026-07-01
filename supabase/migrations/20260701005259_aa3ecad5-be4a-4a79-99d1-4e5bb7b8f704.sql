
-- Drop the actual leftover public-read policy (previous DROP used wrong name)
DROP POLICY IF EXISTS site_gallery_public_read ON storage.objects;

-- Convert has_role to SECURITY INVOKER. user_roles is SELECT-granted to
-- authenticated with an RLS policy allowing users to read their own rows,
-- which is exactly what has_role(auth.uid(), ...) needs. Behaviour of every
-- existing policy is preserved.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;
