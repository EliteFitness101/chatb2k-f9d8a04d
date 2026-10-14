-- Align the content_queue media-host constraint with the verified Dropbox-first BIGO capture path.
-- Preserve existing fallback rules and Vercel Blob / Dropbox shared-link support.
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
  );

COMMENT ON CONSTRAINT content_queue_asset_url_allowed_media_hosts ON public.content_queue
  IS 'Allows approved text-only fallbacks, the legacy public Vercel Blob host, and verified public Dropbox shared media URLs (www and direct-content hosts).';
