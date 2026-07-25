-- El patrón "Valera" cuesta 100 Valera Coins (los demás siguen en 300).
-- El precio lo decide el SERVIDOR; el cliente solo lo muestra.
CREATE OR REPLACE FUNCTION public.desbloquear_item_perfil(p_tipo text, p_valor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_costo INT := 300;
  v_coins INT;
  v_tiene BOOLEAN := false;
  v_item_id UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;

  -- Precio especial del patrón de la marca.
  IF p_tipo = 'color' AND p_valor = 'valera' THEN v_costo := 100; END IF;

  IF p_tipo = 'color' THEN
    SELECT p_valor = ANY(colores_desbloqueados) INTO v_tiene FROM profiles WHERE id = v_uid;
  ELSE
    SELECT p_valor = ANY(avatares_desbloqueados) INTO v_tiene FROM profiles WHERE id = v_uid;
  END IF;
  IF v_tiene THEN RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes este item desbloqueado'); END IF;

  SELECT valera_coins INTO v_coins FROM user_stats WHERE id = v_uid;
  IF COALESCE(v_coins, 0) < v_costo THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes suficientes Valera Coins (necesitas ' || v_costo || ')');
  END IF;

  UPDATE user_stats SET valera_coins = valera_coins - v_costo WHERE id = v_uid;
  IF p_tipo = 'color' THEN
    UPDATE profiles SET colores_desbloqueados = array_append(colores_desbloqueados, p_valor) WHERE id = v_uid;
  ELSE
    UPDATE profiles SET avatares_desbloqueados = array_append(avatares_desbloqueados, p_valor) WHERE id = v_uid;
  END IF;

  SELECT id INTO v_item_id FROM store_items WHERE tipo = 'pack_' || p_tipo LIMIT 1;
  IF v_item_id IS NOT NULL THEN
    INSERT INTO store_compras (user_id, item_id, costo_coins, estado, notas_admin)
    VALUES (v_uid, v_item_id, v_costo, 'entregado', p_valor);
  END IF;

  RETURN jsonb_build_object('ok', true, 'coins_restantes', v_coins - v_costo);
END;
$function$;
