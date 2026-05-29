-- ══════════════════════════════════════════════════════════════
-- FIX: Tabla propiedad_publicacion — restricción única + RLS
-- ══════════════════════════════════════════════════════════════

-- Crear tabla si no existe (idempotente)
CREATE TABLE IF NOT EXISTS public.propiedad_publicacion (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id     UUID        NOT NULL REFERENCES public.propiedades(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publicada        BOOLEAN     NOT NULL DEFAULT FALSE,
  fecha_publicacion TIMESTAMPTZ,
  veces_publicada  INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT propiedad_publicacion_unique UNIQUE (propiedad_id, user_id)
);

-- Si la tabla ya existía sin la restricción, agregarla (ignora si ya existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'propiedad_publicacion_unique'
      AND conrelid = 'public.propiedad_publicacion'::regclass
  ) THEN
    ALTER TABLE public.propiedad_publicacion
      ADD CONSTRAINT propiedad_publicacion_unique UNIQUE (propiedad_id, user_id);
  END IF;
END;
$$;

-- Activar RLS
ALTER TABLE public.propiedad_publicacion ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas anteriores
DROP POLICY IF EXISTS "pub_select_own"   ON public.propiedad_publicacion;
DROP POLICY IF EXISTS "pub_insert_own"   ON public.propiedad_publicacion;
DROP POLICY IF EXISTS "pub_update_own"   ON public.propiedad_publicacion;
DROP POLICY IF EXISTS "pub_admin_select" ON public.propiedad_publicacion;

-- Cada prospectador solo ve sus propias publicaciones
CREATE POLICY "pub_select_own" ON public.propiedad_publicacion
  FOR SELECT USING (auth.uid() = user_id);

-- Cada prospectador inserta solo con su propio user_id
CREATE POLICY "pub_insert_own" ON public.propiedad_publicacion
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Cada prospectador actualiza solo sus propias publicaciones
CREATE POLICY "pub_update_own" ON public.propiedad_publicacion
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins ven todas las publicaciones
CREATE POLICY "pub_admin_select" ON public.propiedad_publicacion
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
