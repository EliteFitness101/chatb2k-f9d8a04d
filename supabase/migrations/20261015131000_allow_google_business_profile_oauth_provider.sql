-- Allow isolated Google Business Profile OAuth credentials without altering Drive credentials.
ALTER TABLE public.google_oauth_credentials
  DROP CONSTRAINT IF EXISTS google_oauth_credentials_provider_check;

ALTER TABLE public.google_oauth_credentials
  ADD CONSTRAINT google_oauth_credentials_provider_check
  CHECK (provider = ANY (ARRAY['google_drive'::text, 'google_business_profile'::text]));
