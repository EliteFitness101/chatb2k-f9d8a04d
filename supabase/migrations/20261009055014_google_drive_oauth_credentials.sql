CREATE TABLE IF NOT EXISTS public.google_oauth_credentials (
  provider text PRIMARY KEY CHECK (provider = 'google_drive'),
  refresh_token text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  token_type text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_oauth_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.google_oauth_credentials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_oauth_credentials TO service_role;

COMMENT ON TABLE public.google_oauth_credentials IS 'Server-only OAuth credentials; never expose through client APIs.';
