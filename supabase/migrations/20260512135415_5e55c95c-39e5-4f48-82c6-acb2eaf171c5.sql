
-- Lock down has_role() execution
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Replace permissive INSERT with validated check
DROP POLICY IF EXISTS "candy_leads_anyone_insert" ON public.candy_leads;
CREATE POLICY "candy_leads_validated_insert" ON public.candy_leads
  FOR INSERT
  WITH CHECK (
    weight_kg >= 30 AND weight_kg <= 300
    AND goal IN ('cut','recomp','bulk','performance')
    AND activity IN ('sedentary','light','moderate','elite')
    AND (email IS NULL OR length(email) BETWEEN 3 AND 320)
    AND (phone IS NULL OR length(phone) BETWEEN 4 AND 32)
    AND (user_id IS NULL OR user_id = auth.uid())
  );
