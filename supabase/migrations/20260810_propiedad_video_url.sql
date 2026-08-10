-- Columna de video para propiedades individuales
ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Bucket para videos de propiedades individuales
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'propiedades-videos',
  'propiedades-videos',
  true,
  524288000,  -- 500 MB
  ARRAY['video/mp4','video/quicktime','video/webm','video/x-msvideo']
)
ON CONFLICT (id) DO NOTHING;

-- Solo admins pueden subir/eliminar
CREATE POLICY "prop_videos_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'propiedades-videos' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "prop_videos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'propiedades-videos' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Cualquier autenticado puede leer (bucket público de todas formas)
CREATE POLICY "prop_videos_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'propiedades-videos');

SELECT pg_notify('pgrst', 'reload schema');
