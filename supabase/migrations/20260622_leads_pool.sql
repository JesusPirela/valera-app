-- ══════════════════════════════════════════════════════════════════════════════
-- LEADS POOL — inventario de leads con asignación automática
-- Los leads se asignan al instante cuando un usuario compra Lead Premium /
-- Lead Meta Ads en la tienda, o cuando le sale uno de esos premios en el cofre.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Tabla ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads_pool (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             TEXT,
  telefono           TEXT        NOT NULL,
  zona_interes       TEXT,
  nota               TEXT,
  estado             TEXT        NOT NULL DEFAULT 'disponible'
                                 CHECK (estado IN ('disponible', 'asignado')),
  -- Asignación
  asignado_a         UUID        REFERENCES public.profiles(id),
  asignado_at        TIMESTAMPTZ,
  cliente_id         UUID        REFERENCES public.clientes(id),
  fuente_asignacion  TEXT,
  compra_id          UUID        REFERENCES public.store_compras(id),
  -- Auditoría
  created_by         UUID        REFERENCES public.profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_pool_estado   ON public.leads_pool(estado);
CREATE INDEX IF NOT EXISTS idx_leads_pool_asignado ON public.leads_pool(asignado_a);

ALTER TABLE public.leads_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_pool_admin_all" ON public.leads_pool
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- ── 2. RPC interna: asignar un lead desde el pool ─────────────────────────────
-- SECURITY DEFINER → la llaman comprar_item_tienda y registrar_premio_ruleta
CREATE OR REPLACE FUNCTION public.asignar_lead_desde_pool(
  p_user_id   UUID,
  p_compra_id UUID,
  p_fuente    TEXT   -- 'tienda_lead_premium' | 'tienda_lead_meta' | 'cofre_lead_premium' | 'cofre_lead_meta'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lead        RECORD;
  v_cliente_id  UUID;
  v_pool_count  INT;
BEGIN
  -- Tomar el lead más antiguo disponible; SKIP LOCKED evita race conditions
  SELECT * INTO v_lead
  FROM public.leads_pool
  WHERE estado = 'disponible'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'razon', 'pool_vacio');
  END IF;

  -- Crear cliente en CRM
  INSERT INTO public.clientes (
    nombre, telefono, fuente_lead, estado, responsable_id, notas, zona_busqueda
  )
  VALUES (
    COALESCE(v_lead.nombre, 'Lead'),
    v_lead.telefono,
    p_fuente,
    'por_perfilar',
    p_user_id,
    v_lead.nota,
    v_lead.zona_interes
  )
  RETURNING id INTO v_cliente_id;

  -- Interacción de auditoría
  INSERT INTO public.interacciones (cliente_id, user_id, tipo, descripcion)
  VALUES (v_cliente_id, p_user_id, 'nota', 'Lead asignado automáticamente desde el pool de leads.');

  -- Marcar lead como asignado
  UPDATE public.leads_pool SET
    estado            = 'asignado',
    asignado_a        = p_user_id,
    asignado_at       = NOW(),
    cliente_id        = v_cliente_id,
    fuente_asignacion = p_fuente,
    compra_id         = p_compra_id
  WHERE id = v_lead.id;

  -- Notificar al usuario
  INSERT INTO public.notificaciones (user_id, cliente_id, titulo, mensaje, tipo)
  VALUES (
    p_user_id,
    v_cliente_id,
    '¡Tienes un nuevo lead! 🔥',
    'Te asignamos un lead: ' ||
      CASE WHEN v_lead.nombre IS NOT NULL THEN v_lead.nombre || ' — ' ELSE '' END ||
      'Tel: ' || v_lead.telefono ||
      CASE WHEN v_lead.zona_interes IS NOT NULL THEN ' · Zona: ' || v_lead.zona_interes ELSE '' END ||
      '. Ya está en tu CRM listo para trabajar.',
    'lead_caliente'
  );

  -- Alerta a admins si el pool queda en menos de 3
  SELECT COUNT(*) INTO v_pool_count
  FROM public.leads_pool WHERE estado = 'disponible';

  IF v_pool_count < 3 THEN
    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo)
    SELECT p.id,
      '⚠️ Pool de leads bajo (' || v_pool_count || ' restantes)',
      'Quedan solo ' || v_pool_count || ' lead(s) disponibles en el pool. Agrega más para cubrir las próximas solicitudes.',
      'sistema'
    FROM public.profiles p
    WHERE p.role = 'admin';
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'cliente_id',   v_cliente_id,
    'lead_nombre',  v_lead.nombre,
    'lead_telefono', v_lead.telefono
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.asignar_lead_desde_pool TO authenticated;

