-- Each removed SELECT policy was fully covered by an existing broader ALL or SELECT policy with equal or broader predicate.
DROP POLICY IF EXISTS chatb2k_node_admin_read ON public.chatb2k_orchestration_nodes;
DROP POLICY IF EXISTS "admins read recruiters" ON public.recruiters;
DROP POLICY IF EXISTS "admins read verification consents" ON public.verification_consents;
DROP POLICY IF EXISTS "admins read verification events" ON public.verification_events;
