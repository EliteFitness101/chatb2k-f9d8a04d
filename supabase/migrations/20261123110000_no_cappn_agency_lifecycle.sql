-- Additive No Cappn agency invitation and campaign approval lifecycle.
create table if not exists public.no_cappn_agency_invites (
 id uuid primary key default gen_random_uuid(),
 agency_id uuid not null references public.no_cappn_agencies(id) on delete cascade,
 invited_email text not null check(invited_email=lower(trim(invited_email))),
 role text not null check(role in('admin','member')),
 token_hash text not null unique,
 status text not null default 'pending' check(status in('pending','accepted','revoked','expired')),
 expires_at timestamptz not null,
 invited_by uuid not null references auth.users(id) on delete restrict,
 accepted_by uuid references auth.users(id) on delete set null,
 accepted_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((status='accepted' and accepted_by is not null and accepted_at is not null) or status<>'accepted')
);
create unique index if not exists no_cappn_one_pending_invite_per_email on public.no_cappn_agency_invites(agency_id,invited_email) where status='pending';
create index if not exists no_cappn_invites_expiry_idx on public.no_cappn_agency_invites(expires_at) where status='pending';
alter table public.no_cappn_agency_invites enable row level security;
revoke all on public.no_cappn_agency_invites from anon,authenticated;
grant all on public.no_cappn_agency_invites to service_role;

create or replace function public.accept_no_cappn_agency_invite(p_token_hash text,p_user_id uuid,p_email text)
returns uuid language plpgsql security invoker set search_path=''
as $function$
declare v_invite public.no_cappn_agency_invites%rowtype;
begin
 if p_user_id is null or p_email is null or length(trim(p_email))=0 then raise exception 'Authenticated user email required' using errcode='28000'; end if;
 select * into v_invite from public.no_cappn_agency_invites where token_hash=p_token_hash and status='pending' and expires_at>now() and invited_email=lower(trim(p_email)) for update;
 if not found then raise exception 'Invalid, expired, used, or email-mismatched invitation' using errcode='22023'; end if;
 if exists(select 1 from public.no_cappn_agency_memberships where agency_id=v_invite.agency_id and user_id=p_user_id) then raise exception 'Account already has an agency membership' using errcode='23505'; end if;
 insert into public.no_cappn_agency_memberships(agency_id,user_id,role,status) values(v_invite.agency_id,p_user_id,v_invite.role,'active');
 update public.no_cappn_agency_invites set status='accepted',accepted_by=p_user_id,accepted_at=now(),updated_at=now() where id=v_invite.id;
 return v_invite.agency_id;
end;
$function$;
revoke all on function public.accept_no_cappn_agency_invite(text,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_no_cappn_agency_invite(text,uuid,text) to service_role;

alter table public.no_cappn_campaigns add column if not exists review_note text;
alter table public.no_cappn_campaigns add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.no_cappn_campaigns add column if not exists reviewed_at timestamptz;
alter table public.no_cappn_campaigns drop constraint if exists no_cappn_campaigns_status_check;
alter table public.no_cappn_campaigns add constraint no_cappn_campaigns_status_check check(status=any(array['draft','pending_review','approved','rejected','paused','archived']));

drop policy if exists no_cappn_campaigns_member_update on public.no_cappn_campaigns;
create policy no_cappn_campaigns_member_update on public.no_cappn_campaigns for update to authenticated
using(status='draft' and exists(select 1 from public.no_cappn_agency_memberships m where m.agency_id=no_cappn_campaigns.agency_id and m.user_id=(select auth.uid()) and m.status='active'))
with check(status='draft'
 and exists(select 1 from public.no_cappn_agency_memberships m where m.agency_id=no_cappn_campaigns.agency_id and m.user_id=(select auth.uid()) and m.status='active')
 and exists(select 1 from public.no_cappn_agency_hosts h where h.id=no_cappn_campaigns.host_mapping_id and h.agency_id=no_cappn_campaigns.agency_id and h.status='verified'));
