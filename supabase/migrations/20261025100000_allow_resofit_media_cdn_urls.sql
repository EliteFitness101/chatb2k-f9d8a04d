-- Allow the verified ResoFit media CDN for R2-backed BIGO video delivery.
-- Keep the existing allowlist and text-only fallback rules unchanged.
ALTER TABLE public.content_queue
  DROP CONSTRAINT IF EXISTS content_queue_asset_url_allowed_media_hosts;

ALTER TABLE public.content_queue
  ADD CONSTRAINT content_queue_asset_url_allowed_media_hosts
  CHECK (
    (
      asset_url = ''
      AND platform = 'telegram'
      AND metadata @> '{"media_omitted_for_telegram_text_fallback": true}'::jsonb
    )
    OR (
      asset_url = ''
      AND platform = 'linkedin'
      AND metadata @> '{"media_omitted_for_linkedin_text_fallback": true}'::jsonb
    )
    OR (
      asset_url = ''
      AND platform = 'google_business'
      AND metadata @> '{"media_omitted_for_google_business_text_fallback": true}'::jsonb
    )
    OR asset_url LIKE 'https://ab2ttlkn9no0tuoa.public.blob.vercel-storage.com/%'
    OR asset_url ~ '^https://www[.]dropbox[.]com/scl/fi/[A-Za-z0-9_-]+/[^[:space:]]+[?]rlkey=[A-Za-z0-9_-]+&dl=1$'
    OR asset_url ~ '^https://dl[.]dropboxusercontent[.]com/scl/fi/[A-Za-z0-9_-]+/[^[:space:]]+[?]rlkey=[A-Za-z0-9_-]+&dl=1$'
    OR asset_url ~ '^https://vbqjvmnhdtdhmeeudqnn[.]supabase[.]co/storage/v1/object/public/resofit-social-media/bigo-highlights/[0-9a-f-]{36}[.](mp4|mov)$'
    OR asset_url ~ '^https://media[.]resofit[.]fit/public/bigo/hosts/[A-Za-z0-9._-]+/processed(/[A-Za-z0-9._-]+)*/[A-Za-z0-9._-]+[.](mp4|mov)$'
  );

COMMENT ON CONSTRAINT content_queue_asset_url_allowed_media_hosts ON public.content_queue
  IS 'Allows approved text-only fallbacks, legacy public Vercel Blob, verified Dropbox media URLs, approved Supabase Storage BIGO highlights, and the ResoFit media CDN R2 path for processed BIGO videos.';