-- ── 3. Reemplazar comprar_item_tienda con soporte de auto-asignación ──────────
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
  v_item_tipo   TEXT;
  v_asignacion  JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- Tipo del item
  SELECT tipo INTO v_item_tipo FROM public.store_items WHERE id = p_item_id;

  -- Si es lead, verificar pool ANTES de cobrar coins
  IF v_item_tipo IN ('lead_premium', 'lead_meta') THEN
    IF NOT EXISTS (SELECT 1 FROM public.leads_pool WHERE estado = 'disponible' LIMIT 1) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'No hay leads disponibles en este momento. El equipo está cargando más muy pronto.'
      );
    END IF;
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
  UPDATE public.user_stats SET valera_coins = valera_coins - p_costo WHERE id = v_user_id;

  INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
  VALUES (v_user_id, -p_costo, 'Tienda: ' || p_nombre);

  -- Registrar compra
  INSERT INTO public.store_compras (user_id, item_id, costo_coins)
  VALUES (v_user_id, p_item_id, p_costo)
  RETURNING id INTO v_compra_id;

  v_user_nombre := COALESCE((SELECT nombre FROM public.profiles WHERE id = v_user_id), 'Un prospectador');

  -- Auto-asignación para leads
  IF v_item_tipo IN ('lead_premium', 'lead_meta') THEN
    v_asignacion := public.asignar_lead_desde_pool(v_user_id, v_compra_id, 'tienda_' || v_item_tipo);

    UPDATE public.store_compras
    SET estado = 'entregado', atendido_at = NOW()
    WHERE id = v_compra_id;

    RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id, 'lead_asignado', v_asignacion);
  END IF;

  -- Otros items: notificar admins como antes
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

-- ── 4. Reemplazar registrar_premio_ruleta con soporte de auto-asignación ──────
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
  v_user_id    UUID := auth.uid();
  v_item_id    UUID;
  v_compra_id  UUID;
  v_nota       TEXT;
  v_asignacion JSONB;
