create extension if not exists pgcrypto;

create table if not exists public.xbang_bigo_sources (
  id uuid primary key default gen_random_uuid(), client_key text not null default 'xbang', host_id text not null, source_url text not null,
  active boolean not null default true, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (client_key, host_id)
);

create table if not exists public.xbang_capture_jobs (
  id uuid primary key default gen_random_uuid(), client_key text not null default 'xbang', source_id uuid references public.xbang_bigo_sources(id) on delete set null,
  status text not null default 'queued', started_at timestamptz, completed_at timestamptz, error_message text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.xbang_content_assets (
  id uuid primary key default gen_random_uuid(), client_key text not null default 'xbang', source_provider text not null, source_asset_id text not null,
  source_url text not null, master_url text not null, delivery_url text not null, delivery_mode text not null default 'master', brand text not null default 'XBang',
  campaign text, asset_type text not null default 'video', mime_type text not null default 'video/mp4', width integer, height integer, duration_seconds numeric,
  aspect_ratio numeric, audio_present boolean, rights_status text, commercial_status text, tiktok_eligible boolean not null default false,
  youtube_eligible boolean not null default false, countries_allowed text[] not null default array['NG'], qa_status text not null default 'pending',
  alt_text text, content_pillar text, fingerprint text not null, intelligence jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (client_key, source_provider, source_asset_id), unique (client_key, fingerprint)
);

create table if not exists public.xbang_highlights (
  id uuid primary key default gen_random_uuid(), client_key text not null default 'xbang', host_id text not null, host_name text, original_url text not null,
  master_url text not null, delivery_url text not null, delivery_mode text not null default 'master', title text, caption text, target_channels text[] not null default array['tiktok','youtube'],
  fingerprint text not null, source_asset_id text, metadata jsonb not null default '{}'::jsonb, status text not null default 'queued', error_message text,
  content_asset_id uuid references public.xbang_content_assets(id) on delete set null, content_queue_id uuid, processing_started_at timestamptz, processed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (client_key, fingerprint)
);

create table if not exists public.xbang_content_queue (
  id uuid primary key default gen_random_uuid(), client_key text not null default 'xbang', title text not null, asset_id uuid references public.xbang_content_assets(id) on delete set null,
  master_url text not null, delivery_url text not null, public_id text not null, caption text, platforms text[] not null default array['tiktok','youtube'], status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb, campaign_key text not null default 'live_stream_highlights', platform text, destination text, safety_checked boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.xbang_clips (
  id uuid primary key default gen_random_uuid(), client_key text not null default 'xbang', highlight_id uuid references public.xbang_highlights(id) on delete cascade,
  master_url text not null, delivery_url text not null, delivery_mode text not null default 'master', start_seconds numeric, duration_seconds numeric, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists xbang_highlights_status_idx on public.xbang_highlights (client_key, status, created_at desc);
create index if not exists xbang_queue_status_idx on public.xbang_content_queue (client_key, status, created_at desc);
create index if not exists xbang_assets_delivery_idx on public.xbang_content_assets (client_key, delivery_mode, created_at desc);

alter table public.xbang_bigo_sources enable row level security;
alter table public.xbang_capture_jobs enable row level security;
alter table public.xbang_content_assets enable row level security;
alter table public.xbang_highlights enable row level security;
alter table public.xbang_content_queue enable row level security;
alter table public.xbang_clips enable row level security;
