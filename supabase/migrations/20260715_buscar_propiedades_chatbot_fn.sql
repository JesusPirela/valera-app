-- RPC usada por la edge function buscar-propiedades para buscar con unaccent.
-- Reemplaza el query builder de PostgREST que no soporta unaccent() en filtros,
-- lo que causaba que "zibata" no encontrara propiedades con "Zibatá" en título/dirección.
-- orden_asc=true  → más baratas primero (búsqueda normal)
-- orden_asc=false → más caras primero  (cuando viene precio_min: el cliente quiere opciones de mayor valor)

DROP FUNCTION IF EXISTS buscar_propiedades_chatbot(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN);

CREATE OR REPLACE FUNCTION buscar_propiedades_chatbot(
  p_colonia    TEXT    DEFAULT NULL,
  p_tipo       TEXT    DEFAULT NULL,
  p_operacion  TEXT    DEFAULT NULL,
  p_precio_min NUMERIC DEFAULT NULL,
  p_precio_max NUMERIC DEFAULT NULL,
  p_orden_asc  BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (codigo TEXT, titulo TEXT, precio NUMERIC, recamaras SMALLINT, banos SMALLINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT p.codigo, p.titulo, p.precio, p.recamaras, p.banos
  FROM public.propiedades p
  WHERE p.estado = 'disponible'
    AND p.es_inventario = false
    AND (p_tipo       IS NULL OR p.tipo      = p_tipo)
    AND (p_operacion  IS NULL OR p.operacion = p_operacion)
    AND (p_precio_min IS NULL OR p.precio   >= p_precio_min)
    AND (p_precio_max IS NULL OR p.precio   <= p_precio_max)
    AND (
      p_colonia IS NULL
      OR unaccent(lower(p.titulo))    ILIKE '%' || unaccent(lower(p_colonia)) || '%'
      OR unaccent(lower(p.direccion)) ILIKE '%' || unaccent(lower(p_colonia)) || '%'
    )
  ORDER BY
    CASE WHEN     p_orden_asc THEN p.precio END ASC  NULLS LAST,
    CASE WHEN NOT p_orden_asc THEN p.precio END DESC NULLS LAST
  LIMIT 3;
END;
$$;

GRANT EXECUTE ON FUNCTION buscar_propiedades_chatbot TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
