-- pg_net defaults to 5 seconds; content and orchestration workers invoke external APIs.
SELECT cron.alter_job(
  job_id := 5,
  command := $cmd$
    select net.http_post(
      url := 'https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/resofit-content-engine',
      headers := jsonb_build_object('Content-Type','application/json','x-content-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='buffer_cron_secret')),
      body := jsonb_build_object('source','supabase-cron','time',now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $cmd$
);
SELECT cron.alter_job(
  job_id := 9,
  command := $cmd$
    select net.http_post(
      url := 'https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/youtube-growth-engine',
      headers := jsonb_build_object('Content-Type','application/json','x-content-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='buffer_cron_secret')),
      body := jsonb_build_object('source','supabase-cron','time',now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $cmd$
);
SELECT cron.alter_job(
  job_id := 10,
  command := $cmd$
    select net.http_post(
      url := 'https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/resofit-ecosystem-autopilot',
      headers := jsonb_build_object('Content-Type','application/json','x-content-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='buffer_cron_secret')),
      body := jsonb_build_object('source','supabase-cron','time',now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $cmd$
);
SELECT cron.alter_job(
  job_id := 14,
  command := $cmd$
    select net.http_post(
      url := 'https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/echo-v13-watchdog',
      headers := jsonb_build_object('Content-Type','application/json','x-content-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='buffer_cron_secret')),
      body := jsonb_build_object('source','supabase-cron','time',now()),
      timeout_milliseconds := 30000
    ) as request_id;
  $cmd$
);
SELECT cron.alter_job(
  job_id := 34,
  command := $cmd$
    with candidate as (
      select id, topic, hook, canonical_url
      from public.content_opportunities
      where status='open'
        and intent in ('conversion','discover','retention','recruit')
      order by
        case when intent='conversion' then 0 when intent='retention' then 1 else 2 end,
        created_at desc
      limit 1
    )
    select net.http_post(
      url := 'https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/flow-generation-gate',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-content-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='buffer_cron_secret')
      ),
      body := (
        select jsonb_build_object(
          'action','generate',
          'request_id',gen_random_uuid()::text,
          'content_pillar','chatb2k_recommended',
          'prompt',
          concat(
            'Create an original 8-second vertical 9:16 ResoFit short-form video for a ',
            topic,
            ' conversion opportunity. Hook: ', hook,
            '. Destination: ', coalesce(canonical_url,'https://www.resofit.fit'),
            '. Audience: Nigerian and African wellness consumers. ',
            'Use premium black-gold-glass cinematic visual language. ',
            'Do not make medical, guaranteed, deceptive, sexualized, or unsupported claims. ',
            'Create a strong first-2-second hook, clear human action, one curiosity gap, ',
            'and a single low-friction CTA. The creative must be truthful, safe, commercially useful, ',
            'and suitable for automated QA and platform publishing.'
          )
        )
        from candidate
      ),
      timeout_milliseconds := 120000
    ) as request_id;
  $cmd$
);
