do $patch$
declare
  v text;
begin
  v := pg_get_functiondef('public.resofit_v12_refresh()'::regprocedure);
  if position('last_heartbeat_at=now(),last_run_at=now(),updated_at=now()' in v) > 0 then
    v := replace(v,
      'last_heartbeat_at=now(),last_run_at=now(),updated_at=now()',
      'last_heartbeat_at=now(),updated_at=now()');
    execute v;
  end if;
end
$patch$;
