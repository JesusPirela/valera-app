-- Cambiar FK de citas_coordinacion para que apunten a profiles en vez de auth.users
-- Esto permite hacer JOIN directo con profiles sin pasar por auth.users
ALTER TABLE public.citas_coordinacion
  DROP CONSTRAINT IF EXISTS citas_coordinacion_prospectador_id_fkey,
  DROP CONSTRAINT IF EXISTS citas_coordinacion_coordinado_por_fkey,
  ADD CONSTRAINT citas_coordinacion_prospectador_id_fkey
    FOREIGN KEY (prospectador_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT citas_coordinacion_coordinado_por_fkey
    FOREIGN KEY (coordinado_por) REFERENCES public.profiles(id) ON DELETE SET NULL;
