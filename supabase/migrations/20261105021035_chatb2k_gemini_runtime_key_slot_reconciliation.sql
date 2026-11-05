-- Applied to production project vbqjvmnhdtdhmeeudqnn as migration 20261105021035.
-- These are separate project-scoped runtime environment references, not copies of Vault or GitHub Actions secret values.

insert into public.chatb2k_api_key_registry
(credential_ref,provider,credential_kind,secret_project_ref,secret_store,secret_name,env_name,purpose,status,value_present,metadata)
values
('main:runtime_env:GEMINI_API_KEY','google_gemini','provider_api_key','vbqjvmnhdtdhmeeudqnn','runtime_env','GEMINI_API_KEY','GEMINI_API_KEY','Gemini provider environment variable referenced by deployed Edge Functions; runtime presence and identity not verified','unknown',null,'{"source_code_references":["flow-generation-gate","resofit-ecosystem-autopilot","content-intelligence-enricher"],"secret_value_read":false}'),
('main:runtime_env:GEMINI_AUTOMATION_API_KEY','google_gemini','provider_api_key','vbqjvmnhdtdhmeeudqnn','runtime_env','GEMINI_AUTOMATION_API_KEY','GEMINI_AUTOMATION_API_KEY','Secondary Gemini provider environment fallback referenced by elite-media-render-worker; runtime presence and identity not verified','unknown',null,'{"source_code_reference":"elite-media-render-worker","secret_value_read":false}'),
('main:runtime_env:GEMINI_API_KEY1','google_gemini','provider_api_key','vbqjvmnhdtdhmeeudqnn','runtime_env','GEMINI_API_KEY1','GEMINI_API_KEY1','Fallback Gemini provider environment secret referenced by elite-media-render-worker; runtime presence and identity not verified','unknown',null,'{"source_code_reference":"elite-media-render-worker","secret_value_read":false}')
on conflict (credential_ref) do update set purpose=excluded.purpose,metadata=public.chatb2k_api_key_registry.metadata||excluded.metadata,updated_at=now();

delete from public.chatb2k_key_job_mappings
where credential_ref='main:vault:GEMINI_API_KEY' and target_ref in ('flow-generation-gate','resofit-ecosystem-autopilot');

update public.chatb2k_key_job_mappings
set resolution_method='Vault RPC fallback after GEMINI_API_KEY environment lookup',
    evidence=evidence||'{"credential_precedence":"GEMINI_API_KEY environment first, Vault RPC fallback","exact_credential_selected":"not attributed"}'::jsonb,
    updated_at=now()
where credential_ref='main:vault:GEMINI_API_KEY' and target_ref='content-intelligence-enricher';

insert into public.chatb2k_key_job_mappings
(credential_ref,capability_id,target_project_ref,target_type,target_ref,node_id,resolution_method,mapping_status,evidence)
values
('main:runtime_env:GEMINI_API_KEY','gemini.text_generation','vbqjvmnhdtdhmeeudqnn','edge_function','flow-generation-gate','chatb2k113','Direct Deno.env GEMINI_API_KEY lookup','consumer_reference_found','{"runtime_value_present":"not verified","secret_value_read":false}'),
('main:runtime_env:GEMINI_API_KEY','gemini.text_generation','vbqjvmnhdtdhmeeudqnn','edge_function','resofit-ecosystem-autopilot','chatb2k113','Direct Deno.env GEMINI_API_KEY lookup','consumer_reference_found','{"runtime_value_present":"not verified","usage_ledger_successes_7d":6,"secret_value_read":false}'),
('main:runtime_env:GEMINI_API_KEY','gemini.multimodal_analysis','vbqjvmnhdtdhmeeudqnn','edge_function','content-intelligence-enricher','chatb2k113','Direct Deno.env lookup before Vault fallback','consumer_reference_found','{"runtime_value_present":"not verified","usage_ledger_successes_7d":385,"exact_credential_selected":"not attributed"}'),
('main:runtime_env:GEMINI_AUTOMATION_API_KEY','gemini.video_generation','vbqjvmnhdtdhmeeudqnn','edge_function','elite-media-render-worker','chatb2k113','Secondary key environment fallback and header resolution','consumer_reference_found','{"runtime_value_present":"not verified","secret_value_read":false}'),
('main:runtime_env:GEMINI_API_KEY1','gemini.video_generation','vbqjvmnhdtdhmeeudqnn','edge_function','elite-media-render-worker','chatb2k113','Secondary fallback environment lookup','consumer_reference_found','{"runtime_value_present":"not verified","secret_value_read":false}')
on conflict (credential_ref,target_project_ref,target_type,target_ref,capability_id) do nothing;
