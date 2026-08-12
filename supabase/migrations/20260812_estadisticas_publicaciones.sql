-- Estadísticas de publicaciones de propiedades (admin/supervisor).
-- Agrega publicacion_log para: ranking de propiedades más/menos publicadas,
-- conteo de nunca publicadas y desglose por desarrollo (las que tienen nombre
-- de constructora; el campo zona es solo ciudad y no sirve para agrupar).

CREATE OR REPLACE FUNCTION public.estadisticas_publicaciones()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE v_role text; res jsonb;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'supervisor') THEN RAISE EXCEPTION 'Solo admin/supervisor'; END IF;

  WITH counts AS (
    SELECT propiedad_id, count(*) veces FROM publicacion_log GROUP BY propiedad_id
  ),
  base AS (
    SELECT p.id, p.codigo, p.titulo, p.zona, nullif(trim(p.nombre_constructora), '') dev,
           coalesce(c.veces, 0) veces
    FROM propiedades p LEFT JOIN counts c ON c.propiedad_id = p.id
  )
  SELECT jsonb_build_object(
    'total_publicaciones',    (SELECT count(*) FROM publicacion_log),
    'propiedades_totales',    (SELECT count(*) FROM propiedades),
    'propiedades_publicadas', (SELECT count(*) FROM counts),
    'nunca_publicadas',       (SELECT count(*) FROM base WHERE veces = 0),
    'por_desarrollo', (SELECT coalesce(jsonb_agg(d), '[]'::jsonb) FROM (
                SELECT dev desarrollo, count(*) propiedades, coalesce(sum(veces), 0) veces
                FROM base WHERE dev IS NOT NULL GROUP BY dev ORDER BY veces DESC LIMIT 15) d),
    -- Listado COMPLETO de todas las propiedades con su conteo (para tabla filtrable).
    'todas', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
                SELECT codigo, titulo, dev, veces FROM base ORDER BY veces DESC, titulo) t)
  ) INTO res;
  RETURN res;
END $func$;

GRANT EXECUTE ON FUNCTION public.estadisticas_publicaciones() TO authenticated;
