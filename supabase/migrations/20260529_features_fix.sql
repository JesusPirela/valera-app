-- ══════════════════════════════════════════════════════════════
-- FIX 20260529: corrige políticas y actualiza get_prospectadores
-- ══════════════════════════════════════════════════════════════

-- ── 1. Historial de coins para admins ─────────────────────────
-- Usa DROP+CREATE en lugar de IF NOT EXISTS (más compatible)
DROP POLICY IF EXISTS "coin_tx_admin_select" ON public.coin_transactions;
CREATE POLICY "coin_tx_admin_select" ON public.coin_transactions
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── 2. Función admin_ajustar_monedas ──────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ajustar_monedas(
  p_target_user_id UUID,
  p_cantidad        INTEGER,
  p_concepto        TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Solo admins pueden ajustar monedas';
  END IF;

  IF p_cantidad < 0 THEN
    SELECT valera_coins INTO v_saldo FROM public.user_stats WHERE id = p_target_user_id FOR UPDATE;
    IF v_saldo IS NULL OR v_saldo + p_cantidad < 0 THEN
      RETURN FALSE;
    END IF;
  END IF;

  INSERT INTO public.user_stats (id, xp, valera_coins)
  VALUES (p_target_user_id, 0, GREATEST(p_cantidad, 0))
  ON CONFLICT (id) DO UPDATE SET
    valera_coins = GREATEST(user_stats.valera_coins + p_cantidad, 0);

  INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
  VALUES (p_target_user_id, p_cantidad, p_concepto);

  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_ajustar_monedas TO authenticated;

-- ── 3. get_prospectadores con coins y nombre ───────────────────
CREATE OR REPLACE FUNCTION get_prospectadores()
RETURNS TABLE (
  id            UUID,
  email         TEXT,
  nombre        TEXT,
  created_at    TIMESTAMPTZ,
  last_seen     TIMESTAMPTZ,
  role          TEXT,
  valera_coins  INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    au.email::TEXT,
    p.nombre,
    p.created_at,
    p.last_seen,
    p.role,
    COALESCE(us.valera_coins, 0)::INTEGER
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.user_stats us ON us.id = p.id
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'nuevo')
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Tabla user_sessions (si no existe) ─────────────────────
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inicio      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user  ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_inicio ON public.user_sessions(inicio);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_own"   ON public.user_sessions;
DROP POLICY IF EXISTS "sessions_insert_own"   ON public.user_sessions;
DROP POLICY IF EXISTS "sessions_update_own"   ON public.user_sessions;
DROP POLICY IF EXISTS "sessions_admin_select" ON public.user_sessions;

CREATE POLICY "sessions_select_own" ON public.user_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sessions_insert_own" ON public.user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_update_own" ON public.user_sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sessions_admin_select" ON public.user_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── 5. RPCs de conexión y actividad ───────────────────────────
CREATE OR REPLACE FUNCTION public.get_horas_conexion(
  p_user_id UUID DEFAULT NULL,
  p_dias    INTEGER DEFAULT 30
)
RETURNS TABLE (fecha DATE, minutos NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id UUID;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Access denied'; END IF;

  RETURN QUERY
  SELECT
    DATE(s.inicio) AS fecha,
    ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.fin, NOW()) - s.inicio)) / 60)::NUMERIC, 0) AS minutos
  FROM public.user_sessions s
  WHERE s.user_id = v_user_id
    AND s.inicio >= (NOW() - (p_dias || ' days')::INTERVAL)
  GROUP BY DATE(s.inicio)
  ORDER BY DATE(s.inicio);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_horas_conexion TO authenticated;

CREATE OR REPLACE FUNCTION public.get_actividad_diaria(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  propiedades_hoy          INTEGER,
  clientes_hoy             INTEGER,
  interacciones_hoy        INTEGER,
  seguimientos_hoy         INTEGER,
  clientes_modificados_hoy INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id UUID; v_hoy DATE;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  v_hoy     := CURRENT_DATE;
  IF v_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Access denied'; END IF;

  RETURN QUERY SELECT
    (SELECT COUNT(*)::INTEGER FROM propiedades  WHERE created_by = v_user_id AND DATE(created_at) = v_hoy),
    (SELECT COUNT(*)::INTEGER FROM clientes     WHERE responsable_id = v_user_id AND DATE(created_at) = v_hoy),
    (SELECT COUNT(*)::INTEGER FROM interacciones WHERE user_id = v_user_id AND DATE(created_at) = v_hoy),
    (SELECT COUNT(*)::INTEGER FROM recordatorios WHERE user_id = v_user_id AND completado = true AND DATE(updated_at) = v_hoy),
    (SELECT COUNT(*)::INTEGER FROM clientes     WHERE responsable_id = v_user_id AND DATE(created_at) != v_hoy AND DATE(updated_at) = v_hoy);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_actividad_diaria TO authenticated;

CREATE OR REPLACE FUNCTION public.get_conexion_todos_usuarios(p_dias INTEGER DEFAULT 7)
RETURNS TABLE (user_id UUID, nombre TEXT, fecha DATE, minutos NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT s.user_id, p.nombre, DATE(s.inicio) AS fecha,
    ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.fin, NOW()) - s.inicio)) / 60)::NUMERIC, 0) AS minutos
  FROM public.user_sessions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.inicio >= (NOW() - (p_dias || ' days')::INTERVAL)
    AND p.role NOT IN ('admin')
  GROUP BY s.user_id, p.nombre, DATE(s.inicio)
  ORDER BY s.user_id, DATE(s.inicio);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_conexion_todos_usuarios TO authenticated;

-- ── 6. Actualizar tienda ───────────────────────────────────────
UPDATE public.store_items SET disponible = false WHERE tipo IN ('boost', 'sorteo', 'merch');

UPDATE public.store_items SET
  descripcion = 'Bono de comisión adicional del 5% sobre tu comisión en los próximos 14 días',
  icono = '💸'
WHERE tipo = 'comision_extra';

INSERT INTO public.store_items (nombre, descripcion, costo_coins, tipo, icono, orden)
SELECT 'Campaña personalizada 7 días',
       'Activa una campaña de marketing personalizada con tus clientes pagados durante 7 días',
       5000, 'campana', '📣', 8
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE tipo = 'campana');

INSERT INTO public.store_items (nombre, descripcion, costo_coins, tipo, icono, orden)
SELECT 'Libro a tu elección',
       'Elige un libro de ventas, desarrollo personal o bienes raíces — nosotros te lo conseguimos',
       5000, 'libro', '📖', 9
WHERE NOT EXISTS (SELECT 1 FROM public.store_items WHERE tipo = 'libro');
