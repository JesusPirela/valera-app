-- ══════════════════════════════════════════════════════════════
-- Videos de marketing: reels y contenido para prospectadores
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.videos_marketing (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        TEXT        NOT NULL,
  descripcion   TEXT,
  categoria     TEXT        NOT NULL DEFAULT 'reel'
                            CHECK (categoria IN ('reel','presentacion','tour','motivacional','otro')),
  video_url     TEXT        NOT NULL,
  thumbnail_url TEXT,
  subido_por    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  activo        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_marketing_categoria ON public.videos_marketing(categoria);
CREATE INDEX IF NOT EXISTS idx_videos_marketing_activo    ON public.videos_marketing(activo);

ALTER TABLE public.videos_marketing ENABLE ROW LEVEL SECURITY;

-- Admins: acceso total
CREATE POLICY "videos_admin_all" ON public.videos_marketing
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Prospectadores y demás roles autenticados: solo lectura de videos activos
CREATE POLICY "videos_auth_select" ON public.videos_marketing
  FOR SELECT TO authenticated
  USING (activo = true);

-- ── Storage bucket ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos-marketing',
  'videos-marketing',
  true,
  524288000,  -- 500 MB por archivo
  ARRAY['video/mp4','video/quicktime','video/webm','video/x-msvideo','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Solo admins pueden subir/borrar
CREATE POLICY "videos_marketing_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'videos-marketing' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "videos_marketing_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'videos-marketing' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Cualquier usuario autenticado puede leer (bucket es public de todas formas)
CREATE POLICY "videos_marketing_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'videos-marketing');

SELECT pg_notify('pgrst', 'reload schema');
