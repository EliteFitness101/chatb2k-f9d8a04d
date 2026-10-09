-- pg_net defaults to 5 seconds; these workers call external APIs and need bounded longer timeouts.
SELECT cron.alter_job(
  job_id := 12,
  command := $cmd$
  select net.http_post(
    url := 'https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/chatb2k-membership-autopilot',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-content-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='buffer_cron_secret')
    ),
    body := jsonb_build_object('source','supabase-cron','time',now()),
    timeout_milliseconds := 30000
  ) as request_id;
  $cmd$
);

SELECT cron.alter_job(
  job_id := 31,
  command := $cmd$
  select net.http_post(
    url := 'https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/buffer-publisher',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-buffer-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='buffer_cron_secret')
    ),
    body := jsonb_build_object(
      'source','supabase-cron',
      'time',now(),
      'id',(
        select q.id
        from public.content_queue q
        where q.status='approved'
          and q.platform in ('tiktok','tiktok_recruit','youtube')
          and (q.scheduled_at is null or q.scheduled_at <= now())
        order by q.scheduled_at nulls first, q.created_at
        limit 1
      )
    ),
    timeout_milliseconds := 120000
  )
  where exists (
    select 1
    from public.content_queue q
    where q.status='approved'
      and q.platform in ('tiktok','tiktok_recruit','youtube')
      and (q.scheduled_at is null or q.scheduled_at <= now())
  );
  $cmd$
);
