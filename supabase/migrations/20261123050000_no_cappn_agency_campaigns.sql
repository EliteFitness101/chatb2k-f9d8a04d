-- No Cappn agency tenancy and rights-gated BIGO highlight campaigns.
-- Canonical project: resonance-fitness (vbqjvmnhdtdhmeeudqnn).
-- Staged in GitHub preview branch only; do not apply to production without approval.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.no_cappn_agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.no_cappn_agency_memberships (
  agency_id uuid not null references public.no_cappn_agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  created_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);

create table if not exists public.no_cappn_agency_hosts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.no_cappn_agencies(id) on delete cascade,
  source_id uuid not null references public.bigo_sources(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  evidence_url text,
  verification_note text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, source_id),
  check (evidence_url is null or evidence_url like 'https://%'),
  check ((status = 'verified' and verified_by is not null and verified_at is not null) or status <> 'verified')
);

create table if not exists public.no_cappn_campaigns (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.no_cappn_agencies(id) on delete cascade,
  host_mapping_id uuid not null references public.no_cappn_agency_hosts(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 160),
  objective text not null default 'host_recruitment' check (objective in ('host_recruitment')),
  primary_platform text not null default 'tiktok' check (primary_platform in ('tiktok','instagram','youtube','facebook')),
  application_url text not null check (application_url like 'https://%'),
  status text not null default 'draft' check (status in ('draft','pending_review','approved','paused','archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.no_cappn_campaign_assets (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.no_cappn_agencies(id) on delete cascade,
  campaign_id uuid not null references public.no_cappn_campaigns(id) on delete cascade,
  highlight_id uuid not null references public.resofit_live_highlights(id) on delete restrict,
  asset_id uuid not null references public.content_asset_registry(id) on delete restrict,
  approval_status text not null default 'pending_review' check (approval_status in ('pending_review','approved','rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (campaign_id, asset_id),
  check ((approval_status = 'approved' and reviewed_by is not null and reviewed_at is not null) or approval_status <> 'approved')
);

create index if not exists no_cappn_memberships_user_agency_idx
  on public.no_cappn_agency_memberships (user_id, agency_id) where status = 'active';
create index if not exists no_cappn_hosts_agency_status_idx
  on public.no_cappn_agency_hosts (agency_id, status);
create index if not exists no_cappn_campaigns_agency_created_idx
  on public.no_cappn_campaigns (agency_id, created_at desc);
create index if not exists no_cappn_campaign_assets_agency_campaign_idx
  on public.no_cappn_campaign_assets (agency_id, campaign_id);

alter table public.no_cappn_agencies enable row level security;
alter table public.no_cappn_agency_memberships enable row level security;
alter table public.no_cappn_agency_hosts enable row level security;
alter table public.no_cappn_campaigns enable row level security;
alter table public.no_cappn_campaign_assets enable row level security;

grant select on public.no_cappn_agencies to authenticated;
grant select on public.no_cappn_agency_memberships to authenticated;
grant select on public.no_cappn_agency_hosts to authenticated;
grant select, insert, update on public.no_cappn_campaigns to authenticated;
grant select on public.no_cappn_campaign_assets to authenticated;

drop policy if exists no_cappn_agencies_member_read on public.no_cappn_agencies;
create policy no_cappn_agencies_member_read on public.no_cappn_agencies
for select to authenticated
using (exists (
  select 1 from public.no_cappn_agency_memberships m
  where m.agency_id = id and m.user_id = (select auth.uid()) and m.status = 'active'
));

drop policy if exists no_cappn_agencies_operator_update on public.no_cappn_agencies;
create policy no_cappn_agencies_operator_update on public.no_cappn_agencies
for update to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists no_cappn_memberships_self_read on public.no_cappn_agency_memberships;
create policy no_cappn_memberships_self_read on public.no_cappn_agency_memberships
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists no_cappn_hosts_member_read on public.no_cappn_agency_hosts;
create policy no_cappn_hosts_member_read on public.no_cappn_agency_hosts
for select to authenticated
using (exists (
  select 1 from public.no_cappn_agency_memberships m
  where m.agency_id = public.no_cappn_agency_hosts.agency_id and m.user_id = (select auth.uid()) and m.status = 'active'
));

drop policy if exists no_cappn_hosts_operator_manage on public.no_cappn_agency_hosts;
create policy no_cappn_hosts_operator_manage on public.no_cappn_agency_hosts
for all to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists no_cappn_campaigns_member_read on public.no_cappn_campaigns;
create policy no_cappn_campaigns_member_read on public.no_cappn_campaigns
for select to authenticated
using (exists (
  select 1 from public.no_cappn_agency_memberships m
  where m.agency_id = public.no_cappn_campaigns.agency_id and m.user_id = (select auth.uid()) and m.status = 'active'
));

drop policy if exists no_cappn_campaigns_member_create on public.no_cappn_campaigns;
create policy no_cappn_campaigns_member_create on public.no_cappn_campaigns
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'draft'
  and exists (
    select 1 from public.no_cappn_agency_memberships m
    where m.agency_id = public.no_cappn_campaigns.agency_id and m.user_id = (select auth.uid()) and m.status = 'active'
  )
  and exists (
    select 1 from public.no_cappn_agency_hosts h
    where h.id = host_mapping_id and h.agency_id = public.no_cappn_campaigns.agency_id and h.status = 'verified'
  )
);

drop policy if exists no_cappn_campaigns_member_update on public.no_cappn_campaigns;
create policy no_cappn_campaigns_member_update on public.no_cappn_campaigns
for update to authenticated
using (exists (
  select 1 from public.no_cappn_agency_memberships m
  where m.agency_id = public.no_cappn_campaigns.agency_id and m.user_id = (select auth.uid()) and m.status = 'active'
))
with check (
  exists (
    select 1 from public.no_cappn_agency_memberships m
    where m.agency_id = public.no_cappn_campaigns.agency_id and m.user_id = (select auth.uid()) and m.status = 'active'
  )
  and status in ('draft','pending_review','paused','archived')
  and exists (
    select 1 from public.no_cappn_agency_hosts h
    where h.id = public.no_cappn_campaigns.host_mapping_id and h.agency_id = public.no_cappn_campaigns.agency_id and h.status = 'verified'
  )
);

drop policy if exists no_cappn_campaign_assets_member_read on public.no_cappn_campaign_assets;
create policy no_cappn_campaign_assets_member_read on public.no_cappn_campaign_assets
for select to authenticated
using (exists (
  select 1 from public.no_cappn_agency_memberships m
  where m.agency_id = public.no_cappn_campaign_assets.agency_id and m.user_id = (select auth.uid()) and m.status = 'active'
));

drop policy if exists no_cappn_campaign_assets_operator_review on public.no_cappn_campaign_assets;
create policy no_cappn_campaign_assets_operator_review on public.no_cappn_campaign_assets
for update to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- Atomic agency creation. Kept in the non-exposed private schema and callable only by authenticated users.
create or replace function private.create_no_cappn_agency(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_agency_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_name is null or length(trim(p_name)) not between 2 and 120 then
    raise exception 'Agency name must be between 2 and 120 characters' using errcode = '22023';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Agency slug must be lowercase alphanumeric words separated by hyphens' using errcode = '22023';
  end if;

  insert into public.no_cappn_agencies (name, slug, created_by)
  values (trim(p_name), p_slug, v_user_id)
  returning id into v_agency_id;

  insert into public.no_cappn_agency_memberships (agency_id, user_id, role, status)
  values (v_agency_id, v_user_id, 'owner', 'active');

  return v_agency_id;
end;
$$;

-- Attach only a highlight from the exact BIGO host mapped to this campaign.
-- The source-to-agency mapping must already be verified by a ResoFit operator.
create or replace function private.attach_no_cappn_highlight(p_campaign_id uuid, p_highlight_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_agency_id uuid;
  v_source_id uuid;
  v_bigo_id text;
  v_asset_id uuid;
  v_result_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select c.agency_id, ah.source_id, bs.bigo_id
    into v_agency_id, v_source_id, v_bigo_id
  from public.no_cappn_campaigns c
  join public.no_cappn_agency_hosts ah
    on ah.id = c.host_mapping_id and ah.agency_id = c.agency_id and ah.status = 'verified'
  join public.bigo_sources bs on bs.id = ah.source_id
  join public.no_cappn_agency_memberships m
    on m.agency_id = c.agency_id and m.user_id = v_user_id and m.status = 'active'
  where c.id = p_campaign_id;

  if v_agency_id is null then
    raise exception 'Campaign, verified host authorization, or agency membership not found' using errcode = '42501';
  end if;

  select h.content_asset_id into v_asset_id
  from public.resofit_live_highlights h
  join public.content_asset_registry a on a.id = h.content_asset_id
  where h.id = p_highlight_id
    and h.host_id = v_bigo_id
    and a.rights_status = 'verified'
    and a.commercial_status = 'authorized'
    and a.qa_status = 'approved'
    and a.canonical_url like 'https://%';

  if v_asset_id is null then
    raise exception 'Highlight does not belong to the verified host or its asset has not passed rights, commercial, and QA checks' using errcode = '42501';
  end if;

  insert into public.no_cappn_campaign_assets
    (agency_id, campaign_id, highlight_id, asset_id, approval_status, created_by)
  values
    (v_agency_id, p_campaign_id, p_highlight_id, v_asset_id, 'pending_review', v_user_id)
  on conflict (campaign_id, asset_id)
  do update set highlight_id = excluded.highlight_id
  returning id into v_result_id;

  return v_result_id;
end;
$$;

revoke all on function private.create_no_cappn_agency(text, text) from public, anon;
revoke all on function private.attach_no_cappn_highlight(uuid, uuid) from public, anon;
grant execute on function private.create_no_cappn_agency(text, text) to authenticated;
grant execute on function private.attach_no_cappn_highlight(uuid, uuid) to authenticated;
