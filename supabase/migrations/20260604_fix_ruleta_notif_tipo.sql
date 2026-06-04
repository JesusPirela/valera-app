-- Fix: registrar_premio_ruleta usaba tipo='sistema' que no estaba en el check constraint
-- Se agrega 'ruleta' al constraint y se actualiza la función

ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio',
    'nuevo_cliente','login','tienda','ruleta'
  ]));

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
    'ruleta'
  FROM profiles p WHERE p.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id);
END;
$$;
