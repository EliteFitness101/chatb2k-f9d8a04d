-- Dispatch the ingestion-time media enrichment queue through the existing Supabase Cron + Vault pattern.
-- Uses the existing buffer_cron_secret already consumed by active ChatB2K workers.
select cron.unschedule(jobid)
from cron.job
where jobname = 'commerce-media-enrichment-worker';

select cron.schedule(
  'commerce-media-enrichment-worker',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/commerce-media-enrichment-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-content-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'buffer_cron_secret')
      ),
      body := jsonb_build_object('source', 'supabase-cron', 'limit', 3, 'time', now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $job$
);
