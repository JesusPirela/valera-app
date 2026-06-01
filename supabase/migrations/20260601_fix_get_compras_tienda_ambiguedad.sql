-- Corregir ambiguedad de columna "id" en get_compras_tienda
-- Se agregan aliases explícitos en el SELECT para evitar el conflicto
-- entre las columnas de las tablas JOIN y las variables OUT de RETURNS TABLE
CREATE OR REPLACE FUNCTION public.get_compras_tienda()
RETURNS TABLE (
  id               UUID,
  user_id          UUID,
  costo_coins      INTEGER,
  estado           TEXT,
  notas_admin      TEXT,
  atendido_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ,
  user_nombre      TEXT,
  user_avatar      TEXT,
  item_nombre      TEXT,
  item_icono       TEXT,
  item_tipo        TEXT,
  item_descripcion TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND pr.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    sc.id               AS id,
    sc.user_id          AS user_id,
    sc.costo_coins      AS costo_coins,
    sc.estado           AS estado,
    sc.notas_admin      AS notas_admin,
    sc.atendido_at      AS atendido_at,
    sc.created_at       AS created_at,
    COALESCE(p.nombre, 'Usuario desconocido')::TEXT  AS user_nombre,
    p.avatar_url::TEXT                               AS user_avatar,
    COALESCE(si.nombre, 'Articulo eliminado')::TEXT  AS item_nombre,
    COALESCE(si.icono, '🎁')::TEXT                   AS item_icono,
    COALESCE(si.tipo, 'otro')::TEXT                  AS item_tipo,
    si.descripcion::TEXT                             AS item_descripcion
  FROM public.store_compras sc
  LEFT JOIN public.profiles    p  ON p.id  = sc.user_id
  LEFT JOIN public.store_items si ON si.id = sc.item_id
  ORDER BY sc.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_compras_tienda() TO authenticated;
