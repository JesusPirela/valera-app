-- Fix: las recompensas de ruleta desaparecen porque la detección depende de notas_admin,
-- que se sobreescribe cuando el admin entrega la recompensa.
-- Solución: columnas dedicadas es_ruleta, es_milestone, nombre_premio en store_compras.

ALTER TABLE public.store_compras
  ADD COLUMN IF NOT EXISTS es_ruleta    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS es_milestone BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nombre_premio TEXT;

-- Backfill de premios ya existentes
UPDATE public.store_compras
SET
  es_ruleta    = TRUE,
  es_milestone = (notas_admin LIKE '%milestone%'),
  nombre_premio = (regexp_match(notas_admin, '(?:Premio cofre ruleta|Premio ruleta milestone): (.+)'))[1]
WHERE notas_admin LIKE '%Premio cofre ruleta%'
   OR notas_admin LIKE '%Premio ruleta milestone%';

-- Función actualizada: inserta con columnas dedicadas
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
BEGIN
  IF NOT p_es_milestone AND p_costo_coins > 0 THEN
    IF NOT gastar_coins(v_user_id, p_costo_coins, 'Cofre ruleta 🎰') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
    END IF;
  END IF;

  SELECT id INTO v_item_id
  FROM store_items WHERE tipo = p_tipo_premio ORDER BY disponible DESC LIMIT 1;

  INSERT INTO store_compras (
    user_id, item_id, costo_coins, estado,
    es_ruleta, es_milestone, nombre_premio
  )
  VALUES (
    v_user_id, v_item_id, p_costo_coins, 'pendiente',
    TRUE, p_es_milestone, p_nombre_premio
  )
  RETURNING id INTO v_compra_id;

  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
  SELECT p.id,
    '🎰 Premio ruleta pendiente',
    (SELECT nombre FROM profiles WHERE id = v_user_id LIMIT 1) || ' ganó en la ruleta: ' || p_nombre_premio,
    'ruleta'
  FROM profiles p WHERE p.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id);
END;
$$;

-- get_compras_tienda actualizada: retorna columnas dedicadas + seguridad admin
-- Usa LANGUAGE sql para evitar ambigüedad de OUT parameters con columnas del SELECT
DROP FUNCTION IF EXISTS public.get_compras_tienda();

CREATE OR REPLACE FUNCTION public.get_compras_tienda()
RETURNS TABLE(
  id UUID, user_id UUID, costo_coins INTEGER, estado TEXT,
  notas_admin TEXT, atendido_at TIMESTAMPTZ, created_at TIMESTAMPTZ,
  user_nombre TEXT, user_avatar TEXT,
  item_nombre TEXT, item_icono TEXT, item_tipo TEXT, item_descripcion TEXT,
  es_ruleta BOOLEAN, es_milestone BOOLEAN, nombre_premio TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    sc.id,
    sc.user_id,
    sc.costo_coins,
    sc.estado,
    sc.notas_admin,
    sc.atendido_at,
    sc.created_at,
    COALESCE(pr.nombre, 'Usuario')                                          AS user_nombre,
    pr.avatar_url                                                            AS user_avatar,
    COALESCE(si.nombre, sc.nombre_premio, 'Premio Ruleta')                  AS item_nombre,
    COALESCE(si.icono, CASE WHEN sc.es_milestone THEN '🏆' ELSE '🎰' END)  AS item_icono,
    COALESCE(si.tipo, CASE WHEN sc.es_ruleta THEN 'ruleta' ELSE 'otro' END) AS item_tipo,
    si.descripcion                                                           AS item_descripcion,
    sc.es_ruleta,
    sc.es_milestone,
    sc.nombre_premio
  FROM store_compras sc
  JOIN profiles pr ON pr.id = sc.user_id
  LEFT JOIN store_items si ON si.id = sc.item_id
  WHERE EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
  ORDER BY sc.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_premio_ruleta TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_compras_tienda        TO authenticated;
