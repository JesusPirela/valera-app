-- ══════════════════════════════════════════════════════════════
-- Conteo total de publicaciones por propiedad (para ordenar en el
-- panel admin "más publicadas → menos publicadas"). Cuenta todos los
-- eventos de publicacion_log (incluye re-publicaciones de cualquier
-- usuario). Solo admin/supervisor.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_publicaciones_conteo()
RETURNS TABLE (
  propiedad_id uuid,
  total        integer
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
  SELECT pl.propiedad_id, COUNT(*)::int AS total
  FROM public.publicacion_log pl
  GROUP BY pl.propiedad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_publicaciones_conteo() TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
