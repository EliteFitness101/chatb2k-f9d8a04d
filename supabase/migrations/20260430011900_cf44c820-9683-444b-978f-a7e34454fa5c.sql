
-- Hubs table (public read)
CREATE TABLE public.hubs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL, -- 'global_hq' | 'national' | 'international'
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  country_code TEXT NOT NULL,
  lat NUMERIC,
  lng NUMERIC,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hubs_public_read" ON public.hubs FOR SELECT USING (true);

INSERT INTO public.hubs (name, tier, address, city, country_code, sort_order) VALUES
('Global HQ — Melrose Plaza', 'global_hq', 'Top Floor Melrose Plaza, Umudike', 'Abia', 'NG', 1),
('Lekki Peninsula', 'national', 'Lekki Peninsula', 'Lagos', 'NG', 2),
('Lekki Boat Club Resort', 'national', 'Lekki Boat Club Resort', 'Lagos', 'NG', 3),
('Sobaz Plaza', 'national', 'Sobaz Plaza', 'Port Harcourt', 'NG', 4),
('Shell RA Rumukpoku', 'national', 'Shell RA Rumukpoku', 'Port Harcourt', 'NG', 5),
('108 CraneFord', 'international', '108 CraneFord', 'Jersey City', 'US', 6),
('Elite Experience Hub', 'international', 'Ottawa Community Wellness Villa', 'Ottawa', 'CA', 7);

-- Orders (public insert via server, public read by reference for confirmation page)
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  rail TEXT NOT NULL, -- 'shopify' | 'paystack'
  currency TEXT NOT NULL,
  amount_minor BIGINT NOT NULL, -- amount in minor units (kobo / cents)
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'failed'
  customer_email TEXT,
  customer_name TEXT,
  customer_country TEXT,
  assigned_hub_id UUID REFERENCES public.hubs(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
-- Allow public read by reference (used on success page); writes only via service role / server functions.
CREATE POLICY "orders_public_read" ON public.orders FOR SELECT USING (true);

CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_amount_minor BIGINT NOT NULL,
  category TEXT -- 'iron' | 'bench' | 'digital' | 'coaching' | 'bundle'
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_public_read" ON public.order_items FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER orders_touch_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
