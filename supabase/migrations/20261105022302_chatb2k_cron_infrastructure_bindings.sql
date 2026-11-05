-- Applied to production project vbqjvmnhdtdhmeeudqnn as migration 20261105022302.
-- This records active Supabase Cron metadata only; it does not alter schedules or job commands.

insert into public.chatb2k_infrastructure_bindings
(binding_id,system,project_ref,function_slug,cron_job_name,node_id,purpose,sync_mode,status,evidence,last_verified_at,updated_at)
select
 'cron.'||j.jobname,'supabase_cron','vbqjvmnhdtdhmeeudqnn',
 (regexp_match(j.command,'/functions/v1/([a-z0-9-]+)'))[1],j.jobname,
 case
  when j.jobname in ('flow-daily-creative-generator','resofit-content-intelligence-enricher','resofit-content-engine-daily') then 'chatb2k113'
  when j.jobname in ('resofit-ecosystem-autopilot','resofit-echo-v13-watchdog','resofit-v12-refresh') then 'chatb2k110'
  when j.jobname in ('resofit-buffer-publisher','resofit-buffer-status-sync','resofit-social-fanout','resofit-social-publisher','resofit-youtube-growth-engine','buffer-window-resume') then 'chatb2k123'
  when j.jobname in ('resofit-content-asset-ingestion','resofit-dropbox-media-rehost','resofit-catalog-asset-bridge') then 'chatb2k118'
  when j.jobname='bigo-seasonal-planner' then 'chatb2k112'
  when j.jobname='resofit-ceo-command-daily-push' then 'chatb2k101'
  when j.jobname='resofit-digital-product-delivery' then 'chatb2k122'
  when j.jobname in ('resofit-entitlement-reconciliation','resofit-reconcile-pending-payments') then 'chatb2k106'
  when j.jobname in ('resofit-revenue-engine-reconcile','elite-host-funnel-snapshot') then 'chatb2k104'
  when j.jobname='resofit-mark-abandoned-carts-hourly' then 'chatb2k105'
  when j.jobname in ('chatb2k-sourcing-engine','elite-host-growth-score-sweep','elite-host-milestone-sweep') then 'chatb2k125'
  when j.jobname in ('chatb2k-talent-followup-worker','elite-host-lifecycle-sweep-v2','elite-host-outreach-sweep') then 'chatb2k103'
  when j.jobname in ('chatb2k-professional-portfolio-refresh-daily','chatb2k-professional-channel-sync-6h') then 'chatb2k107'
  when j.jobname='chatb2k-membership-autopilot' then 'chatb2k102'
  else 'chatb2k110'
 end,
 'Scheduled ecosystem automation: '||j.jobname,'observe',
 case when r.latest_status='failed' then 'blocked' when r.latest_status='succeeded' then 'runtime_verified' else 'configured' end,
 jsonb_build_object('schedule',j.schedule,'active',j.active,'runs_24h',coalesce(r.run_count,0),'latest_run',r.latest_run,'latest_status',r.latest_status,'latest_message',r.latest_message,'verification_level','cron_scheduler_execution_only','worker_effect_verified',false),
 case when r.latest_status='succeeded' then r.latest_run else null end,now()
from cron.job j
left join lateral (
 select count(*) run_count,max(start_time) latest_run,(array_agg(status order by start_time desc))[1] latest_status,
 (array_agg(left(coalesce(return_message,''),180) order by start_time desc))[1] latest_message
 from cron.job_run_details d where d.jobid=j.jobid and d.start_time>now()-interval '24 hours'
) r on true
where j.active
on conflict (binding_id) do update set
 system=excluded.system,project_ref=excluded.project_ref,function_slug=excluded.function_slug,
 cron_job_name=excluded.cron_job_name,node_id=excluded.node_id,purpose=excluded.purpose,
 status=excluded.status,evidence=excluded.evidence,last_verified_at=excluded.last_verified_at,updated_at=now();

insert into public.chatb2k_registry_sync_runs(source_system,source_ref,outcome,inserted_count,details,completed_at)
values('supabase_cron_inventory','cron.job','completed',
 (select count(*) from public.chatb2k_infrastructure_bindings where system='supabase_cron'),
 jsonb_build_object('active_cron_jobs',(select count(*) from cron.job where active),'scheduler_status_only',true),now());