BEGIN
  -- Descontar coins si es cofre pagado
  IF NOT p_es_milestone AND p_costo_coins > 0 THEN
    IF NOT gastar_coins(v_user_id, p_costo_coins, 'Cofre ruleta 🎰') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
    END IF;
  END IF;

  -- Buscar item de tienda correspondiente
  SELECT id INTO v_item_id
  FROM store_items
  WHERE tipo = p_tipo_premio
  ORDER BY disponible DESC
  LIMIT 1;

  IF v_item_id IS NULL THEN
    SELECT id INTO v_item_id FROM store_items ORDER BY orden LIMIT 1;
  END IF;

  v_nota := CASE
    WHEN p_es_milestone THEN '🏆 Premio ruleta milestone: ' || p_nombre_premio
    ELSE '🎰 Premio cofre ruleta: ' || p_nombre_premio
  END;

  -- Crear compra (historial)
  INSERT INTO store_compras (user_id, item_id, costo_coins, estado, notas_admin)
  VALUES (v_user_id, v_item_id, p_costo_coins, 'pendiente', v_nota)
  RETURNING id INTO v_compra_id;

  -- Auto-asignación para leads
  IF p_tipo_premio IN ('lead_premium', 'lead_meta') THEN
    v_asignacion := public.asignar_lead_desde_pool(v_user_id, v_compra_id, 'cofre_' || p_tipo_premio);

    IF (v_asignacion->>'ok')::BOOLEAN THEN
      UPDATE store_compras SET estado = 'entregado', atendido_at = NOW() WHERE id = v_compra_id;
    ELSE
      -- Pool vacío: alerta urgente a admins
      INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
      SELECT p.id,
        '🚨 Pool de leads vacío',
        'Un usuario ganó un lead en el cofre pero el pool está vacío. Agrega leads urgentemente.',
        'sistema'
      FROM profiles p WHERE p.role = 'admin';
    END IF;

    RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id, 'lead_asignado', v_asignacion);
  END IF;

  -- Otros premios: notificar admins como antes
  INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
  SELECT p.id,
    '🎰 Premio ruleta pendiente',
    (SELECT nombre FROM profiles WHERE id = v_user_id LIMIT 1) || ' ganó en la ruleta: ' || p_nombre_premio,
    'sistema'
  FROM profiles p WHERE p.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_premio_ruleta TO authenticated;

-- ── 5. RPCs de administración del pool ────────────────────────────────────────

-- Agregar lead al pool
CREATE OR REPLACE FUNCTION public.admin_agregar_lead_pool(
  p_telefono     TEXT,
  p_nombre       TEXT    DEFAULT NULL,
  p_zona_interes TEXT    DEFAULT NULL,
  p_nota         TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF trim(COALESCE(p_telefono,'')) = '' THEN
    RAISE EXCEPTION 'El teléfono es obligatorio';
  END IF;

  INSERT INTO public.leads_pool (nombre, telefono, zona_interes, nota, created_by)
  VALUES (
    NULLIF(trim(p_nombre),''), trim(p_telefono),
    NULLIF(trim(p_zona_interes),''), NULLIF(trim(p_nota),''),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_agregar_lead_pool TO authenticated;

-- Eliminar lead del pool (solo si aún está disponible)
CREATE OR REPLACE FUNCTION public.admin_eliminar_lead_pool(p_lead_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM public.leads_pool WHERE id = p_lead_id AND estado = 'disponible';
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_eliminar_lead_pool TO authenticated;

-- Leads disponibles (admin)
CREATE OR REPLACE FUNCTION public.get_leads_pool_disponibles()
RETURNS TABLE (
  id           UUID,
  nombre       TEXT,
  telefono     TEXT,
  zona_interes TEXT,
  nota         TEXT,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT lp.id, lp.nombre, lp.telefono, lp.zona_interes, lp.nota, lp.created_at
  FROM public.leads_pool lp
  WHERE lp.estado = 'disponible'
  ORDER BY lp.created_at;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_leads_pool_disponibles TO authenticated;

-- Historial de leads asignados (admin)
CREATE OR REPLACE FUNCTION public.get_leads_pool_historial()
RETURNS TABLE (
  id                UUID,
  nombre            TEXT,
  telefono          TEXT,
  zona_interes      TEXT,
  fuente_asignacion TEXT,
  asignado_at       TIMESTAMPTZ,
  usuario_nombre    TEXT,
  usuario_id        UUID,
  cliente_id        UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT
    lp.id,
    lp.nombre,
    lp.telefono,
    lp.zona_interes,
    lp.fuente_asignacion,
    lp.asignado_at,
    COALESCE(p.nombre, 'Usuario desconocido')::TEXT,
    lp.asignado_a,
    lp.cliente_id
  FROM public.leads_pool lp
  LEFT JOIN public.profiles p ON p.id = lp.asignado_a
  WHERE lp.estado = 'asignado'
  ORDER BY lp.asignado_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_leads_pool_historial TO authenticated;
