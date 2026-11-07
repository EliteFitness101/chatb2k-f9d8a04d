-- ChatB2K101 governed customer identity links and delivery outbox.
-- Target: canonical resonance-fitness project (vbqjvmnhdtdhmeeudqnn).
-- Additive only: does not rewrite existing customers, products, jobs, entitlements or events.
-- DO NOT apply to the Edge Node project.

create table if not exists public.resofit_ecosystem_identity_links (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in (
    'meta_whatsapp', 'telegram', 'twilio', 'resend', 'shopify', 'paystack'
  )),
  provider_subject_hash text not null
    check (provider_subject_hash ~ '^[0-9a-f]{64}$'),
  provider_subject_hint text,
  link_status text not null default 'pending'
    check (link_status in ('pending', 'verified', 'revoked')),
  source_event_id uuid references public.resofit_events(id) on delete set null,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resofit_identity_links_provider_subject_key
    unique (provider, provider_subject_hash),
  constraint resofit_identity_links_id_user_key
    unique (id, auth_user_id),
  constraint resofit_identity_links_verified_at_check
    check ((link_status = 'verified' and verified_at is not null)
        or (link_status <> 'verified'))
);

comment on table public.resofit_ecosystem_identity_links is
  'ChatB2K101 provider identity aliases. auth.users remains the canonical customer identity; provider subjects are SHA-256 hashes, never raw phone/email/account identifiers.';
comment on column public.resofit_ecosystem_identity_links.provider_subject_hash is
  'Lowercase SHA-256 of the provider subject identifier; do not store raw WhatsApp IDs, Telegram IDs, email addresses or phone numbers here.';

create index if not exists resofit_identity_links_user_provider_idx
  on public.resofit_ecosystem_identity_links (auth_user_id, provider, link_status);

create table if not exists public.chatb2k_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.resofit_events(id) on delete restrict,
  customer_user_id uuid references auth.users(id) on delete set null,
  identity_link_id uuid,
  source_job_table text,
  source_job_id uuid,
  provider text not null check (provider in (
    'resend', 'meta_whatsapp', 'telegram', 'twilio'
  )),
  channel text not null check (channel in ('email', 'whatsapp', 'telegram', 'sms')),
  delivery_class text not null check (delivery_class in (
    'transactional', 'service', 'marketing'
  )),
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  policy_basis text not null,
  consent_status text not null default 'unknown'
    check (consent_status in ('unknown', 'verified', 'not_required', 'revoked')),
  authorization_status text not null default 'pending'
    check (authorization_status in ('pending', 'approved', 'denied')),
  authorization_decision_id text,
  authorized_by_node text not null default 'chatb2k101',
  authorized_at timestamptz,
  idempotency_key text not null unique,
  status text not null default 'pending'
    check (status in (
      'pending', 'leased', 'accepted', 'delivered', 'failed',
      'suppressed', 'cancelled', 'dead_letter'
    )),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_message_id text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  last_attempt_at timestamptz,
  last_error_code text,
  last_error_redacted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chatb2k_delivery_outbox_identity_link_fk
    foreign key (identity_link_id)
    references public.resofit_ecosystem_identity_links (id)
    on delete set null,
  constraint chatb2k_delivery_outbox_identity_owner_fk
    foreign key (identity_link_id, customer_user_id)
    references public.resofit_ecosystem_identity_links (id, auth_user_id)
    on delete set null (identity_link_id),
  constraint chatb2k_delivery_outbox_customer_or_link_check
    check (customer_user_id is not null or identity_link_id is not null
      or status in ('delivered', 'failed', 'suppressed', 'cancelled', 'dead_letter')),
  constraint chatb2k_delivery_outbox_source_job_check
    check ((source_job_table is null and source_job_id is null)
      or (source_job_table in (
        'digital_product_factory_jobs',
        'digital_product_delivery_jobs',
        'chatb2k_automation_tasks',
        'customer_journeys'
      ) and source_job_id is not null)),
  constraint chatb2k_delivery_outbox_provider_channel_check
    check (
      (provider = 'resend' and channel = 'email')
      or (provider = 'meta_whatsapp' and channel = 'whatsapp')
      or (provider = 'telegram' and channel = 'telegram')
      or (provider = 'twilio' and channel in ('sms', 'whatsapp'))
    ),
  constraint chatb2k_delivery_outbox_approved_decision_check
    check (authorization_status <> 'approved'
      or (authorization_decision_id is not null and authorized_at is not null
        and authorized_by_node = 'chatb2k101')),
  constraint chatb2k_delivery_outbox_dispatch_authorized_check
    check (status not in ('leased', 'accepted', 'delivered')
      or authorization_status = 'approved'),
  constraint chatb2k_delivery_outbox_lease_check
    check (status <> 'leased' or (lease_token is not null and lease_expires_at is not null)),
  constraint chatb2k_delivery_outbox_accepted_check
    check (status <> 'accepted' or (provider_message_id is not null and accepted_at is not null)),
  constraint chatb2k_delivery_outbox_delivered_check
    check (status <> 'delivered'
      or (provider_message_id is not null and delivered_at is not null))
);

comment on table public.chatb2k_delivery_outbox is
  'ChatB2K101-governed dispatch queue. resofit_events remains the canonical event ledger; this table stores authorized delivery commands and provider execution receipts only.';
comment on column public.chatb2k_delivery_outbox.payload is
  'Template variables only. Do not store raw recipient addresses, phone numbers, provider credentials or secrets. Resolve destination from verified identity and consent at dispatch time.';
comment on column public.chatb2k_delivery_outbox.source_job_table is
  'Allowlisted source reference to an existing worker/job table; it does not create a competing job record.';
comment on column public.chatb2k_delivery_outbox.authorized_by_node is
  'Must be chatb2k101 for governed outbound dispatch. Workers cannot self-authorize delivery.';

create index if not exists chatb2k_delivery_outbox_ready_idx
  on public.chatb2k_delivery_outbox (status, available_at, created_at)
  where status in ('pending', 'failed');

create index if not exists chatb2k_delivery_outbox_customer_idx
  on public.chatb2k_delivery_outbox (customer_user_id, created_at desc);

create index if not exists chatb2k_delivery_outbox_event_idx
  on public.chatb2k_delivery_outbox (event_id);

create unique index if not exists chatb2k_delivery_outbox_provider_message_unique
  on public.chatb2k_delivery_outbox (provider, provider_message_id)
  where provider_message_id is not null;

alter table public.resofit_ecosystem_identity_links enable row level security;
alter table public.chatb2k_delivery_outbox enable row level security;

revoke all on table public.resofit_ecosystem_identity_links from public, anon, authenticated;
revoke all on table public.chatb2k_delivery_outbox from public, anon, authenticated;
grant all on table public.resofit_ecosystem_identity_links to service_role;
grant all on table public.chatb2k_delivery_outbox to service_role;
