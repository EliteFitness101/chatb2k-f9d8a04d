-- The sourcing edge function now fails closed and accepts the configured cron secret.
-- Pass the existing Vault secret rather than leaving the scheduled caller unauthenticated.
SELECT cron.alter_job(
  job_id := 13,
  command := $cmd$
    select net.http_post(
      url := 'https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/chatb2k-sourcing-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sourcing-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='buffer_cron_secret')
      ),
      body := jsonb_build_object('source','supabase-cron','time',now(),'limit',5)
    ) as request_id;
  $cmd$
);
