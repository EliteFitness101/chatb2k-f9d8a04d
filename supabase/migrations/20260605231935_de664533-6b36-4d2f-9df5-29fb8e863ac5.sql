
-- 1. revenue_events
CREATE TABLE public.revenue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  email text,
  rsid text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_sku text,
  variant text,
  source text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_revenue_events_occurred_at ON public.revenue_events (occurred_at DESC);
CREATE INDEX idx_revenue_events_reference ON public.revenue_events (reference);
GRANT SELECT ON public.revenue_events TO authenticated;
GRANT ALL ON public.revenue_events TO service_role;
ALTER TABLE public.revenue_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_events_admin_read ON public.revenue_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. funnel_events
CREATE TABLE public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rsid text,
  event_name text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_funnel_events_occurred_at ON public.funnel_events (occurred_at DESC);
CREATE INDEX idx_funnel_events_name ON public.funnel_events (event_name);
GRANT SELECT ON public.funnel_events TO authenticated;
GRANT INSERT ON public.funnel_events TO anon, authenticated;
GRANT ALL ON public.funnel_events TO service_role;
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY funnel_events_admin_read ON public.funnel_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY funnel_events_public_insert ON public.funnel_events FOR INSERT TO anon, authenticated
  WITH CHECK (event_name IS NOT NULL AND length(event_name) <= 64);

-- 3. Tighten orders / order_items — remove public read
DROP POLICY IF EXISTS orders_public_read ON public.orders;
DROP POLICY IF EXISTS order_items_public_read ON public.order_items;
CREATE POLICY orders_admin_read ON public.orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY order_items_admin_read ON public.order_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Tighten profiles — owner + admin only
DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
CREATE POLICY profiles_self_or_admin_read ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Block client-side xp/points/tier writes on profiles
CREATE OR REPLACE FUNCTION public.protect_profile_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- service_role bypasses RLS but still hits triggers; allow service_role full edit
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.xp IS DISTINCT FROM OLD.xp
     OR NEW.points IS DISTINCT FROM OLD.points
     OR NEW.tier IS DISTINCT FROM OLD.tier THEN
    RAISE EXCEPTION 'xp/points/tier can only be updated server-side';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_profile_gamification_trg ON public.profiles;
CREATE TRIGGER protect_profile_gamification_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_gamification();
