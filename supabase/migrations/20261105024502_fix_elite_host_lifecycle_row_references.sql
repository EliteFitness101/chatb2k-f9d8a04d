create or replace function public.elite_host_lifecycle_sweep()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  n integer := 0;
  r record;
  s text;
begin
  for r in
    select *
    from public.elite_host_applications
    where status not in ('rejected', 'withdrawn')
  loop
    s := case
      when r.first_live_at is not null and r.last_live_at >= now() - interval '7 days' then 'active'
      when r.first_live_at is not null and r.last_live_at < now() - interval '7 days' then 'inactive'
      when r.invite_accepted_at is not null then 'training'
      when r.invite_sent_at is not null then 'invite_sent'
      when r.verification_status = 'verified' then 'bigo_verified'
      when r.status = 'accepted' then 'accepted'
      when r.status in ('pending', 'reviewing', 'audition') then 'applied'
      else coalesce(r.active_status, 'new')
    end;

    if coalesce(r.active_status, '') is distinct from s then
      insert into public.elite_host_lifecycle_events
        (host_application_id, from_state, to_state, reason)
      values
        (r.id, r.active_status, s, 'automated lifecycle sweep');
      update public.elite_host_applications
      set active_status = s, updated_at = now()
      where id = r.id;
      n := n + 1;
    end if;

    if r.verification_status = 'verified'
       and r.first_live_at is null
       and r.first_live_due_at is null then
      update public.elite_host_applications
      set first_live_due_at = now() + interval '48 hours', updated_at = now()
      where id = r.id;
    end if;
  end loop;
  return n;
end
$function$;
