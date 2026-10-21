-- Provision the public bucket for safety-verified social video assets.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('resofit-social-media','resofit-social-media',true,52428800,array['video/mp4','video/quicktime'])
on conflict (id) do update set public=true,file_size_limit=52428800,allowed_mime_types=array['video/mp4','video/quicktime'];

-- Allow only the dedicated public social-media bucket's verified BIGO MP4/MOV objects in the content queue.
-- Existing allowlisted Blob and Dropbox patterns remain unchanged.
alter table public.content_queue drop constraint if exists content_queue_asset_url_allowed_media_hosts;
alter table public.content_queue add constraint content_queue_asset_url_allowed_media_hosts check (
  ((asset_url = ''::text) and (platform = 'telegram'::text) and (metadata @> '{"media_omitted_for_telegram_text_fallback": true}'::jsonb))
  or ((asset_url = ''::text) and (platform = 'linkedin'::text) and (metadata @> '{"media_omitted_for_linkedin_text_fallback": true}'::jsonb))
  or ((asset_url = ''::text) and (platform = 'google_business'::text) and (metadata @> '{"media_omitted_for_google_business_text_fallback": true}'::jsonb))
  or (asset_url like 'https://ab2ttlkn9no0tuoa.public.blob.vercel-storage.com/%')
  or (asset_url ~ '^https://www[.]dropbox[.]com/scl/fi/[A-Za-z0-9_-]+/[^[:space:]]+[?]rlkey=[A-Za-z0-9_-]+&dl=1$')
  or (asset_url ~ '^https://dl[.]dropboxusercontent[.]com/scl/fi/[A-Za-z0-9_-]+/[^[:space:]]+[?]rlkey=[A-Za-z0-9_-]+&dl=1$')
  or (asset_url ~ '^https://vbqjvmnhdtdhmeeudqnn[.]supabase[.]co/storage/v1/object/public/resofit-social-media/bigo-highlights/[0-9a-f-]{36}[.](mp4|mov)$')
);
