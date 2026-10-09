-- Remove policies proven redundant by exact predicate comparison or broader existing policy.
-- Writes to public.products remain denied because no permissive INSERT/UPDATE/DELETE policy exists.
DROP POLICY IF EXISTS "admins read candidate verifications" ON public.candidate_verifications;
DROP POLICY IF EXISTS "admins read interviews" ON public.interviews;
DROP POLICY IF EXISTS elite_host_published_training_select ON public.elite_host_training_episodes;
DROP POLICY IF EXISTS chatb2k_agent_admin_read ON public.chatb2k_agent_registry;
DROP POLICY IF EXISTS "Deny Direct Frontend Writes" ON public.products;
