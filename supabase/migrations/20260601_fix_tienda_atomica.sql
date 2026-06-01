-- ── 1. Compra atómica: todo en una transacción ────────────────
-- Reemplaza el flujo fragmentado en gamification.ts donde los coins
-- se podían descontar pero el registro de compra fallaba silenciosamente.
CREATE OR REPLACE FUNCTION public.comprar_item_tienda(
  p_item_id UUID,
  p_nombre  TEXT,
  p_costo   INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_user_nombre TEXT;
  v_compra_id   UUID;
  v_saldo       INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- Bloquear fila para evitar race conditions
  SELECT valera_coins INTO v_saldo
  FROM public.user_stats
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_saldo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil de usuario no encontrado');
  END IF;

  IF v_saldo < p_costo THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes suficientes Valera Coins');
  END IF;

  -- Descontar coins
  UPDATE public.user_stats
  SET valera_coins = valera_coins - p_costo
  WHERE id = v_user_id;

  -- Registrar transacción
  INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
  VALUES (v_user_id, -p_costo, 'Tienda: ' || p_nombre);

  -- Crear registro de compra
  INSERT INTO public.store_compras (user_id, item_id, costo_coins)
  VALUES (v_user_id, p_item_id, p_costo)
  RETURNING id INTO v_compra_id;

  -- Nombre del usuario para la notificación
  SELECT COALESCE(nombre, 'Un prospectador') INTO v_user_nombre
  FROM public.profiles WHERE id = v_user_id;

  -- Notificar a todos los admins
  INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo)
  SELECT pr.id,
    'Nueva compra en la Tienda 🛒',
    v_user_nombre || ' canjeó "' || p_nombre || '" por ' || p_costo || ' Valera Coins. Pendiente de entrega.',
    'tienda'
  FROM public.profiles pr
  WHERE pr.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.comprar_item_tienda TO authenticated;


-- ── 2. Panel admin: listar todas las compras ──────────────────
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
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    sc.id,
    sc.user_id,
    sc.costo_coins,
    sc.estado,
    sc.notas_admin,
    sc.atendido_at,
    sc.created_at,
    COALESCE(p.nombre, 'Usuario desconocido')::TEXT AS user_nombre,
    p.avatar_url::TEXT                              AS user_avatar,
    COALESCE(si.nombre, 'Artículo eliminado')::TEXT AS item_nombre,
    COALESCE(si.icono, '🎁')::TEXT                  AS item_icono,
    COALESCE(si.tipo, 'otro')::TEXT                 AS item_tipo,
    si.descripcion::TEXT                            AS item_descripcion
  FROM public.store_compras sc
  LEFT JOIN public.profiles    p  ON p.id  = sc.user_id
  LEFT JOIN public.store_items si ON si.id = sc.item_id
  ORDER BY sc.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_compras_tienda() TO authenticated;


-- ── 3. Asegurar columna estado con valor 'rechazado' ──────────
-- El admin panel usa 'rechazado' pero la columna solo tenía 'pendiente'/'entregado'
ALTER TABLE public.store_compras
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'pendiente';

-- RPC para rechazar una compra (devuelve los coins al usuario)
CREATE OR REPLACE FUNCTION public.admin_rechazar_compra(
  p_compra_id UUID,
  p_motivo    TEXT DEFAULT 'Solicitud rechazada por el administrador.'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_compra   RECORD;
  v_item_nom TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Access denied'; END IF;

  SELECT sc.*, si.nombre AS item_nombre
  INTO v_compra
  FROM public.store_compras sc
  LEFT JOIN public.store_items si ON si.id = sc.item_id
  WHERE sc.id = p_compra_id AND sc.estado = 'pendiente';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada o ya procesada';
  END IF;

  -- Devolver los coins
  UPDATE public.user_stats
  SET valera_coins = valera_coins + v_compra.costo_coins
  WHERE id = v_compra.user_id;

  INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
  VALUES (v_compra.user_id, v_compra.costo_coins, 'Reembolso: ' || COALESCE(v_compra.item_nombre, 'artículo'));

  -- Marcar como rechazado
  UPDATE public.store_compras
  SET estado       = 'rechazado',
      notas_admin  = p_motivo,
      atendido_por = auth.uid(),
      atendido_at  = NOW()
  WHERE id = p_compra_id;

  -- Notificar al usuario
  INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo)
  VALUES (
    v_compra.user_id,
    'Solicitud de tienda no procesada',
    p_motivo || ' Tus ' || v_compra.costo_coins || ' Valera Coins han sido reintegrados.',
    'tienda'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rechazar_compra TO authenticated;
