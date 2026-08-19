-- ResoFit v3.0.1 canonical fulfillment projection
-- Additive migration. Does not modify existing payments/products/revenue tables.

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

create policy "service role manages fulfillment orders"
  on public.resofit_fulfillment_orders for all to service_role using (true) with check (true);
create policy "service role manages fulfillment items"
  on public.resofit_fulfillment_items for all to service_role using (true) with check (true);
create policy "service role manages fulfillment events"
  on public.resofit_fulfillment_events for all to service_role using (true) with check (true);
create policy "service role manages hub inventory"
  on public.resofit_hub_inventory for all to service_role using (true) with check (true);

-- Atomic reservation prevents negative available inventory under concurrent payments.
create or replace function public.reserve_resofit_hub_inventory(
  p_hub_code text,
  p_sku text,
  p_quantity integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  update public.resofit_hub_inventory
     set reserved = reserved + p_quantity,
         updated_at = now()
   where hub_code = p_hub_code
     and sku = p_sku
     and on_hand - reserved >= p_quantity;

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke execute on function public.reserve_resofit_hub_inventory(text,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_resofit_hub_inventory(text,text,integer) to service_role;

revoke update, delete on public.resofit_fulfillment_events from authenticated, anon;
