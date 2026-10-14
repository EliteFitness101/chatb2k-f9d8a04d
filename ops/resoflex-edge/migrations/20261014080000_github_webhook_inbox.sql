-- ResoFlex Edge Node: durable GitHub webhook inbox.
-- Apply ONLY to Supabase project xtgteviwtoupbfvorrmk (eu-central-1).
-- This migration is intentionally not in supabase/migrations because that directory
-- is pinned to the canonical resonance-fitness project (vbqjvmnhdtdhmeeudqnn).

create schema if not exists orchestration;

create table if not exists orchestration.github_webhook_inbox (
  id bigint generated always as identity primary key,
  delivery_id text not null unique,
  event_type text not null,
  repository_full_name text not null,
  action text,
  payload jsonb not null,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'retry_pending', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  correlation_id uuid not null default gen_random_uuid(),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  next_attempt_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists github_webhook_inbox_status_received_idx
  on orchestration.github_webhook_inbox (status, received_at);

create index if not exists github_webhook_inbox_retry_idx
  on orchestration.github_webhook_inbox (next_attempt_at)
  where status = 'retry_pending';

alter table orchestration.github_webhook_inbox enable row level security;

revoke all on schema orchestration from public, anon, authenticated;
revoke all on table orchestration.github_webhook_inbox from public, anon, authenticated;
grant usage on schema orchestration to service_role;
grant select, insert, update on table orchestration.github_webhook_inbox to service_role;
grant usage, select on sequence orchestration.github_webhook_inbox_id_seq to service_role;

comment on table orchestration.github_webhook_inbox is
  'Authenticated, allowlisted GitHub deliveries; idempotent by delivery_id. Server-only. Does not authorize arbitrary deployments or fulfillment.';
