-- UACE audit and approval records. Additive only; no existing tables are modified.
create table if not exists public.uace_command_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  plan_id text not null,
  command_redacted text not null,
  provider text not null,
  intent text not null,
  environment text not null,
  risk text not null,
  approval_state text not null,
  outcome text not null default 'planned',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists uace_command_audit_actor_created_idx
  on public.uace_command_audit (actor_user_id, created_at desc);
create index if not exists uace_command_audit_plan_idx
  on public.uace_command_audit (plan_id);

create table if not exists public.uace_approvals (
  id uuid primary key default gen_random_uuid(),
  plan_hash text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  approved_by uuid not null references auth.users(id) on delete restrict,
  constraint uace_approval_expiry_future check (expires_at > created_at)
);

create index if not exists uace_approvals_active_idx
  on public.uace_approvals (plan_hash, expires_at)
  where consumed_at is null;

alter table public.uace_command_audit enable row level security;
alter table public.uace_approvals enable row level security;

-- No client policies are intentionally created. Only the server-side service role
-- may write audit/approval records; user-facing read access must be added only
-- after an explicit admin/owner authorization policy is reviewed.
