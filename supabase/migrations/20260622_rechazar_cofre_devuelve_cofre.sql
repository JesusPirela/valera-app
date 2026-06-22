-- Cuando el admin rechaza un premio de cofre (es_ruleta=TRUE o costo_coins=0),
-- devuelve el cofre al usuario (cofres_pendientes + 1) en lugar de reintegrar
-- coins (que siempre son 0 para cofres). Las compras normales de tienda no cambian.

CREATE OR REPLACE FUNCTION public.admin_rechazar_compra(
  p_compra_id UUID,
  p_motivo    TEXT DEFAULT 'Solicitud rechazada por el administrador.'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_compra   RECORD;
  v_es_cofre BOOLEAN;
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

  v_es_cofre := (v_compra.es_ruleta = TRUE OR v_compra.costo_coins = 0);

  -- Marcar como rechazado (aplica a ambos casos)
  UPDATE public.store_compras
  SET estado       = 'rechazado',
      notas_admin  = p_motivo,
      atendido_por = auth.uid(),
      atendido_at  = NOW()
  WHERE id = p_compra_id;

  IF v_es_cofre THEN
    -- Devolver el cofre al usuario para que pueda abrirlo de nuevo
    INSERT INTO public.user_stats (id, cofres_pendientes)
    VALUES (v_compra.user_id, 1)
    ON CONFLICT (id) DO UPDATE
      SET cofres_pendientes = public.user_stats.cofres_pendientes + 1;

    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo)
    VALUES (
      v_compra.user_id,
      'Premio de cofre no procesado',
      p_motivo || ' Tu cofre ha sido devuelto y puedes abrirlo de nuevo.',
      'cofre'
    );
  ELSE
    -- Compra normal: reintegrar los Valera Coins
    UPDATE public.user_stats
    SET valera_coins = valera_coins + v_compra.costo_coins
    WHERE id = v_compra.user_id;

    INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
    VALUES (
      v_compra.user_id,
      v_compra.costo_coins,
      'Reembolso: ' || COALESCE(v_compra.item_nombre, 'artículo')
    );

    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo)
    VALUES (
      v_compra.user_id,
      'Solicitud de tienda no procesada',
      p_motivo || ' Tus ' || v_compra.costo_coins || ' Valera Coins han sido reintegrados.',
      'tienda'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rechazar_compra(UUID, TEXT) TO authenticated;
