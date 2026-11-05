-- Applied to production project vbqjvmnhdtdhmeeudqnn as migration 20261105020105.
-- Secret values are never copied into these registry tables.

create table if not exists public.chatb2k_api_key_registry (
 credential_ref text primary key, provider text not null,
 credential_kind text not null check (credential_kind in ('provider_api_key','oauth_access_token','oauth_refresh_token','webhook_auth','internal_service_auth','private_key','public_key','endpoint_config','encrypted_config','unknown')),
 secret_project_ref text not null,
 secret_store text not null check (secret_store in ('supabase_vault','github_actions','vercel_env','cloudflare_secret','runtime_env','external_secret_manager')),
 secret_name text not null, env_name text, purpose text not null,
 status text not null default 'registered' check (status in ('registered','active','paused','revoked','unknown')),
 value_present boolean, last_verified_at timestamptz, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(secret_project_ref,secret_store,secret_name)
);
create table if not exists public.chatb2k_provider_capabilities (
 capability_id text primary key, provider text not null, capability text not null, description text not null,
 verification_status text not null default 'declared' check (verification_status in ('declared','source_verified','runtime_verified','blocked','retired')),
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(provider,capability)
);
create table if not exists public.chatb2k_key_job_mappings (
 mapping_id uuid primary key default gen_random_uuid(),
 credential_ref text not null references public.chatb2k_api_key_registry(credential_ref) on update cascade,
 capability_id text references public.chatb2k_provider_capabilities(capability_id) on update cascade,
 target_project_ref text not null,
 target_type text not null check (target_type in ('edge_function','github_workflow','cron_job','webhook','orchestration_node','vercel_function','cloudflare_worker','service')),
 target_ref text not null, node_id text references public.chatb2k_orchestration_nodes(node_id) on update cascade,
 resolution_method text not null default 'reference_only',
 mapping_status text not null default 'declared' check (mapping_status in ('declared','consumer_reference_found','source_verified','runtime_verified','blocked','retired')),
 priority integer not null default 100, enabled boolean not null default true, evidence jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(credential_ref,target_project_ref,target_type,target_ref,capability_id)
);
create table if not exists public.chatb2k_routing_policies (
 policy_id text primary key, provider text not null, capability_id text references public.chatb2k_provider_capabilities(capability_id),
 selection_strategy text not null default 'explicit_mapping', allow_failover boolean not null default false, failover_provider text,
 quota_action text not null default 'backoff_no_key_rotation', enabled boolean not null default true,
 verification_status text not null default 'declared' check (verification_status in ('declared','source_verified','runtime_verified','blocked')),
 policy jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.chatb2k_key_health_events (
 event_id uuid primary key default gen_random_uuid(), credential_ref text not null references public.chatb2k_api_key_registry(credential_ref) on update cascade,
 event_type text not null, outcome text not null, http_status integer, error_code text, latency_ms integer,
 source_project_ref text, source_function text, evidence jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now()
);
create table if not exists public.chatb2k_execution_ledger (
 execution_id uuid primary key default gen_random_uuid(), request_id text,
 credential_ref text references public.chatb2k_api_key_registry(credential_ref) on update cascade,
 capability_id text references public.chatb2k_provider_capabilities(capability_id),
 provider text not null, model text, node_id text references public.chatb2k_orchestration_nodes(node_id) on update cascade,
 target_project_ref text not null, target_type text not null, target_ref text not null, outcome text not null, http_status integer,
 input_units bigint, output_units bigint, latency_ms integer, started_at timestamptz not null default now(),
 completed_at timestamptz, evidence jsonb not null default '{}'::jsonb
);
create table if not exists public.chatb2k_infrastructure_bindings (
 binding_id text primary key, system text not null, project_ref text not null, repository text, workflow_path text,
 function_slug text, cron_job_name text, webhook_path text, worker_ref text,
 node_id text references public.chatb2k_orchestration_nodes(node_id) on update cascade,
 purpose text not null, sync_mode text not null default 'observe' check (sync_mode in ('observe','manifest_sync','runtime_sync')),
 status text not null default 'declared' check (status in ('declared','configured','runtime_verified','blocked','retired')),
 evidence jsonb not null default '{}'::jsonb, last_verified_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.chatb2k_registry_sync_runs (
 sync_id uuid primary key default gen_random_uuid(), source_system text not null, source_ref text not null, outcome text not null,
 inserted_count integer not null default 0, updated_count integer not null default 0, skipped_count integer not null default 0,
 error_count integer not null default 0, details jsonb not null default '{}'::jsonb,
 started_at timestamptz not null default now(), completed_at timestamptz
);

create index if not exists idx_chatb2k_key_mapping_target on public.chatb2k_key_job_mappings(target_project_ref,target_type,target_ref);
create index if not exists idx_chatb2k_key_mapping_node on public.chatb2k_key_job_mappings(node_id);
create index if not exists idx_chatb2k_execution_ledger_started on public.chatb2k_execution_ledger(started_at desc);
create index if not exists idx_chatb2k_key_health_recent on public.chatb2k_key_health_events(credential_ref,occurred_at desc);
create index if not exists idx_chatb2k_infra_node on public.chatb2k_infrastructure_bindings(node_id);

do $$
declare t text;
begin
 foreach t in array array['chatb2k_api_key_registry','chatb2k_provider_capabilities','chatb2k_key_job_mappings','chatb2k_routing_policies','chatb2k_key_health_events','chatb2k_execution_ledger','chatb2k_infrastructure_bindings','chatb2k_registry_sync_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('drop policy if exists %I on public.%I',t||'_service_role_all',t);
  execute format('create policy %I on public.%I for all to service_role using (true) with check (true)',t||'_service_role_all',t);
 end loop;
end $$;

insert into public.chatb2k_api_key_registry(credential_ref,provider,credential_kind,secret_project_ref,secret_store,secret_name,env_name,purpose,status,value_present,metadata)
select 'main:vault:'||s.name,
 case when upper(s.name) like '%GEMINI%' then 'google_gemini' when upper(s.name) like '%BUFFER%' then 'buffer' when upper(s.name) like '%RESEND%' then 'resend' when upper(s.name) like '%R2%' then 'cloudflare_r2' when upper(s.name) like '%TELEGRAM%' then 'telegram' when upper(s.name) like '%WHATSAPP%' then 'whatsapp' when upper(s.name) like '%FIRECRAWL%' then 'firecrawl' when upper(s.name) like '%PAY%' then 'payments_internal' when upper(s.name) like '%CEO%' or upper(s.name) like '%CHATB2K%' or upper(s.name) like '%CATALOG%' then 'chatb2k_internal' else 'resofit_internal' end,
 case when upper(s.name) like '%GEMINI%' or upper(s.name) like '%FIRECRAWL%' or upper(s.name) like '%RESEND%' then 'provider_api_key' when upper(s.name) like '%ACCESS_TOKEN%' then 'oauth_access_token' when upper(s.name) like '%REFRESH_TOKEN%' then 'oauth_refresh_token' when upper(s.name) like '%VAPID_PRIVATE%' then 'private_key' when upper(s.name) like '%VAPID_PUBLIC%' then 'public_key' when upper(s.name) like '%ENDPOINT%' then 'endpoint_config' when upper(s.name) like '%ACCOUNTS%' then 'encrypted_config' else 'internal_service_auth' end,
 'vbqjvmnhdtdhmeeudqnn','supabase_vault',s.name,null,
 coalesce(nullif(s.description,''),'Existing Supabase Vault credential reference'),'registered',true,
 jsonb_build_object('inventory_source','vault.secrets metadata','secret_value_read',false,'created_at',s.created_at)
from vault.secrets s on conflict (credential_ref) do nothing;

insert into public.chatb2k_api_key_registry(credential_ref,provider,credential_kind,secret_project_ref,secret_store,secret_name,env_name,purpose,status,value_present,metadata) values
('edge-node:vault:chatb2k_gemini_automation_api_key','chatb2k_internal','webhook_auth','xtgteviwtoupbfvorrmk','supabase_vault','chatb2k_gemini_automation_api_key',null,'Inbound authentication for Gemini automation webhook; not a Gemini model API key','registered',true,'{"secret_value_read":false}'),
('edge-node:env:GEMINI_AUTOMATION_API_KEY','chatb2k_internal','webhook_auth','xtgteviwtoupbfvorrmk','runtime_env','GEMINI_AUTOMATION_API_KEY','GEMINI_AUTOMATION_API_KEY','Legacy webhook authentication fallback environment name','unknown',null,'{"runtime_presence_verified":false}'),
('edge-node:env:CHATB2K_GEMINI_WEBHOOK_SECRET','chatb2k_internal','webhook_auth','xtgteviwtoupbfvorrmk','runtime_env','CHATB2K_GEMINI_WEBHOOK_SECRET','CHATB2K_GEMINI_WEBHOOK_SECRET','Preferred dedicated webhook authentication environment name','unknown',null,'{"runtime_presence_verified":false}'),
('elite101:github_actions:GEMINI_AUTOMATION_API_KEY','google_gemini','provider_api_key','EliteFitness101/elite101','github_actions','GEMINI_AUTOMATION_API_KEY','GEMINI_AUTOMATION_API_KEY','Secondary Gemini provider key slot referenced by Elite FFmpeg workflow','unknown',null,'{"secret_value_read":false}'),
('elite101:github_actions:GEMINI_API_KEY1','google_gemini','provider_api_key','EliteFitness101/elite101','github_actions','GEMINI_API_KEY1','GEMINI_API_KEY1','Fallback Gemini provider key slot referenced by Elite FFmpeg workflow','unknown',null,'{"secret_value_read":false}'),
('chatb2k:github_actions:GEMINI_API_KEY','google_gemini','provider_api_key','EliteFitness101/chatb2k-f9d8a04d','github_actions','GEMINI_API_KEY','GEMINI_API_KEY','Gemini CLI read-only repository audit credential','unknown',null,'{"secret_value_read":false}')
on conflict (credential_ref) do nothing;

insert into public.chatb2k_provider_capabilities(capability_id,provider,capability,description,verification_status,metadata) values
('gemini.text_generation','google_gemini','text_generation','Text and prompt generation','source_verified','{}'),
('gemini.image_generation','google_gemini','image_generation','Image generation where model and account support it','declared','{"runtime_model_verified":false}'),
('gemini.video_generation','google_gemini','video_generation','Video generation where model and account support it','blocked','{"last_observed_blocker":"RESOURCE_EXHAUSTED"}'),
('gemini.multimodal_analysis','google_gemini','multimodal_analysis','Multimodal content and video analysis','source_verified','{}'),
('buffer.social_publish','buffer','social_publish','Social scheduling and publishing','declared','{}'),
('cloudflare_r2.object_storage','cloudflare_r2','object_storage','R2 media object storage','declared','{"runtime_roundtrip_verified":false}'),
('telegram.message_delivery','telegram','message_delivery','Telegram bot delivery','declared','{}'),
('resend.transactional_email','resend','transactional_email','Transactional email delivery','declared','{}')
on conflict (capability_id) do nothing;
