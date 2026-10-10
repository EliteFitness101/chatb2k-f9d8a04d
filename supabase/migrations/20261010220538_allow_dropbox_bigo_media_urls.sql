-- Allow verified Dropbox shared media URLs for BIGO while preserving the existing Blob host allowlist.
-- Do not permit arbitrary third-party media hosts.
ALTER TABLE public.content_queue
  DROP CONSTRAINT IF EXISTS content_queue_asset_url_buffer_only;

ALTER TABLE public.content_queue
  ADD CONSTRAINT content_queue_asset_url_allowed_media_hosts
  CHECK (
    asset_url LIKE 'https://ab2ttlkn9no0tuoa.public.blob.vercel-storage.com/%'
    OR asset_url ~ '^https://www[.]dropbox[.]com/scl/fi/[A-Za-z0-9_-]+/[^[:space:]]+[?]rlkey=[A-Za-z0-9_-]+&dl=1$'
  );

COMMENT ON CONSTRAINT content_queue_asset_url_allowed_media_hosts
  ON public.content_queue IS
  'Allow canonical Vercel Blob URLs during migration and verified public Dropbox shared-media URLs for BIGO; rejects arbitrary external hosts.';
