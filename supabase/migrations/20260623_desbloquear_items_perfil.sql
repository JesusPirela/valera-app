-- Columnas para rastrear exactamente qué colores y avatares ha desbloqueado cada usuario.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS colores_desbloqueados TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avatares_desbloqueados TEXT[] NOT NULL DEFAULT '{}';

-- RPC: compra y desbloquea un color o avatar específico (auto-entregado, sin admin).
-- p_tipo: 'color' | 'avatar'
-- p_valor: el hex (#c2185b) o el emoji (🔥) a desbloquear
CREATE OR REPLACE FUNCTION public.desbloquear_item_perfil(
  p_tipo  TEXT,
  p_valor TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_costo  INT  := 500;
  v_coins  INT;
  v_tiene  BOOLEAN := false;
  v_item_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- ¿Ya lo tiene?
  IF p_tipo = 'color' THEN
    SELECT p_valor = ANY(colores_desbloqueados) INTO v_tiene FROM profiles WHERE id = v_uid;
  ELSE
    SELECT p_valor = ANY(avatares_desbloqueados) INTO v_tiene FROM profiles WHERE id = v_uid;
  END IF;
  IF v_tiene THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes este item desbloqueado');
  END IF;

  -- Verificar coins
  SELECT valera_coins INTO v_coins FROM user_stats WHERE id = v_uid;
  IF COALESCE(v_coins, 0) < v_costo THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes suficientes Valera Coins (necesitas 500)');
  END IF;

  -- Descontar coins
  UPDATE user_stats SET valera_coins = valera_coins - v_costo WHERE id = v_uid;

  -- Agregar al perfil
  IF p_tipo = 'color' THEN
    UPDATE profiles SET colores_desbloqueados = array_append(colores_desbloqueados, p_valor) WHERE id = v_uid;
  ELSE
    UPDATE profiles SET avatares_desbloqueados = array_append(avatares_desbloqueados, p_valor) WHERE id = v_uid;
  END IF;

  -- Registrar en historial (auto-entregado, no requiere acción del admin)
  SELECT id INTO v_item_id FROM store_items WHERE tipo = 'pack_' || p_tipo LIMIT 1;
  IF v_item_id IS NOT NULL THEN
    INSERT INTO store_compras (user_id, item_id, costo_coins, estado, notas_admin)
    VALUES (v_uid, v_item_id, v_costo, 'entregado', p_valor);
  END IF;

  RETURN jsonb_build_object('ok', true, 'coins_restantes', v_coins - v_costo);
END;
$$;
