-- Elite BIGO 808 Growth Engine v2
-- Applied to production Supabase project vbqjvmnhdtdhmeeudqnn on 2026-09-30.
-- Additive only: preserves existing BIGO, commerce, auth and publishing engines.

create table if not exists public.elite_host_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  host_application_id uuid not null references public.elite_host_applications(id) on delete cascade,
  from_state text, to_state text not null, reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.elite_host_growth_scores (
  id uuid primary key default gen_random_uuid(),
  host_application_id uuid not null references public.elite_host_applications(id) on delete cascade,
  measured_at timestamptz not null default now(),
  score numeric(6,2) not null default 0 check(score between 0 and 100),
  classification text not null default 'new'
    check(classification in ('new','active','developing','growing','core')),
  components jsonb not null default '{}'::jsonb
);

create table if not exists public.elite_host_content_events (
  id uuid primary key default gen_random_uuid(),
  host_application_id uuid not null references public.elite_host_applications(id) on delete cascade,
  event_type text not null check(event_type in ('live','clip','episode','publish','spotlight','challenge')),
  occurred_at timestamptz not null default now(),
  duration_minutes integer, asset_url text, platform text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.elite_host_outreach_queue (
  id uuid primary key default gen_random_uuid(),
  host_application_id uuid not null references public.elite_host_applications(id) on delete cascade,
  channel text not null check(channel in ('whatsapp','email','in_app')),
  template_key text not null, scheduled_at timestamptz not null,
  status text not null default 'queued'
    check(status in ('queued','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz, last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.elite_host_funnel_daily (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  impressions bigint not null default 0, landing_visitors bigint not null default 0,
  applications bigint not null default 0, qualified_adults bigint not null default 0,
  invite_initiated bigint not null default 0, verified_hosts bigint not null default 0,
  activated_hosts bigint not null default 0, active_hosts bigint not null default 0,
  recurring_weekly_hosts bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create table if not exists public.elite_host_country_targets (
  country_code text primary key, country_name text not null,
  tier text not null check(tier in ('A','B','C')),
  target_hosts integer not null default 0, enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.elite_host_program_config (
  id boolean primary key default true,
  target_verified integer not null default 808,
  target_activated integer not null default 650,
  target_active integer not null default 500,
  target_recurring_weekly integer not null default 300,
  target_developing_core integer not null default 100,
  first_live_sla_hours integer not null default 48,
  daily_content_distribution jsonb not null
    default '{"entertainment":40,"education":30,"host_story":20,"recruitment":10}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.elite_host_applications
  add column if not exists content_category text,
  add column if not exists internet_ready boolean,
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists telegram_handle text,
  add column if not exists source_channel text,
  add column if not exists country_tier text,
  add column if not exists user_id uuid,
  add column if not exists first_live_due_at timestamptz,
  add column if not exists last_reactivation_at timestamptz;

insert into public.elite_host_program_config(id) values(true) on conflict(id) do nothing;

insert into public.elite_host_country_targets(country_code,country_name,tier,target_hosts) values
('NG','Nigeria','A',300),('GH','Ghana','A',100),('KE','Kenya','A',100),
('ZA','South Africa','A',100),('TZ','Tanzania','A',75),('UG','Uganda','A',75),
('RW','Rwanda','B',15),('ZM','Zambia','B',15),('ZW','Zimbabwe','B',10),
('CM','Cameroon','B',5),('SL','Sierra Leone','B',2),('LR','Liberia','B',2)
on conflict(country_code) do update set tier=excluded.tier,target_hosts=excluded.target_hosts,enabled=true;

-- Ten B2K academy episodes complement the existing day 1/3/7/14/30 training records.
insert into public.elite_host_training_episodes(slug,title,day_number,episode_order,description,status,metadata) values
('b2k-academy-01','You Don’t Need to Be Famous to Start',1,1,'Identity, confidence and the first live.','published','{"academy":"b2k"}'),
('b2k-academy-02','Your First 10 Minutes LIVE — Exactly What to Say',1,2,'Opening script and viewer interaction.','published','{"academy":"b2k"}'),
('b2k-academy-03','How to Stop Staring at an Empty Live Room',3,3,'Conversation loops and audience prompts.','published','{"academy":"b2k"}'),
('b2k-academy-04','How to Turn One Viewer Into a Returning Viewer',3,4,'Retention habits and repeat-viewer cues.','published','{"academy":"b2k"}'),
('b2k-academy-05','The First 30 Minutes of a Serious Host',7,5,'Structured first-session routine.','published','{"academy":"b2k"}'),
('b2k-academy-06','Camera, Lighting, Audio and Background',7,6,'Mobile production quality setup.','published','{"academy":"b2k"}'),
('b2k-academy-07','How to Build Your BIGO Identity',14,7,'Niche, positioning and recurring segments.','published','{"academy":"b2k"}'),
('b2k-academy-08','What New Hosts Should NEVER Do',14,8,'Policy, safety and professionalism.','published','{"academy":"b2k"}'),
('b2k-academy-09','How I Would Build a Host From Zero',30,9,'Thirty-day development framework.','published','{"academy":"b2k"}'),
('b2k-academy-10','Your First 7-Day Host Challenge',30,10,'Consistency, content and follow-up challenge.','published','{"academy":"b2k"}')
on conflict(slug) do update set title=excluded.title,day_number=excluded.day_number,
episode_order=excluded.episode_order,description=excluded.description,status='published';

-- Lifecycle, score, outreach and funnel sweeps are installed as SECURITY DEFINER functions
-- in production and scheduled by pg_cron: lifecycle */15, score hourly, outreach */30, funnel daily.
