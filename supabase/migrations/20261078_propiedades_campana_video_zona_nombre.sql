-- Ajuste a propiedades_campana_elegir_video (modo solo_video del toque 2):
--   - zona: antes regresaba propiedades.zona ("queretaro", ciudad/estado en
--     minúsculas). Ahora regresa la colonia/fraccionamiento, tomado del
--     primer segmento de `direccion` (ya viene bien capitalizado ahí, ej.
--     "Real Solare", "Zákia", "Milenio"). Si direccion viene vacía, cae a
--     zona capitalizada con initcap (fallback raro: las propiedades con
--     video siempre traen direccion).
--   - nombre: antes era el título. Ahora es "<recámaras> recámaras, <baños>
--     baños, <m²> m²" omitiendo los campos vacíos; si no hay ninguno, usa
--     el tipo ("Casa"/"Departamento"). Nunca incluye zona ni ciudad.
-- No cambia el modo normal (propiedades_campana_buscar, carrusel de 3 fotos).
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
    left(
      COALESCE(
        NULLIF(
          trim(both ', ' from concat_ws(', ',
            CASE WHEN p.recamaras IS NOT NULL AND p.recamaras > 0 THEN p.recamaras || ' recámaras' END,
            CASE WHEN p.banos IS NOT NULL AND p.banos > 0 THEN p.banos || ' baños' END,
            CASE WHEN p.m2 IS NOT NULL AND p.m2 > 0 THEN round(p.m2)::int || ' m²' END
          )),
          ''
        ),
        CASE WHEN lower(p.tipo) = 'departamento' THEN 'Departamento' ELSE 'Casa' END
      ),
      60
    ),
    COALESCE(
      NULLIF(trim(split_part(COALESCE(p.direccion, ''), ',', 1)), ''),
      initcap(COALESCE(p.zona, ''))
    ),
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
