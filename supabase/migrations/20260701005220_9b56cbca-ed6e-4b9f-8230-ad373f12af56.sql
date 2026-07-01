
-- 1) Prevent xp/points/tier self-updates via RLS WITH CHECK (defense-in-depth alongside existing trigger)
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND xp    = (SELECT p.xp    FROM public.profiles p WHERE p.id = auth.uid())
    AND points= (SELECT p.points FROM public.profiles p WHERE p.id = auth.uid())
    AND tier  = (SELECT p.tier  FROM public.profiles p WHERE p.id = auth.uid())
  );

-- 2) Cap funnel_events props payload size to prevent spam bloat
ALTER TABLE public.funnel_events
  DROP CONSTRAINT IF EXISTS funnel_events_props_size_chk;
ALTER TABLE public.funnel_events
  ADD CONSTRAINT funnel_events_props_size_chk
  CHECK (octet_length(coalesce(props::text, '')) <= 4096);

ALTER TABLE public.funnel_events
  DROP CONSTRAINT IF EXISTS funnel_events_event_name_len_chk;
ALTER TABLE public.funnel_events
  ADD CONSTRAINT funnel_events_event_name_len_chk
  CHECK (char_length(event_name) BETWEEN 1 AND 64);

-- 3) Remove permissive public listing on site-gallery bucket. Public URLs
--    (getPublicUrl) continue to work; only the .list()/.download() APIs
--    become admin-only.
DROP POLICY IF EXISTS "site-gallery public read" ON storage.objects;
CREATE POLICY "site-gallery admin list"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'site-gallery' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) Lock down SECURITY DEFINER trigger helper so signed-in users cannot RPC it
REVOKE EXECUTE ON FUNCTION public.protect_profile_gamification() FROM PUBLIC, anon, authenticated;
