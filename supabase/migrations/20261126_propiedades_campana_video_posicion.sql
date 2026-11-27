-- propiedades_campana_elegir_video (modo solo_video del toque 2) gana un
-- parámetro opcional p_posicion (default 1): en vez de regresar siempre la
-- MEJOR coincidencia, regresa la N-ésima mejor, con la misma priorización
-- (zona+presupuesto > zona > presupuesto > resto, luego precio más cercano).
-- Si hay menos de N propiedades con video, regresa la última disponible en
-- vez de nada — así Make nunca se queda sin propiedad que mandar.
--
-- Lo pide Make para no repetir la misma propiedad en los toques 2 de varios
-- meses de la misma campaña: manda posicion 2, 3 y 4 en los meses 1, 3 y 5.
CREATE OR REPLACE FUNCTION propiedades_campana_elegir_video(
  p_zona        TEXT    DEFAULT NULL,
  p_presupuesto NUMERIC DEFAULT NULL,
  p_posicion    INT     DEFAULT 1
)
RETURNS TABLE (propiedad_id UUID, nombre TEXT, zona TEXT, precio_formateado TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_presupuesto NUMERIC := COALESCE(p_presupuesto, 0);
  v_total       INT;
  v_offset      INT;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.propiedades p
  WHERE p.estado = 'disponible'
    AND p.es_inventario = false
    AND p.video_wa_url IS NOT NULL;

  -- Clampa la posición pedida a [1, v_total]: si piden la 4ª y solo hay 2,
  -- se queda con la 2ª (la última disponible) en vez de regresar vacío.
  v_offset := LEAST(GREATEST(COALESCE(p_posicion, 1), 1), GREATEST(v_total, 1)) - 1;

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
  OFFSET v_offset
  LIMIT 1;
END;
$$;

-- Firma explícita: agregar p_posicion crea un SEGUNDO overload en vez de
-- reemplazar al de 2 parámetros (CREATE OR REPLACE empareja por tipos de
-- parámetros exactos), así que GRANT sin firma queda ambiguo entre los dos.
GRANT EXECUTE ON FUNCTION propiedades_campana_elegir_video(TEXT, NUMERIC, INT) TO service_role;

-- La versión vieja de 2 parámetros ya no la llama nadie (la edge function
-- siempre manda p_posicion) — se borra para que solo quede un overload.
DROP FUNCTION IF EXISTS propiedades_campana_elegir_video(TEXT, NUMERIC);

SELECT pg_notify('pgrst', 'reload schema');
