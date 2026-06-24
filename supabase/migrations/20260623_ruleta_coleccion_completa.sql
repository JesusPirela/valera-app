-- Cuando el cofre da pack_color o pack_avatar y el usuario ya tiene toda la
-- colección desbloqueada, convertir el premio a 500 coins automáticamente.
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
  v_user_id      UUID := auth.uid();
  v_item_id      UUID;
  v_compra_id    UUID;
  v_nota         TEXT;
  v_asignacion   JSONB;
  v_n_colores    INT;
  v_n_avatares   INT;
  v_tipo_real    TEXT := p_tipo_premio;
  v_nombre_real  TEXT := p_nombre_premio;
BEGIN
  -- Descontar coins si es cofre pagado
  IF NOT p_es_milestone AND p_costo_coins > 0 THEN
    IF NOT gastar_coins(v_user_id, p_costo_coins, 'Cofre ruleta 🎰') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
    END IF;
  END IF;

  -- ── Conversión automática si colección completa ────────────────────────────
  IF p_tipo_premio = 'pack_color' THEN
    SELECT array_length(colores_desbloqueados, 1)
    INTO v_n_colores FROM profiles WHERE id = v_user_id;

    IF COALESCE(v_n_colores, 0) >= 12 THEN
      -- Colección de colores completa → dar 500 coins extra
      UPDATE user_stats SET valera_coins = valera_coins + 500 WHERE id = v_user_id;
      RETURN jsonb_build_object(
        'ok', true,
        'convertido', true,
        'motivo', 'coleccion_colores_completa',
        'mensaje', '🎨 ¡Ya tienes todos los colores! Te damos 500 Valera Coins en cambio.'
      );
    END IF;
  END IF;

  IF p_tipo_premio = 'pack_avatar' THEN
    SELECT array_length(avatares_desbloqueados, 1)
    INTO v_n_avatares FROM profiles WHERE id = v_user_id;

    IF COALESCE(v_n_avatares, 0) >= 16 THEN
      -- Colección de avatares completa → dar 500 coins extra
      UPDATE user_stats SET valera_coins = valera_coins + 500 WHERE id = v_user_id;
      RETURN jsonb_build_object(
        'ok', true,
        'convertido', true,
        'motivo', 'coleccion_avatares_completa',
        'mensaje', '✨ ¡Ya tienes todos los avatares! Te damos 500 Valera Coins en cambio.'
      );
    END IF;
  END IF;
  -- ──────────────────────────────────────────────────────────────────────────

  -- Buscar item de tienda correspondiente
  SELECT id INTO v_item_id
  FROM store_items
  WHERE tipo = v_tipo_real
  ORDER BY disponible DESC
  LIMIT 1;

  IF v_item_id IS NULL THEN
    SELECT id INTO v_item_id FROM store_items ORDER BY orden LIMIT 1;
  END IF;

  v_nota := CASE
    WHEN p_es_milestone THEN '🏆 Premio ruleta milestone: ' || v_nombre_real
    ELSE '🎰 Premio cofre ruleta: ' || v_nombre_real
  END;

  -- Crear compra (historial)
  INSERT INTO store_compras (user_id, item_id, costo_coins, estado, notas_admin)
  VALUES (v_user_id, v_item_id, p_costo_coins, 'pendiente', v_nota)
  RETURNING id INTO v_compra_id;

  -- Auto-asignación para leads
  IF v_tipo_real IN ('lead_premium', 'lead_meta') THEN
    v_asignacion := public.asignar_lead_desde_pool(v_user_id, v_compra_id, 'cofre_' || v_tipo_real);

    IF (v_asignacion->>'ok')::BOOLEAN THEN
      UPDATE store_compras SET estado = 'entregado', atendido_at = NOW() WHERE id = v_compra_id;
    ELSE
      INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
      SELECT p.id,
        '🚨 Pool de leads vacío',
        'Un usuario ganó un lead en el cofre pero el pool está vacío. Agrega leads urgentemente.',
        'sistema'
      FROM profiles p WHERE p.role = 'admin';
    END IF;

    RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id, 'lead_asignado', v_asignacion);
  END IF;

  -- Otros premios: notificar admins
  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
  SELECT p.id,
    '🎰 Premio ruleta pendiente',
    (SELECT nombre FROM profiles WHERE id = v_user_id LIMIT 1) || ' ganó en la ruleta: ' || v_nombre_real,
    'sistema'
  FROM profiles p WHERE p.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_premio_ruleta TO authenticated;
