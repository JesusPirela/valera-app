-- ══════════════════════════════════════════════════════════════════════════════
-- Documentos de identificación en el formulario de reclutamiento de la landing.
--
-- Bucket PRIVADO: las subidas van SOLO con URL firmada (createSignedUploadUrl,
-- generada por registrar-solicitud-web con service role) — por eso no hay
-- policy de INSERT para anon en storage.objects; el token firmado autoriza la
-- subida directamente, sin pasar por RLS. Lectura solo admin/supervisor.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidatos-documentos',
  'candidatos-documentos',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "candidatos_documentos_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'candidatos-documentos' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  );

ALTER TABLE public.candidatos_reclutamiento
  ADD COLUMN IF NOT EXISTS documentos JSONB NOT NULL DEFAULT '[]';

SELECT pg_notify('pgrst', 'reload schema');
