CREATE OR REPLACE FUNCTION public.comprar_item_tienda(p_item_id uuid, p_nombre text, p_costo integer, p_valor text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_nombre TEXT; v_compra_id UUID; v_saldo INTEGER; v_item_tipo TEXT;
  v_asignacion JSONB; v_tiene BOOLEAN := false; v_rol TEXT; v_acc JSONB;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;

  SELECT tipo INTO v_item_tipo FROM public.store_items WHERE id = p_item_id;

  IF v_item_tipo IN ('lead_premium', 'lead_meta') THEN
    IF NOT EXISTS (SELECT 1 FROM public.leads_pool WHERE estado = 'disponible' LIMIT 1) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'No hay leads disponibles en este momento. El equipo está cargando más muy pronto.');
    END IF;
  END IF;

  IF v_item_tipo IN ('pack_avatar', 'pack_color') THEN
    IF p_valor IS NULL OR btrim(p_valor) = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes todos los de esta categoría 🎉');
    END IF;
    IF v_item_tipo = 'pack_color' THEN
      SELECT p_valor = ANY(colores_desbloqueados) INTO v_tiene FROM profiles WHERE id = v_user_id;
    ELSE
      SELECT p_valor = ANY(avatares_desbloqueados) INTO v_tiene FROM profiles WHERE id = v_user_id;
    END IF;
    IF v_tiene THEN RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes ese item, intenta de nuevo'); END IF;
  END IF;

  IF v_item_tipo = 'acceso_prioritario' THEN
    SELECT role INTO v_rol FROM profiles WHERE id = v_user_id;
    IF v_rol IN ('asesor','supervisor','admin') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El acceso prioritario es solo para prospectadores. No se te cobró.');
    END IF;
    IF v_rol = 'prospectador_plus' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Ya estás en el nivel más alto (Plus) 🏆. No se te cobró.');
    END IF;
  END IF;

  SELECT valera_coins INTO v_saldo FROM public.user_stats WHERE id = v_user_id FOR UPDATE;
  IF v_saldo IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Perfil de usuario no encontrado'); END IF;
  IF v_saldo < p_costo THEN RETURN jsonb_build_object('ok', false, 'error', 'No tienes suficientes Valera Coins'); END IF;

  UPDATE public.user_stats SET valera_coins = valera_coins - p_costo WHERE id = v_user_id;
  INSERT INTO public.coin_transactions (user_id, cantidad, concepto) VALUES (v_user_id, -p_costo, 'Tienda: ' || p_nombre);
  INSERT INTO public.store_compras (user_id, item_id, costo_coins) VALUES (v_user_id, p_item_id, p_costo) RETURNING id INTO v_compra_id;

  v_user_nombre := COALESCE((SELECT nombre FROM public.profiles WHERE id = v_user_id), 'Un prospectador');

  IF v_item_tipo IN ('lead_premium', 'lead_meta') THEN
    v_asignacion := public.asignar_lead_desde_pool(v_user_id, v_compra_id, 'tienda_' || v_item_tipo);
    UPDATE public.store_compras SET estado = 'entregado', atendido_at = NOW() WHERE id = v_compra_id;
    RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id, 'lead_asignado', v_asignacion);
  END IF;

  IF v_item_tipo IN ('pack_avatar', 'pack_color') THEN
    IF v_item_tipo = 'pack_color' THEN
      UPDATE profiles SET colores_desbloqueados = array_append(colores_desbloqueados, p_valor) WHERE id = v_user_id;
    ELSE
      UPDATE profiles SET avatares_desbloqueados = array_append(avatares_desbloqueados, p_valor) WHERE id = v_user_id;
    END IF;
    UPDATE public.store_compras SET estado = 'entregado', atendido_at = NOW(), notas_admin = p_valor WHERE id = v_compra_id;
    RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id, 'entregado', true, 'tipo', v_item_tipo, 'valor', p_valor);
  END IF;

  -- Diseño Profesional (tipo plantilla): entrega automática de un token de diseño,
  -- el mismo que usa el botón "Solicitar diseño" dentro de las propiedades.
  IF v_item_tipo = 'plantilla' THEN
    UPDATE public.user_stats SET disenos_tokens = disenos_tokens + 1 WHERE id = v_user_id;
    UPDATE public.store_compras SET estado = 'entregado', atendido_at = NOW(), notas_admin = 'Token de diseño profesional' WHERE id = v_compra_id;
    RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id, 'entregado', true, 'tipo', 'plantilla',
      'mensaje', '🎨 ¡Listo! Tienes un token de diseño profesional. Úsalo desde cualquier propiedad con el botón "Solicitar diseño".');
  END IF;

  IF v_item_tipo = 'acceso_prioritario' THEN
    v_acc := public.otorgar_acceso_prioritario(v_user_id);
    UPDATE public.store_compras SET estado = 'entregado', atendido_at = NOW(),
      notas_admin = COALESCE(v_acc->>'mensaje','Acceso prioritario') WHERE id = v_compra_id;
    RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id, 'entregado', true,
      'tipo', v_item_tipo, 'mensaje', v_acc->>'mensaje');
  END IF;

  INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo)
  SELECT pr.id, 'Nueva compra en la Tienda 🛒',
    v_user_nombre || ' canjeó "' || p_nombre || '" por ' || p_costo || ' Valera Coins. Pendiente de entrega.', 'tienda'
  FROM public.profiles pr WHERE pr.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id);
END;
$function$;
