-- ─────────────────────────────────────────────────────────────────────────────
-- get_historial_publicaciones: devuelve el log de publicaciones con datos de
-- propiedad y usuario. Admin/supervisor/asesor ven todo el equipo; otros roles
-- ven solo sus propias publicaciones.
-- También extiende publog_admin para incluir 'asesor'.
-- ─────────────────────────────────────────────────────────────────────────────

-- Extender policy publog_admin para incluir asesor
DROP POLICY IF EXISTS "publog_admin" ON public.publicacion_log;
CREATE POLICY "publog_admin" ON public.publicacion_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'asesor')
    )
  );

-- RPC: historial de publicaciones con datos de propiedad y usuario
CREATE OR REPLACE FUNCTION public.get_historial_publicaciones(
  p_user_id UUID DEFAULT NULL,
  p_limit   INTEGER DEFAULT 100,
  p_offset  INTEGER DEFAULT 0
)
RETURNS TABLE (
  id             UUID,
  propiedad_id   UUID,
  user_id        UUID,
  created_at     TIMESTAMPTZ,
  codigo         TEXT,
  titulo         TEXT,
  nombre_usuario TEXT,
  email_usuario  TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_uid  UUID := auth.uid();
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE profiles.id = v_uid;

  -- Admin/supervisor/asesor pueden ver todo el equipo
  IF v_role IN ('admin', 'supervisor', 'asesor') THEN
    RETURN QUERY
    SELECT
      pl.id,
      pl.propiedad_id,
      pl.user_id,
      pl.created_at,
      prop.codigo,
      prop.titulo,
      prof.nombre,
      au.email::TEXT
    FROM public.publicacion_log pl
    JOIN public.propiedades prop ON prop.id = pl.propiedad_id
    JOIN public.profiles     prof ON prof.id = pl.user_id
    JOIN auth.users          au   ON au.id   = pl.user_id
    WHERE (p_user_id IS NULL OR pl.user_id = p_user_id)
    ORDER BY pl.created_at DESC
    LIMIT p_limit OFFSET p_offset;
  ELSE
    -- Otros roles solo ven sus propias publicaciones
    RETURN QUERY
    SELECT
      pl.id,
      pl.propiedad_id,
      pl.user_id,
      pl.created_at,
      prop.codigo,
      prop.titulo,
      prof.nombre,
      au.email::TEXT
    FROM public.publicacion_log pl
    JOIN public.propiedades prop ON prop.id = pl.propiedad_id
    JOIN public.profiles     prof ON prof.id = pl.user_id
    JOIN auth.users          au   ON au.id   = pl.user_id
    WHERE pl.user_id = v_uid
    ORDER BY pl.created_at DESC
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_historial_publicaciones(UUID, INTEGER, INTEGER) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
