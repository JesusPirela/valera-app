-- Fix: item_id nullable en store_compras para premios de ruleta
-- Fix: registrar_premio_ruleta sin dependencia de item_id válido
-- Fix: get_compras_tienda con LEFT JOIN para soportar item_id NULL

ALTER TABLE public.store_compras ALTER COLUMN item_id DROP NOT NULL;

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
BEGIN
  IF NOT p_es_milestone AND p_costo_coins > 0 THEN
    IF NOT gastar_coins(v_user_id, p_costo_coins, 'Cofre ruleta 🎰') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
    END IF;
  END IF;

  SELECT id INTO v_item_id FROM store_items WHERE tipo = p_tipo_premio ORDER BY disponible DESC LIMIT 1;
  IF v_item_id IS NULL THEN
    SELECT id INTO v_item_id FROM store_items ORDER BY orden LIMIT 1;
  END IF;

  v_nota := CASE
    WHEN p_es_milestone THEN '🏆 Premio ruleta milestone: ' || p_nombre_premio
    ELSE '🎰 Premio cofre ruleta: ' || p_nombre_premio
  END;

  INSERT INTO store_compras (user_id, item_id, costo_coins, estado, notas_admin)
  VALUES (v_user_id, v_item_id, p_costo_coins, 'pendiente', v_nota)
  RETURNING id INTO v_compra_id;

  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
  SELECT p.id,
    '🎰 Premio ruleta pendiente',
    (SELECT nombre FROM profiles WHERE id = v_user_id LIMIT 1) || ' ganó en la ruleta: ' || p_nombre_premio,
    'sistema'
  FROM profiles p WHERE p.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_compras_tienda()
RETURNS TABLE(
  id UUID, user_id UUID, costo_coins INTEGER, estado TEXT,
  notas_admin TEXT, atendido_at TIMESTAMPTZ, created_at TIMESTAMPTZ,
  user_nombre TEXT, user_avatar TEXT,
  item_nombre TEXT, item_icono TEXT, item_tipo TEXT, item_descripcion TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    sc.id, sc.user_id, sc.costo_coins, sc.estado,
    sc.notas_admin, sc.atendido_at, sc.created_at,
    COALESCE(pr.nombre, 'Usuario') AS user_nombre,
    pr.avatar_url AS user_avatar,
    COALESCE(si.nombre, 'Premio Ruleta') AS item_nombre,
    COALESCE(si.icono, '🎁') AS item_icono,
    COALESCE(si.tipo, 'ruleta') AS item_tipo,
    si.descripcion AS item_descripcion
  FROM store_compras sc
  JOIN profiles pr ON pr.id = sc.user_id
  LEFT JOIN store_items si ON si.id = sc.item_id
  ORDER BY sc.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_compras_tienda TO authenticated;
