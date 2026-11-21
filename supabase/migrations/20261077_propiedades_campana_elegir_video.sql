-- Elige UNA propiedad con video_wa_url para el toque 2 de la campaña de
-- WhatsApp. Prioridad en cascada (no filtra, solo ordena, así que siempre
-- regresa la mejor candidata disponible si existe alguna con video):
--   0) zona coincide Y precio <= presupuesto*1.10
--   1) zona coincide (cualquier precio)
--   2) precio <= presupuesto*1.10 (cualquier zona)
--   3) ninguna de las anteriores: la más cercana al presupuesto
-- Dentro de cada nivel, desempata por cercanía al presupuesto.
CREATE OR REPLACE FUNCTION propiedades_campana_elegir_video(
  p_zona        TEXT    DEFAULT NULL,
  p_presupuesto NUMERIC DEFAULT NULL
)
RETURNS TABLE (propiedad_id UUID, nombre TEXT, zona TEXT, precio_formateado TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_presupuesto NUMERIC := COALESCE(p_presupuesto, 0);
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    left(p.titulo, 60),
    COALESCE(p.zona, ''),
    '$' || to_char(round(p.precio)::bigint, 'FM999,999,999')
  FROM public.propiedades p
  WHERE p.estado = 'disponible'
    AND p.es_inventario = false
    AND p.video_wa_url IS NOT NULL
  ORDER BY
    CASE
      WHEN p_zona IS NOT NULL
        AND (
          unaccent(lower(p.titulo))              ILIKE '%' || unaccent(lower(p_zona)) || '%'
          OR unaccent(lower(p.direccion))         ILIKE '%' || unaccent(lower(p_zona)) || '%'
          OR unaccent(lower(COALESCE(p.zona,''))) ILIKE '%' || unaccent(lower(p_zona)) || '%'
        )
        AND p_presupuesto IS NOT NULL AND p.precio <= p_presupuesto * 1.10
      THEN 0
      WHEN p_zona IS NOT NULL
        AND (
          unaccent(lower(p.titulo))              ILIKE '%' || unaccent(lower(p_zona)) || '%'
          OR unaccent(lower(p.direccion))         ILIKE '%' || unaccent(lower(p_zona)) || '%'
          OR unaccent(lower(COALESCE(p.zona,''))) ILIKE '%' || unaccent(lower(p_zona)) || '%'
        )
      THEN 1
      WHEN p_presupuesto IS NOT NULL AND p.precio <= p_presupuesto * 1.10
      THEN 2
      ELSE 3
    END,
    ABS(p.precio - v_presupuesto)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION propiedades_campana_elegir_video TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
