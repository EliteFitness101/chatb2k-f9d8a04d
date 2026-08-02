-- currency_routes
CREATE TABLE public.currency_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL UNIQUE,
  currency text NOT NULL,
  rail text NOT NULL,
  crypto_threshold_minor bigint NOT NULL DEFAULT 38000000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.currency_routes TO anon, authenticated;
GRANT ALL ON public.currency_routes TO service_role;
ALTER TABLE public.currency_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY currency_routes_public_read ON public.currency_routes FOR SELECT USING (true);
CREATE TRIGGER currency_routes_touch BEFORE UPDATE ON public.currency_routes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  provider text NOT NULL,
  reference text NOT NULL,
  currency text NOT NULL,
  amount_minor bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, reference)
);
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_admin_read ON public.payments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER payments_touch BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- payment_events (idempotency)
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_key text NOT NULL,
  event_type text NOT NULL,
  reference text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_key)
);
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_events_admin_read ON public.payment_events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- fulfillment_orders
CREATE TABLE public.fulfillment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  hub_id uuid REFERENCES public.hubs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'assigned',
  tracking_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fulfillment_orders TO service_role;
ALTER TABLE public.fulfillment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY fulfillment_orders_admin_read ON public.fulfillment_orders FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER fulfillment_orders_touch BEFORE UPDATE ON public.fulfillment_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- inventory_ledger
CREATE TABLE public.inventory_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
  sku text NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL DEFAULT 'adjustment',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.inventory_ledger TO service_role;
ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_ledger_admin_read ON public.inventory_ledger FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- upsell_events
CREATE TABLE public.upsell_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rsid text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  offer_sku text,
  trigger text NOT NULL DEFAULT 'high_ticket',
  accepted boolean NOT NULL DEFAULT false,
  amount_minor bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.upsell_events TO service_role;
ALTER TABLE public.upsell_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY upsell_events_admin_read ON public.upsell_events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- audit_logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_admin_read ON public.audit_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));