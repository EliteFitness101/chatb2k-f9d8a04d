-- Source jobs can invoke Gemini/Firecrawl and need longer than pg_net's 5s default.
-- Bound each tick to one item to keep execution time predictable while preserving 5-minute cadence.
SELECT cron.alter_job(
  job_id := 13,
  command := $cmd$
    select net.http_post(
      url := 'https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/chatb2k-sourcing-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sourcing-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='buffer_cron_secret')
      ),
      body := jsonb_build_object('source','supabase-cron','time',now(),'limit',1),
      timeout_milliseconds := 120000
    ) as request_id;
  $cmd$
);
