-- Corrige admin_entregar_recompensa para que realmente desbloquee colores y avatares.
-- El front-end siempre pasó p_valor con el id del patrón o emoji del avatar,
-- pero la función original (20260512) lo ignoraba por completo.
CREATE OR REPLACE FUNCTION public.admin_entregar_recompensa(
  p_compra_id UUID,
  p_user_id   UUID,
  p_mensaje   TEXT,
  p_valor     TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_tipo TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Obtener el tipo del item para saber qué desbloquear
  SELECT si.tipo INTO v_item_tipo
  FROM public.store_compras sc
  JOIN public.store_items si ON si.id = sc.item_id
  WHERE sc.id = p_compra_id;

  -- Desbloquear color/patrón animado
  IF v_item_tipo = 'pack_color' AND p_valor IS NOT NULL THEN
    UPDATE public.profiles
    SET colores_desbloqueados = array_append(
      COALESCE(colores_desbloqueados, ARRAY[]::TEXT[]),
      p_valor
    )
    WHERE id = p_user_id
      AND NOT (p_valor = ANY(COALESCE(colores_desbloqueados, ARRAY[]::TEXT[])));
  END IF;

  -- Desbloquear avatar animado
  IF v_item_tipo = 'pack_avatar' AND p_valor IS NOT NULL THEN
    UPDATE public.profiles
    SET avatares_desbloqueados = array_append(
      COALESCE(avatares_desbloqueados, ARRAY[]::TEXT[]),
      p_valor
    )
    WHERE id = p_user_id
      AND NOT (p_valor = ANY(COALESCE(avatares_desbloqueados, ARRAY[]::TEXT[])));
  END IF;

  -- Marcar compra como entregada
  UPDATE public.store_compras
  SET
    estado       = 'entregado',
    notas_admin  = p_mensaje,
    atendido_por = auth.uid(),
    atendido_at  = NOW()
  WHERE id = p_compra_id;

  -- Notificar al usuario
  INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo)
  VALUES (p_user_id, '¡Tu recompensa está lista! 🎁', p_mensaje, 'tienda');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_entregar_recompensa(UUID, UUID, TEXT, TEXT) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
