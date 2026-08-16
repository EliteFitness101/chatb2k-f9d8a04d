-- ResoFit v3.0.1 canonical fulfillment projection
-- Additive migration. Does not modify existing payments/products/revenue tables.
-- The current production schema has no durable order/fulfillment/inventory-hub state,
-- so physical fulfillment needs a canonical projection rather than the retired orders model.

create table if not exists public.resofit_fulfillment_orders (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id),
  payment_reference text,
  customer_id uuid references public.profiles(id),
  customer_email text,
  status text not null default 'pending'
    check (status in ('pending','allocated','picking','packed','ready_for_dispatch','shipped','delivered','completed','exception')),
  hub_code text,
  currency text not null default 'NGN',
  total_amount numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payment_reference)
);

create table if not exists public.resofit_fulfillment_items (
  id uuid primary key default gen_random_uuid(),
  fulfillment_order_id uuid not null references public.resofit_fulfillment_orders(id) on delete cascade,
  product_id uuid references public.products(id),
  sku text not null,
  quantity integer not null check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.resofit_fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  fulfillment_order_id uuid not null references public.resofit_fulfillment_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.resofit_hub_inventory (
  id uuid primary key default gen_random_uuid(),
  hub_code text not null,
  sku text not null,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  unique(hub_code, sku)
);

create index if not exists resofit_fulfillment_status_idx on public.resofit_fulfillment_orders(status, updated_at desc);
create index if not exists resofit_fulfillment_payment_idx on public.resofit_fulfillment_orders(payment_id);
create index if not exists resofit_fulfillment_items_sku_idx on public.resofit_fulfillment_items(sku);
create index if not exists resofit_fulfillment_events_order_idx on public.resofit_fulfillment_events(fulfillment_order_id, created_at desc);
create index if not exists resofit_hub_inventory_sku_idx on public.resofit_hub_inventory(sku, hub_code);

alter table public.resofit_fulfillment_orders enable row level security;
alter table public.resofit_fulfillment_items enable row level security;
alter table public.resofit_fulfillment_events enable row level security;
alter table public.resofit_hub_inventory enable row level security;

-- Backend/service-role writes. Customer visibility is deliberately not granted here;
-- fulfillment APIs should expose only the minimum order projection required by the user.
create policy "service role manages fulfillment orders"
  on public.resofit_fulfillment_orders for all to service_role using (true) with check (true);
create policy "service role manages fulfillment items"
  on public.resofit_fulfillment_items for all to service_role using (true) with check (true);
create policy "service role manages fulfillment events"
  on public.resofit_fulfillment_events for all to service_role using (true) with check (true);
create policy "service role manages hub inventory"
  on public.resofit_hub_inventory for all to service_role using (true) with check (true);

-- Immutable transition history: clients and admins cannot mutate/delete event history.
revoke update, delete on public.resofit_fulfillment_events from authenticated, anon;
