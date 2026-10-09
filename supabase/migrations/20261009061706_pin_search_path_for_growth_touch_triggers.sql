-- These trigger functions only use built-in now() and NEW; pin their search_path.
ALTER FUNCTION public.touch_creative_growth_run() SET search_path = pg_catalog;
ALTER FUNCTION public.touch_ecosystem_growth_milestone() SET search_path = pg_catalog;
