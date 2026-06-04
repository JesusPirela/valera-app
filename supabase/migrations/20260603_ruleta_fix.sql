-- Añadir columnas persistentes para premios de ruleta
-- Esto evita que admin_entregar_recompensa (que sobreescribe notas_admin)
-- borre la información de qué tipo de compra fue.

ALTER TABLE public.store_compras
  ADD COLUMN IF NOT EXISTS tipo_compra   TEXT NOT NULL DEFAULT 'tienda',
  ADD COLUMN IF NOT EXISTS nombre_premio TEXT;

-- Actualizar registrar_premio_ruleta para poblar las nuevas columnas
CREATE OR REPLACE FUNCTION public.registrar_premio_ruleta(
  p_tipo_premio   TEXT,
  p_nombre_premio TEXT,
  p_costo_coins   INTEGER,
  p_es_milestone  BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_item_id   UUID;
  v_compra_id UUID;
  v_nota      TEXT;
  v_tipo_comp TEXT;
BEGIN
  IF NOT p_es_milestone AND p_costo_coins > 0 THEN
    IF NOT gastar_coins(v_user_id, p_costo_coins, 'Cofre ruleta 🎰') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
    END IF;
  END IF;

  SELECT id INTO v_item_id
  FROM store_items
  WHERE tipo = p_tipo_premio
  ORDER BY disponible DESC
  LIMIT 1;

  IF v_item_id IS NULL THEN
    SELECT id INTO v_item_id
    FROM store_items
    ORDER BY orden
    LIMIT 1;
  END IF;

  v_nota := CASE
    WHEN p_es_milestone THEN '🏆 Premio ruleta milestone: ' || p_nombre_premio
    ELSE '🎰 Premio cofre ruleta: ' || p_nombre_premio
  END;

  v_tipo_comp := CASE
    WHEN p_es_milestone THEN 'ruleta_milestone'
    ELSE 'ruleta_cofre'
  END;

  INSERT INTO store_compras
    (user_id, item_id, costo_coins, estado, notas_admin, tipo_compra, nombre_premio)
  VALUES
    (v_user_id, v_item_id, p_costo_coins, 'pendiente', v_nota, v_tipo_comp, p_nombre_premio)
  RETURNING id INTO v_compra_id;

  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
  SELECT
    p.id,
    '🎰 Premio ruleta pendiente',
    (SELECT nombre FROM profiles WHERE id = v_user_id LIMIT 1) || ' ganó en la ruleta: ' || p_nombre_premio,
    'sistema'
  FROM profiles p
  WHERE p.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_premio_ruleta TO authenticated;

-- Actualizar get_compras_tienda para devolver tipo_compra y nombre_premio
DROP FUNCTION IF EXISTS public.get_compras_tienda();
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
  item_descripcion TEXT,
  tipo_compra      TEXT,
  nombre_premio    TEXT
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
    COALESCE(si.nombre, 'Artículo eliminado')::TEXT  AS item_nombre,
    COALESCE(si.icono, '🎁')::TEXT                   AS item_icono,
    COALESCE(si.tipo, 'otro')::TEXT                  AS item_tipo,
    si.descripcion::TEXT                             AS item_descripcion,
    COALESCE(sc.tipo_compra, 'tienda')::TEXT         AS tipo_compra,
    sc.nombre_premio                                 AS nombre_premio
  FROM public.store_compras sc
  LEFT JOIN public.profiles    p  ON p.id  = sc.user_id
  LEFT JOIN public.store_items si ON si.id = sc.item_id
  ORDER BY sc.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_compras_tienda() TO authenticated;
