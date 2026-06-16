-- ══════════════════════════════════════════════════════════════
-- PUBLICADORES POR PROPIEDAD (panel admin)
-- Devuelve quiénes publicaron una propiedad y cuántas veces, contando
-- eventos individuales de publicacion_log. Solo admin/supervisor.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_publicadores_propiedad(
  p_propiedad_id uuid
)
RETURNS TABLE (
  user_id uuid,
  nombre  text,
  veces   integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    pl.user_id,
    COALESCE(p.nombre, 'Sin nombre')::text,
    COUNT(*)::int AS veces
  FROM public.publicacion_log pl
  LEFT JOIN public.profiles p ON p.id = pl.user_id
  WHERE pl.propiedad_id = p_propiedad_id
  GROUP BY pl.user_id, p.nombre
  ORDER BY veces DESC, p.nombre;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_publicadores_propiedad(uuid) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
