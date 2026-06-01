
-- Gallery images table
CREATE TABLE public.gallery_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  slot TEXT NOT NULL DEFAULT 'general',
  url TEXT NOT NULL,
  storage_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.gallery_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gallery_images TO authenticated;
GRANT ALL ON public.gallery_images TO service_role;

ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gallery_images_public_read"
  ON public.gallery_images FOR SELECT
  USING (true);

CREATE POLICY "gallery_images_admin_insert"
  ON public.gallery_images FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "gallery_images_admin_update"
  ON public.gallery_images FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "gallery_images_admin_delete"
  ON public.gallery_images FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER gallery_images_touch
  BEFORE UPDATE ON public.gallery_images
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_gallery_images_slot_sort
  ON public.gallery_images(slot, sort_order);

-- Public storage bucket for the gallery
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-gallery', 'site-gallery', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "site_gallery_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-gallery');

CREATE POLICY "site_gallery_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'site-gallery' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "site_gallery_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'site-gallery' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "site_gallery_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'site-gallery' AND public.has_role(auth.uid(), 'admin'::app_role));
