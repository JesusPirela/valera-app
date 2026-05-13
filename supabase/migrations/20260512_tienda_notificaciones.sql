-- ══════════════════════════════════════════════════════════════
-- TIENDA — notificaciones y gestión de entregas
-- ══════════════════════════════════════════════════════════════

-- Columnas adicionales en store_compras
ALTER TABLE public.store_compras
  ADD COLUMN IF NOT EXISTS estado         TEXT NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS notas_admin    TEXT,
  ADD COLUMN IF NOT EXISTS atendido_por   UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS atendido_at    TIMESTAMPTZ;

-- Admin puede actualizar compras (para marcar como entregado)
CREATE POLICY "store_compras_admin_update" ON public.store_compras
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Notificar a todos los admins cuando alguien compra en la tienda ──
CREATE OR REPLACE FUNCTION public.notificar_admins_compra_tienda(
  p_user_id     UUID,
  p_user_nombre TEXT,
  p_item_nombre TEXT,
  p_compra_id   UUID,
  p_costo_coins INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo)
  SELECT
    pr.id,
    'Nueva compra en la Tienda 🛒',
    p_user_nombre || ' canjeó "' || p_item_nombre || '" por ' || p_costo_coins || ' Valera Coins. Pendiente de entrega.',
    'tienda'
  FROM public.profiles pr
  WHERE pr.role = 'admin';
END;
$$;
GRANT EXECUTE ON FUNCTION public.notificar_admins_compra_tienda TO authenticated;

-- ── Admin entrega recompensa: marca compra + notifica usuario ──
CREATE OR REPLACE FUNCTION public.admin_entregar_recompensa(
  p_compra_id UUID,
  p_user_id   UUID,
  p_mensaje   TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.store_compras
  SET
    estado       = 'entregado',
    notas_admin  = p_mensaje,
    atendido_por = auth.uid(),
    atendido_at  = NOW()
  WHERE id = p_compra_id;

  INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo)
  VALUES (p_user_id, '¡Tu recompensa está lista! 🎁', p_mensaje, 'tienda');
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_entregar_recompensa TO authenticated;

-- ── Admin registra un lead para un prospectador ──
CREATE OR REPLACE FUNCTION public.admin_registrar_lead(
  p_compra_id      UUID,
  p_responsable_id UUID,
  p_nombre         TEXT,
  p_telefono       TEXT,
  p_fuente         TEXT DEFAULT 'marketplace'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.clientes (nombre, telefono, fuente_lead, estado, responsable_id, tipo_operacion)
  VALUES (p_nombre, p_telefono, p_fuente, 'por_perfilar', p_responsable_id, 'venta')
  RETURNING id INTO v_cliente_id;

  INSERT INTO public.notificaciones (user_id, cliente_id, titulo, mensaje, tipo)
  VALUES (
    p_responsable_id,
    v_cliente_id,
    '¡Nuevo lead registrado para ti! 👤',
    'Te registramos un nuevo cliente: ' || p_nombre || ' — Tel: ' || p_telefono || '. Ya está en tu CRM listo para trabajar.',
    'tienda'
  );

  UPDATE public.store_compras
  SET
    estado       = 'entregado',
    atendido_por = auth.uid(),
    atendido_at  = NOW()
  WHERE id = p_compra_id;

  RETURN v_cliente_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_registrar_lead TO authenticated;
