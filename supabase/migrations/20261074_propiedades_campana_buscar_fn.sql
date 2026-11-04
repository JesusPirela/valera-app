-- RPC usada por la edge function propiedades-campana (carrusel mensual de 3
-- casas por WhatsApp). Reutiliza la misma lógica de búsqueda con unaccent de
-- buscar_propiedades_chatbot, pero además exige que la propiedad tenga una
-- foto <= 5 MB (límite de WhatsApp para imágenes) -- si ninguna foto de la
-- propiedad cumple, la propiedad queda fuera del resultado.

CREATE OR REPLACE FUNCTION propiedades_campana_buscar(
  p_zona        TEXT    DEFAULT NULL,
  p_operacion   TEXT    DEFAULT NULL,
  p_tipo        TEXT    DEFAULT NULL,
  p_presupuesto NUMERIC DEFAULT NULL
)
RETURNS TABLE (codigo TEXT, titulo TEXT, precio NUMERIC, foto_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, storage
AS $$
BEGIN
  RETURN QUERY
  SELECT p.codigo, p.titulo, p.precio, foto.ruta
  FROM public.propiedades p
  CROSS JOIN LATERAL (
    SELECT regexp_replace(pi.url, '^https?://[^/]+/', '') AS ruta
    FROM public.propiedad_imagenes pi
    JOIN storage.objects o
      ON o.bucket_id = 'propiedades'
      AND o.name = regexp_replace(pi.url, '^.*/object/public/propiedades/', '')
    WHERE pi.propiedad_id = p.id
      AND COALESCE((o.metadata->>'size')::bigint, 0) > 0
      AND COALESCE((o.metadata->>'size')::bigint, 0) <= 5242880
    ORDER BY pi.orden ASC
    LIMIT 1
  ) foto
  WHERE p.estado = 'disponible'
    AND p.es_inventario = false
    AND (p_tipo        IS NULL OR p.tipo      = p_tipo)
    AND (p_operacion   IS NULL OR p.operacion = p_operacion)
    AND (p_presupuesto IS NULL OR p.precio   <= p_presupuesto)
    AND (
      p_zona IS NULL
      OR unaccent(lower(p.titulo))              ILIKE '%' || unaccent(lower(p_zona)) || '%'
      OR unaccent(lower(p.direccion))            ILIKE '%' || unaccent(lower(p_zona)) || '%'
      OR unaccent(lower(COALESCE(p.zona, '')))   ILIKE '%' || unaccent(lower(p_zona)) || '%'
    )
  ORDER BY p.precio DESC NULLS LAST
  LIMIT 3;
END;
$$;

GRANT EXECUTE ON FUNCTION propiedades_campana_buscar TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
