-- ============ CONFIG: payment providers ============
CREATE TABLE public.payment_providers (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  live boolean NOT NULL DEFAULT false,
  supported_currencies text[] NOT NULL DEFAULT '{}',
  webhook_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_providers TO anon, authenticated;
GRANT ALL ON public.payment_providers TO service_role;
ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers readable" ON public.payment_providers FOR SELECT USING (true);

INSERT INTO public.payment_providers (code, display_name, enabled, live, supported_currencies, webhook_path, sort_order) VALUES
  ('paystack','Paystack', true, true, ARRAY['NGN'], '/api/public/webhooks/paystack', 10),
  ('shopify','Shopify', true, true, ARRAY['USD','GBP','EUR','CAD'], NULL, 20),
  ('flutterwave','Flutterwave', false, false, ARRAY['NGN','USD','GBP','EUR'], '/api/public/webhooks/flutterwave', 30),
  ('palmpay','PalmPay', false, false, ARRAY['NGN'], '/api/public/webhooks/palmpay', 40),
  ('crypto','Crypto (USDT/BTC)', true, false, ARRAY['USDT','BTC'], '/api/public/webhooks/crypto', 50),
  ('selar','Selar', true, true, ARRAY['NGN'], NULL, 60);

-- ============ CONFIG: currency routes extension ============
ALTER TABLE public.currency_routes
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS hub_tier text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

UPDATE public.currency_routes SET provider = rail;
UPDATE public.currency_routes SET region = 'africa', hub_tier = 'global_hq' WHERE country_code = 'NG';
UPDATE public.currency_routes SET region = 'north_america', hub_tier = 'international' WHERE country_code IN ('US','CA');
UPDATE public.currency_routes SET region = 'uk', hub_tier = 'international' WHERE country_code = 'GB';
UPDATE public.currency_routes SET region = 'eu', hub_tier = 'international' WHERE region IS NULL;
UPDATE public.currency_routes SET currency = 'CAD' WHERE country_code = 'CA';

INSERT INTO public.currency_routes (country_code, currency, rail, provider, region, hub_tier, crypto_threshold_minor, is_default)
VALUES ('*','USD','shopify','shopify','rest_of_world','global_hq', 38000000, true)
ON CONFLICT DO NOTHING;

-- ============ CHATB2K: assessments ============
CREATE TABLE public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  rsid text,
  email text,
  status text NOT NULL DEFAULT 'started',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessments_user_idx ON public.assessments(user_id);
CREATE INDEX assessments_session_idx ON public.assessments(session_id);
GRANT SELECT, INSERT, UPDATE ON public.assessments TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.assessments TO anon;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own assessments read" ON public.assessments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coach'));
CREATE POLICY "own assessments insert" ON public.assessments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "own assessments update" ON public.assessments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "guest assessment insert" ON public.assessments FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND session_id IS NOT NULL);

CREATE TABLE public.assessment_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  answer_value text NOT NULL,
  answer_meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, question_key)
);
GRANT SELECT, INSERT, UPDATE ON public.assessment_answers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.assessment_answers TO anon;
GRANT ALL ON public.assessment_answers TO service_role;
ALTER TABLE public.assessment_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "answers via owner" ON public.assessment_answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id
    AND (a.user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coach'))));

CREATE TABLE public.health_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_id uuid REFERENCES public.assessments(id) ON DELETE SET NULL,
  primary_goal text,
  experience_level text,
  equipment_access text,
  nutrition_preference text,
  time_availability text,
  budget_band text,
  mobility_notes text,
  weight_kg numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX health_profiles_user_idx ON public.health_profiles(user_id);
GRANT SELECT, INSERT, UPDATE ON public.health_profiles TO authenticated;
GRANT ALL ON public.health_profiles TO service_role;
ALTER TABLE public.health_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own health profile" ON public.health_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coach'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.recommendation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  primary_program_sku text,
  equipment_skus text[] NOT NULL DEFAULT '{}',
  membership_sku text,
  nutrition_sku text,
  upsell_score numeric NOT NULL DEFAULT 0,
  confidence_score numeric NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL DEFAULT '{}',
  engine_version text NOT NULL DEFAULT 'v3.0',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recommendation_assessment_idx ON public.recommendation_results(assessment_id);
GRANT SELECT, INSERT ON public.recommendation_results TO authenticated;
GRANT SELECT ON public.recommendation_results TO anon;
GRANT ALL ON public.recommendation_results TO service_role;
ALTER TABLE public.recommendation_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recommendations" ON public.recommendation_results FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coach'));

-- ============ INVENTORY ============
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
  sku text NOT NULL,
  on_hand integer NOT NULL DEFAULT 0,
  reserved integer NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_id, sku)
);
GRANT SELECT ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read inventory" ON public.inventory_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coach'));

INSERT INTO public.inventory_items (hub_id, sku, on_hand)
SELECT h.id, s.sku, CASE WHEN h.tier = 'global_hq' THEN 24 WHEN h.tier = 'national' THEN 10 ELSE 6 END
FROM public.hubs h
CROSS JOIN (VALUES ('RES-IRON-15'),('RES-IRON-30'),('RES-IRON-50'),('RES-BENCH-01'),('RES-BUNDLE-APEX')) AS s(sku)
ON CONFLICT DO NOTHING;

-- ============ FULFILLMENT EVENTS ============
CREATE TABLE public.fulfillment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_order_id uuid NOT NULL REFERENCES public.fulfillment_orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fulfillment_events_order_idx ON public.fulfillment_events(fulfillment_order_id);
GRANT SELECT ON public.fulfillment_events TO authenticated;
GRANT ALL ON public.fulfillment_events TO service_role;
ALTER TABLE public.fulfillment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read fulfillment events" ON public.fulfillment_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'coach'));

-- ============ DOMAIN EVENTS ============
CREATE TABLE public.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate text NOT NULL,
  aggregate_id text,
  payload jsonb NOT NULL DEFAULT '{}',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX domain_events_type_idx ON public.domain_events(event_type, created_at DESC);
GRANT SELECT ON public.domain_events TO authenticated;
GRANT ALL ON public.domain_events TO service_role;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read domain events" ON public.domain_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- touch triggers
CREATE TRIGGER touch_assessments BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_health_profiles BEFORE UPDATE ON public.health_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_inventory_items BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_payment_providers BEFORE UPDATE ON public.payment_providers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();