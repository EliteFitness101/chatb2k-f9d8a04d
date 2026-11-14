-- Promote the dedicated R2 media CDN URL for BIGO highlights while preserving
-- the existing Blob, Dropbox, Supabase Storage, and text-only fallback rules.
ALTER TABLE public.content_queue
  ADD CONSTRAINT content_queue_asset_url_allowed_media_hosts_v2
  CHECK (
    (
      (asset_url = '' AND platform = 'telegram' AND metadata @> '{"media_omitted_for_telegram_text_fallback": true}'::jsonb)
      OR (asset_url = '' AND platform = 'linkedin' AND metadata @> '{"media_omitted_for_linkedin_text_fallback": true}'::jsonb)
      OR (asset_url = '' AND platform = 'google_business' AND metadata @> '{"media_omitted_for_google_business_text_fallback": true}'::jsonb)
      OR asset_url LIKE 'https://ab2ttlkn9no0tuoa.public.blob.vercel-storage.com/%'
      OR asset_url ~ '^https://www[.]dropbox[.]com/scl/fi/[A-Za-z0-9_-]+/[^[:space:]]+[?]rlkey=[A-Za-z0-9_-]+&dl=1$'
      OR asset_url ~ '^https://dl[.]dropboxusercontent[.]com/scl/fi/[A-Za-z0-9_-]+/[^[:space:]]+[?]rlkey=[A-Za-z0-9_-]+&dl=1$'
      OR asset_url ~ '^https://vbqjvmnhdtdhmeeudqnn[.]supabase[.]co/storage/v1/object/public/resofit-social-media/bigo-highlights/[0-9a-f-]{36}[.](mp4|mov)$'
      OR asset_url ~ '^https://media[.]resofit[.]fit/public/bigo/hosts/[A-Za-z0-9._-]+/processed(/[A-Za-z0-9._-]+)*/[A-Za-z0-9._-]+[.](mp4|mov)$'
      OR asset_url ~ '^https://media[.]resofit[.]fit/chatb2k/bigo-highlights/[0-9a-f-]{36}[.](mp4|mov)$'
    )
  ) NOT VALID;

ALTER TABLE public.content_queue
  VALIDATE CONSTRAINT content_queue_asset_url_allowed_media_hosts_v2;

ALTER TABLE public.content_queue
  DROP CONSTRAINT content_queue_asset_url_allowed_media_hosts;

ALTER TABLE public.content_queue
  RENAME CONSTRAINT content_queue_asset_url_allowed_media_hosts_v2
  TO content_queue_asset_url_allowed_media_hosts;

COMMENT ON CONSTRAINT content_queue_asset_url_allowed_media_hosts ON public.content_queue
  IS 'Allows approved text-only fallbacks, legacy public Vercel Blob, verified Dropbox, approved Supabase Storage BIGO highlights, and verified ResoFit R2 BIGO media paths.';

-- Keep the one-minute rehost worker from repeatedly selecting already migrated
-- R2 assets. It still processes verified Dropbox/Blob/Supabase source URLs.
DO $$
DECLARE
  v_job_id bigint;
  v_command text;
BEGIN
  SELECT jobid, command
    INTO v_job_id, v_command
  FROM cron.job
  WHERE jobname = 'resofit-dropbox-media-rehost'
  ORDER BY jobid
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    IF strpos(v_command, 'and q.asset_url not like ''https://media.resofit.fit/chatb2k/bigo-highlights/%''') = 0 THEN
      v_command := replace(
        v_command,
        'and q.asset_url not like ''https://vbqjvmnhdtdhmeeudqnn.supabase.co/storage/v1/object/public/resofit-social-media/%''',
        'and q.asset_url not like ''https://vbqjvmnhdtdhmeeudqnn.supabase.co/storage/v1/object/public/resofit-social-media/%''' || E'\n' ||
        '      and q.asset_url not like ''https://media.resofit.fit/chatb2k/bigo-highlights/%'''
      );
    END IF;

    IF strpos(v_command, 'and q.asset_url not like ''https://media.resofit.fit/public/bigo/hosts/%''') = 0 THEN
      v_command := replace(
        v_command,
        'and q.asset_url not like ''https://media.resofit.fit/chatb2k/bigo-highlights/%''',
        'and q.asset_url not like ''https://media.resofit.fit/chatb2k/bigo-highlights/%''' || E'\n' ||
        '      and q.asset_url not like ''https://media.resofit.fit/public/bigo/hosts/%'''
      );
    END IF;

    PERFORM cron.alter_job(v_job_id, command := v_command);
  ELSE
    RAISE NOTICE 'resofit-dropbox-media-rehost cron job not found; no scheduler update applied';
  END IF;
END $$;
