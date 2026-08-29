CREATE OR REPLACE FUNCTION public.registrar_premio_ruleta(p_tipo_premio text, p_nombre_premio text, p_costo_coins integer, p_es_milestone boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid(); v_item_id UUID; v_compra_id UUID; v_nota TEXT;
  v_asignacion JSONB; v_tipo_real TEXT := p_tipo_premio; v_nombre_real TEXT := p_nombre_premio;
  v_colores TEXT[]; v_acc JSONB; v_elegido TEXT;
BEGIN
  IF NOT p_es_milestone AND p_costo_coins > 0 THEN
    IF NOT gastar_coins(v_user_id, p_costo_coins, 'Cofre ruleta 🎁') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
    END IF;
  END IF;

  IF p_tipo_premio IN ('lead_premium', 'lead_meta')
     AND EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND no_leads_cofre) THEN
    UPDATE user_stats SET valera_coins = valera_coins + 200 WHERE id = v_user_id;
    INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
    VALUES (v_user_id, '🎁 Premio de cofre',
      'Te tocó un lead, pero tu cuenta no recibe leads de cofres. Te damos 200 Valera Coins en cambio.', 'ruleta');
    RETURN jsonb_build_object('ok', true, 'convertido', true, 'motivo', 'no_leads',
      'mensaje', '🎁 Tu cuenta no recibe leads de cofres. Te damos 200 Valera Coins en cambio.');
  END IF;

  IF p_tipo_premio = 'diseno_pro' THEN
    UPDATE user_stats SET disenos_tokens = disenos_tokens + 1 WHERE id = v_user_id;
    INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
    VALUES (v_user_id, '🎨 ¡Ganaste un diseño profesional!',
      'Tienes un token de diseño. Úsalo desde cualquier propiedad con el botón "Solicitar diseño".', 'ruleta');
    RETURN jsonb_build_object('ok', true, 'auto_desbloqueado', true);
  END IF;

  IF p_tipo_premio = 'acceso_prioritario' THEN
    v_acc := public.otorgar_acceso_prioritario(v_user_id);
    IF (v_acc->>'ok')::boolean THEN
      RETURN jsonb_build_object('ok', true, 'auto_desbloqueado', true, 'mensaje', v_acc->>'mensaje');
    END IF;
    UPDATE user_stats SET valera_coins = valera_coins + 500 WHERE id = v_user_id;
    INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
    VALUES (v_user_id, '🎁 Premio de cofre',
      COALESCE(v_acc->>'mensaje','Ya estás en lo más alto') || ' Te damos 500 Valera Coins en cambio.', 'ruleta');
    RETURN jsonb_build_object('ok', true, 'convertido', true, 'motivo', 'acceso_no_aplica',
      'mensaje', COALESCE(v_acc->>'mensaje','Ya estás en lo más alto 🏆') || ' Te damos 500 Valera Coins en cambio.');
  END IF;

  IF p_tipo_premio = 'patron_animado' THEN
    SELECT colores_desbloqueados INTO v_colores FROM profiles WHERE id = v_user_id;
    IF v_colores IS NOT NULL AND p_nombre_premio = ANY(v_colores) THEN
      UPDATE user_stats SET valera_coins = valera_coins + 300 WHERE id = v_user_id;
      RETURN jsonb_build_object('ok', true, 'convertido', true, 'motivo', 'patron_duplicado',
        'mensaje', '🎨 ¡Ya tienes este patrón! Te damos 300 Valera Coins en cambio.');
    END IF;
    UPDATE profiles SET colores_desbloqueados = array_append(COALESCE(colores_desbloqueados, ARRAY[]::TEXT[]), p_nombre_premio) WHERE id = v_user_id;
    INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
    VALUES (v_user_id, '🎨 ¡Patrón desbloqueado!',
      'Ganaste el patrón animado "' || p_nombre_premio || '" en el cofre. Ya puedes usarlo en tu perfil.', 'ruleta');
    RETURN jsonb_build_object('ok', true, 'auto_desbloqueado', true);
  END IF;

  -- pack_color: desbloquear AL AZAR un color que NO tenga (entrega automática, sin admin).
  IF p_tipo_premio = 'pack_color' THEN
    SELECT c INTO v_elegido
    FROM unnest(ARRAY['aurora','lava','ocean','forest','sunset','galaxy','rose','arctic','valera']) c
    WHERE NOT (c = ANY(COALESCE((SELECT colores_desbloqueados FROM profiles WHERE id = v_user_id), ARRAY[]::TEXT[])))
    ORDER BY random() LIMIT 1;
    IF v_elegido IS NULL THEN
      UPDATE user_stats SET valera_coins = valera_coins + 500 WHERE id = v_user_id;
      RETURN jsonb_build_object('ok', true, 'convertido', true, 'motivo', 'coleccion_colores_completa',
        'mensaje', '🎨 ¡Ya tienes todos los colores! Te damos 500 Valera Coins en cambio.');
    END IF;
    UPDATE profiles SET colores_desbloqueados = array_append(COALESCE(colores_desbloqueados, ARRAY[]::TEXT[]), v_elegido) WHERE id = v_user_id;
    INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
    VALUES (v_user_id, '🎨 ¡Color desbloqueado!',
      'Ganaste un color nuevo en el cofre. Ya puedes usarlo en tu perfil.', 'ruleta');
    RETURN jsonb_build_object('ok', true, 'auto_desbloqueado', true, 'tipo', 'pack_color', 'valor', v_elegido);
  END IF;

  -- pack_avatar: desbloquear AL AZAR un avatar que NO tenga (entrega automática).
  IF p_tipo_premio = 'pack_avatar' THEN
    SELECT a INTO v_elegido
    FROM unnest(ARRAY['🔥','⚡','🌈','🦋','🐉','🦄','👑','💫','🌸','🔮','🌊','🏆','🎉','✨','🦁','🐺']) a
    WHERE NOT (a = ANY(COALESCE((SELECT avatares_desbloqueados FROM profiles WHERE id = v_user_id), ARRAY[]::TEXT[])))
    ORDER BY random() LIMIT 1;
    IF v_elegido IS NULL THEN
      UPDATE user_stats SET valera_coins = valera_coins + 500 WHERE id = v_user_id;
      RETURN jsonb_build_object('ok', true, 'convertido', true, 'motivo', 'coleccion_avatares_completa',
        'mensaje', '✨ ¡Ya tienes todos los avatares! Te damos 500 Valera Coins en cambio.');
    END IF;
    UPDATE profiles SET avatares_desbloqueados = array_append(COALESCE(avatares_desbloqueados, ARRAY[]::TEXT[]), v_elegido) WHERE id = v_user_id;
    INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
    VALUES (v_user_id, '✨ ¡Avatar desbloqueado!',
      'Ganaste un avatar animado nuevo en el cofre. Ya puedes usarlo en tu perfil.', 'ruleta');
    RETURN jsonb_build_object('ok', true, 'auto_desbloqueado', true, 'tipo', 'pack_avatar', 'valor', v_elegido);
  END IF;

  SELECT id INTO v_item_id FROM store_items WHERE tipo = v_tipo_real ORDER BY disponible DESC LIMIT 1;
  IF v_item_id IS NULL THEN SELECT id INTO v_item_id FROM store_items ORDER BY orden LIMIT 1; END IF;

  v_nota := CASE WHEN p_es_milestone THEN '🏆 Premio ruleta milestone: ' || v_nombre_real
                 ELSE '🎁 Premio cofre ruleta: ' || v_nombre_real END;

  INSERT INTO store_compras (user_id, item_id, costo_coins, estado, notas_admin)
  VALUES (v_user_id, v_item_id, p_costo_coins, 'pendiente', v_nota) RETURNING id INTO v_compra_id;

  IF v_tipo_real IN ('lead_premium', 'lead_meta') THEN
    v_asignacion := public.asignar_lead_desde_pool(v_user_id, v_compra_id, 'cofre_' || v_tipo_real);
    IF (v_asignacion->>'ok')::BOOLEAN THEN
      UPDATE store_compras SET estado = 'entregado', atendido_at = NOW() WHERE id = v_compra_id;
    ELSE
      INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
      SELECT p.id, '📭 Pool de leads vacío',
        'Un usuario ganó un lead en el cofre pero el pool está vacío. Agrega leads urgentemente.', 'sistema'
      FROM profiles p WHERE p.role = 'admin';
    END IF;
    RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id, 'lead_asignado', v_asignacion);
  END IF;

  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
  SELECT p.id, '🎁 Premio ruleta pendiente',
    COALESCE((SELECT nombre FROM profiles WHERE id = v_user_id LIMIT 1), 'Un usuario') || ' ganó en la ruleta: ' || v_nombre_real, 'ruleta'
  FROM profiles p WHERE p.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id);
END;
$function$;
