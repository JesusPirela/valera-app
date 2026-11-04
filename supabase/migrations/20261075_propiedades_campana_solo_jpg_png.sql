-- WhatsApp solo acepta JPG/PNG en carruseles de plantilla, no WebP. El RPC
-- ahora exige extensión .jpg/.jpeg/.png (además de <=5MB), y prefiere una
-- copia ya convertida en wa/<propiedad_id>.jpg si existe (la sube el script
-- de conversión o, a futuro, el flujo de subida de fotos de la app).

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
    SELECT COALESCE(wa.ruta, orig.ruta) AS ruta
    FROM (SELECT 1) dummy
    LEFT JOIN LATERAL (
      SELECT 'storage/v1/object/public/propiedades/wa/' || p.id || '.jpg' AS ruta
      FROM storage.objects o
      WHERE o.bucket_id = 'propiedades'
        AND o.name = 'wa/' || p.id || '.jpg'
        AND COALESCE((o.metadata->>'size')::bigint, 0) BETWEEN 1 AND 5242880
      LIMIT 1
    ) wa ON TRUE
    LEFT JOIN LATERAL (
      SELECT regexp_replace(pi.url, '^https?://[^/]+/', '') AS ruta
      FROM public.propiedad_imagenes pi
      JOIN storage.objects o
        ON o.bucket_id = 'propiedades'
        AND o.name = regexp_replace(pi.url, '^.*/object/public/propiedades/', '')
      WHERE pi.propiedad_id = p.id
        AND lower(pi.url) ~ '\.(jpe?g|png)$'
        AND COALESCE((o.metadata->>'size')::bigint, 0) BETWEEN 1 AND 5242880
      ORDER BY pi.orden ASC
      LIMIT 1
    ) orig ON TRUE
    WHERE wa.ruta IS NOT NULL OR orig.ruta IS NOT NULL
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

-- Usada por el script de conversión única (supabase/scripts/convertir-fotos-wa.ts):
-- lista las propiedades disponibles que se quedarían SIN foto en el carrusel
-- (solo tienen WebP u otro formato, o solo fotos >5MB, y aún no tienen copia
-- wa/<id>.jpg), junto con su foto de menor `orden` como fuente a convertir.
CREATE OR REPLACE FUNCTION propiedades_sin_foto_wa_pendientes()
RETURNS TABLE (id UUID, url TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, storage
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, foto.url
  FROM public.propiedades p
  CROSS JOIN LATERAL (
    SELECT pi.url
    FROM public.propiedad_imagenes pi
    WHERE pi.propiedad_id = p.id
    ORDER BY pi.orden ASC
    LIMIT 1
  ) foto
  WHERE p.estado = 'disponible'
    AND p.es_inventario = false
    -- ya tiene copia wa/ convertida y liviana
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'propiedades'
        AND o.name = 'wa/' || p.id || '.jpg'
        AND COALESCE((o.metadata->>'size')::bigint, 0) BETWEEN 1 AND 5242880
    )
    -- y no tiene ninguna foto original jpg/png <=5MB
    AND NOT EXISTS (
      SELECT 1
      FROM public.propiedad_imagenes pi2
      JOIN storage.objects o2
        ON o2.bucket_id = 'propiedades'
        AND o2.name = regexp_replace(pi2.url, '^.*/object/public/propiedades/', '')
      WHERE pi2.propiedad_id = p.id
        AND lower(pi2.url) ~ '\.(jpe?g|png)$'
        AND COALESCE((o2.metadata->>'size')::bigint, 0) BETWEEN 1 AND 5242880
    );
END;
$$;

GRANT EXECUTE ON FUNCTION propiedades_sin_foto_wa_pendientes TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
