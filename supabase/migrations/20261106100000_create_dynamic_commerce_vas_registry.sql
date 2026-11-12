-- Dynamic, contextual VAS offer and post-payment generation registry.
-- Additive only: existing products, payments, physical fulfillment and delivery jobs remain authoritative.
create table if not exists public.commerce_vas_offers (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid null references public.commerce_intents(id) on delete set null,
  source_commerce_offer_id uuid null references public.commerce_offers(id) on delete set null,
  session_id text null,
  user_id uuid null references public.profiles(id) on delete set null,
  product_context jsonb not null default '{}'::jsonb,
  customer_context jsonb not null default '{}'::jsonb,
  vas_spec jsonb not null,
  recommendation_reason text not null,
  provider text not null check (provider in ('gemini','openai','rules_fallback')),
  model text null,
  price numeric(14,2) not null default 0 check (price = 0),
  currency text not null default 'NGN',
  pricing_rule_version text not null,
  status text not null default 'offered'
    check (status in ('offered','selected','expired','superseded','cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commerce_vas_offers_session_idx
  on public.commerce_vas_offers(session_id, created_at desc);
create index if not exists commerce_vas_offers_user_idx
  on public.commerce_vas_offers(user_id, created_at desc);
create index if not exists commerce_vas_offers_expiry_idx
  on public.commerce_vas_offers(expires_at) where status = 'offered';

create table if not exists public.commerce_vas_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  vas_offer_id uuid not null references public.commerce_vas_offers(id) on delete restrict,
  payment_reference text not null,
  idempotency_key text not null unique,
  order_snapshot jsonb not null,
  payment_verified_at timestamptz null,
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','queued','processing','completed','failed','held')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz null,
  output_assets jsonb not null default '[]'::jsonb,
  output_checksum text null,
  last_error_code text null,
  last_error_detail text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint commerce_vas_generation_payment_offer_uq unique(payment_id, vas_offer_id)
);

create index if not exists commerce_vas_jobs_queue_idx
  on public.commerce_vas_generation_jobs(status, next_attempt_at, created_at);
create index if not exists commerce_vas_jobs_payment_idx
  on public.commerce_vas_generation_jobs(payment_id, payment_reference);

alter table public.commerce_vas_offers enable row level security;
alter table public.commerce_vas_generation_jobs enable row level security;

comment on table public.commerce_vas_offers is
  'Ephemeral, intent-aware AI-recommended value-added service offers. Not canonical product SKUs.';
comment on table public.commerce_vas_generation_jobs is
  'Idempotent post-payment VAS generation queue. Jobs must remain awaiting_payment until verified payment reconciliation.';
comment on column public.commerce_vas_generation_jobs.order_snapshot is
  'Immutable checkout-time snapshot of selected VAS specification, price, currency, provider/model and related product context.';
