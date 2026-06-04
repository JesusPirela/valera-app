-- Archivos adjuntos en proyectos (imágenes y documentos)
CREATE TABLE IF NOT EXISTS public.proyecto_archivos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  url         TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'imagen',  -- imagen | documento
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proyecto_archivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admins_proyecto_archivos ON public.proyecto_archivos;
CREATE POLICY admins_proyecto_archivos ON public.proyecto_archivos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Bucket de Storage para archivos de proyectos
INSERT INTO storage.buckets (id, name, public)
VALUES ('proyectos-archivos', 'proyectos-archivos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage: solo admins
DROP POLICY IF EXISTS "admins upload proyectos" ON storage.objects;
CREATE POLICY "admins upload proyectos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'proyectos-archivos' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "admins read proyectos" ON storage.objects;
CREATE POLICY "admins read proyectos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'proyectos-archivos');

DROP POLICY IF EXISTS "admins delete proyectos" ON storage.objects;
CREATE POLICY "admins delete proyectos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'proyectos-archivos' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
