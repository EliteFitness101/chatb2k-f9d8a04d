
-- 1. Role enum + user_roles table
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'coach', 'member');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Security-definer role check (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- user_roles policies
DROP POLICY IF EXISTS "user_roles_self_read" ON public.user_roles;
CREATE POLICY "user_roles_self_read" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_admin_write" ON public.user_roles;
CREATE POLICY "user_roles_admin_write" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. candy_leads
CREATE TABLE IF NOT EXISTS public.candy_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  phone text,
  weight_kg numeric(5,2) NOT NULL,
  goal text NOT NULL,
  activity text NOT NULL,
  source text DEFAULT 'web',
  status text NOT NULL DEFAULT 'new',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS candy_leads_user_id_idx ON public.candy_leads(user_id);
CREATE INDEX IF NOT EXISTS candy_leads_created_at_idx ON public.candy_leads(created_at DESC);

ALTER TABLE public.candy_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candy_leads_anyone_insert" ON public.candy_leads;
CREATE POLICY "candy_leads_anyone_insert" ON public.candy_leads
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "candy_leads_self_read" ON public.candy_leads;
CREATE POLICY "candy_leads_self_read" ON public.candy_leads
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "candy_leads_admin_update" ON public.candy_leads;
CREATE POLICY "candy_leads_admin_update" ON public.candy_leads
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "candy_leads_admin_delete" ON public.candy_leads;
CREATE POLICY "candy_leads_admin_delete" ON public.candy_leads
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- 4. generated_content
CREATE TABLE IF NOT EXISTS public.generated_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'video',         -- 'video' | 'image' | 'reel'
  asset_url text,
  thumbnail_url text,
  music_track text,
  bpm integer,
  duration_seconds integer,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',       -- 'draft' | 'published' | 'archived'
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_content_status_idx ON public.generated_content(status);
CREATE INDEX IF NOT EXISTS generated_content_created_at_idx ON public.generated_content(created_at DESC);

ALTER TABLE public.generated_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "generated_content_public_read" ON public.generated_content;
CREATE POLICY "generated_content_public_read" ON public.generated_content
  FOR SELECT USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "generated_content_admin_insert" ON public.generated_content;
CREATE POLICY "generated_content_admin_insert" ON public.generated_content
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "generated_content_admin_update" ON public.generated_content;
CREATE POLICY "generated_content_admin_update" ON public.generated_content
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "generated_content_admin_delete" ON public.generated_content;
CREATE POLICY "generated_content_admin_delete" ON public.generated_content
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- 5. Touch updated_at triggers
DROP TRIGGER IF EXISTS candy_leads_touch ON public.candy_leads;
CREATE TRIGGER candy_leads_touch BEFORE UPDATE ON public.candy_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS generated_content_touch ON public.generated_content;
CREATE TRIGGER generated_content_touch BEFORE UPDATE ON public.generated_content
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
