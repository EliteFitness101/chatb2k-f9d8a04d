-- Explicit 30% supplier-markup funding pool for included reusable VAS.
-- The pool is the actual supplier-to-resale price uplift, capped at 30% of supplier cost.
-- VAS customer price remains zero; this is internal cost allocation only.

create table if not exists public.commerce_vas_funding_ledger (
  id uuid primary key default gen_random_uuid(),
  commerce_offer_id uuid not null unique references public.commerce_offers(id) on delete restrict,
  source_cost_ngn numeric(14,2) not null check (source_cost_ngn >= 0),
  resale_price_ngn numeric(14,2) not null check (resale_price_ngn >= 0),
  actual_markup_ngn numeric(14,2) not null check (actual_markup_ngn >= 0),
  policy_markup_rate_bps integer not null default 3000 check (policy_markup_rate_bps = 3000),
  vas_funding_pool_ngn numeric(14,2) not null default 0 check (vas_funding_pool_ngn >= 0),
  allocated_cost_ngn numeric(14,2) not null default 0 check (allocated_cost_ngn >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'eligible'
    check (status in ('eligible','held','review_required','exhausted')),
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_vas_funding_not_overdrawn check (allocated_cost_ngn <= vas_funding_pool_ngn)
);

create index if not exists commerce_vas_funding_status_idx
  on public.commerce_vas_funding_ledger(status, updated_at desc);

alter table public.commerce_vas_funding_ledger enable row level security;

create or replace function public.sync_commerce_vas_funding_pool()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  supplier_cost numeric(14,2);
  resale_price numeric(14,2);
  uplift numeric(14,2);
  pool numeric(14,2);
begin
  if lower(coalesce(new.currency,'NGN')) <> 'ngn' then
    return new;
  end if;
  begin
    supplier_cost := nullif(new.metadata->>'supplier_price','')::numeric;
  exception when others then
    return new;
  end;
  if supplier_cost is null or supplier_cost <= 0 then
    return new;
  end if;

  resale_price := coalesce(new.price,0);
  uplift := greatest(resale_price - supplier_cost,0);
  pool := least(uplift, round(supplier_cost * 0.30,2));

  insert into public.commerce_vas_funding_ledger (
    commerce_offer_id, source_cost_ngn, resale_price_ngn, actual_markup_ngn,
    policy_markup_rate_bps, vas_funding_pool_ngn, allocated_cost_ngn,
    currency, status, source_snapshot
  ) values (
    new.id, supplier_cost, resale_price, uplift, 3000, pool, 0,
    'NGN', case when pool > 0 then 'eligible' else 'held' end,
    jsonb_build_object(
      'offer_title', new.title,
      'supplier_price', supplier_cost,
      'resale_price', resale_price,
      'policy', 'supplier_cost_plus_30_percent',
      'funding_rule', 'actual_markup_capped_at_30_percent_of_supplier_cost'
    )
  )
  on conflict (commerce_offer_id) do update set
    source_cost_ngn = excluded.source_cost_ngn,
    resale_price_ngn = excluded.resale_price_ngn,
    actual_markup_ngn = excluded.actual_markup_ngn,
    vas_funding_pool_ngn = excluded.vas_funding_pool_ngn,
    status = case
      when public.commerce_vas_funding_ledger.allocated_cost_ngn > excluded.vas_funding_pool_ngn then 'review_required'
      when excluded.vas_funding_pool_ngn <= 0 then 'held'
      when public.commerce_vas_funding_ledger.allocated_cost_ngn >= excluded.vas_funding_pool_ngn then 'exhausted'
      else 'eligible'
    end,
    source_snapshot = excluded.source_snapshot,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_commerce_vas_funding_pool on public.commerce_offers;
create trigger trg_sync_commerce_vas_funding_pool
after insert or update of price, currency, metadata on public.commerce_offers
for each row execute function public.sync_commerce_vas_funding_pool();

-- Reconcile existing supplier offers already carrying supplier-price provenance.
insert into public.commerce_vas_funding_ledger (
  commerce_offer_id, source_cost_ngn, resale_price_ngn, actual_markup_ngn,
  policy_markup_rate_bps, vas_funding_pool_ngn, allocated_cost_ngn,
  currency, status, source_snapshot
)
select
  o.id,
  (o.metadata->>'supplier_price')::numeric,
  o.price,
  greatest(o.price - (o.metadata->>'supplier_price')::numeric,0),
  3000,
  least(greatest(o.price - (o.metadata->>'supplier_price')::numeric,0),
        round((o.metadata->>'supplier_price')::numeric * 0.30,2)),
  0,
  'NGN',
  case when o.price > (o.metadata->>'supplier_price')::numeric then 'eligible' else 'held' end,
  jsonb_build_object('offer_title',o.title,'supplier_price',o.metadata->>'supplier_price',
    'resale_price',o.price,'policy','supplier_cost_plus_30_percent')
from public.commerce_offers o
where o.currency = 'NGN'
  and coalesce(o.metadata->>'supplier_price','') ~ '^[0-9]+(\.[0-9]+)?$'
  and (o.metadata->>'supplier_price')::numeric > 0
on conflict (commerce_offer_id) do nothing;

comment on table public.commerce_vas_funding_ledger is
  'Internal funding pool sourced from the actual 30% supplier markup. VAS customer line-item price remains zero.';
