-- ══════════════════════════════════════════════════════════════
-- XP Transactions: historial detallado de XP ganado
-- • xp_transactions: tabla espejo de coin_transactions para XP
-- • award_xp_coins: actualizado para insertar en xp_transactions
-- • get_resumen_usuario: añade xp_total al resumen
-- • get_historial_usuario: añade eventos de XP al timeline
-- ══════════════════════════════════════════════════════════════

-- ── 1. Tabla xp_transactions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cantidad   INTEGER NOT NULL,
  concepto   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS xp_tx_user_created ON public.xp_transactions (user_id, created_at DESC);

DROP POLICY IF EXISTS "xp_tx_select_own"   ON public.xp_transactions;
DROP POLICY IF EXISTS "xp_tx_admin_select" ON public.xp_transactions;

-- Usuario ve su propia XP
CREATE POLICY "xp_tx_select_own" ON public.xp_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Admin / supervisor / asesor ven la de cualquier usuario
CREATE POLICY "xp_tx_admin_select" ON public.xp_transactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'asesor')
  ));

-- ── 2. award_xp_coins: ahora también registra XP ─────────────
CREATE OR REPLACE FUNCTION public.award_xp_coins(
  p_user_id         UUID,
  p_xp              INTEGER,
  p_coins           INTEGER,
  p_concepto        TEXT,
  p_campo_contador  TEXT DEFAULT NULL
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

  INSERT INTO public.user_stats (id, xp, valera_coins)
  VALUES (p_user_id, GREATEST(p_xp, 0), GREATEST(p_coins, 0))
  ON CONFLICT (id) DO UPDATE SET
    xp           = user_stats.xp + GREATEST(EXCLUDED.xp, 0),
    valera_coins = user_stats.valera_coins + GREATEST(EXCLUDED.valera_coins, 0);

  IF p_campo_contador IS NOT NULL AND p_campo_contador IN (
    'total_propiedades','total_clientes','total_cursos',
    'total_seguimientos','total_ventas','total_interacciones'
  ) THEN
    EXECUTE format(
      'UPDATE public.user_stats SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
      p_campo_contador, p_campo_contador
    ) USING p_user_id;
  END IF;

  IF p_coins > 0 THEN
    INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
    VALUES (p_user_id, p_coins, p_concepto);
  END IF;

  -- Nuevo: registrar XP igual que los coins
  IF p_xp > 0 THEN
    INSERT INTO public.xp_transactions (user_id, cantidad, concepto)
    VALUES (p_user_id, p_xp, p_concepto);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_xp_coins TO authenticated;

-- ── 3. get_resumen_usuario: añade xp_total ────────────────────
DROP FUNCTION IF EXISTS public.get_resumen_usuario(uuid);
CREATE FUNCTION public.get_resumen_usuario(p_user_id uuid)
RETURNS TABLE (
  minutos_total            numeric,
  publicaciones            integer,
  clientes                 integer,
  seguimientos_completados integer,
  seguimientos_pendientes  integer,
  vistas                   integer,
  descargas                integer,
  certificados             integer,
  ultima_conexion          timestamptz,
  alta                     timestamptz,
  xp_total                 integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'asesor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(f.minutos) FROM public.fn_conexion_diaria('2020-01-01'::timestamptz, NULL, p_user_id) f), 0)::numeric,
    (SELECT COUNT(*) FROM public.publicacion_log     WHERE user_id = p_user_id)::int,
    (SELECT COUNT(*) FROM public.clientes            WHERE responsable_id = p_user_id)::int,
    (SELECT COUNT(*) FROM public.recordatorios       WHERE user_id = p_user_id AND completado = true)::int,
    (SELECT COUNT(*) FROM public.recordatorios       WHERE user_id = p_user_id AND completado = false)::int,
    (SELECT COUNT(*) FROM public.propiedad_actividad WHERE user_id = p_user_id AND tipo = 'vista')::int,
    (SELECT COUNT(*) FROM public.propiedad_actividad WHERE user_id = p_user_id AND tipo = 'descarga')::int,
    (SELECT COUNT(*) FROM public.vu_certificados     WHERE user_id = p_user_id)::int,
    (SELECT MAX(COALESCE(s.fin, s.inicio)) FROM public.user_sessions s WHERE s.user_id = p_user_id),
    (SELECT created_at FROM public.profiles WHERE id = p_user_id),
    COALESCE((SELECT xp FROM public.user_stats WHERE id = p_user_id), 0)::int;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_resumen_usuario(uuid) TO authenticated;

-- ── 4. get_historial_usuario: añade eventos de XP ─────────────
CREATE OR REPLACE FUNCTION public.get_historial_usuario(
  p_user_id uuid,
  p_limit   integer DEFAULT 150,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE (
  tipo    text,
  icono   text,
  titulo  text,
  detalle text,
  fecha   timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'asesor')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH eventos AS (
    -- Publicaciones
    SELECT 'publicacion'::text AS tipo, '📤'::text AS icono,
           ('Publicó ' || COALESCE(pr.codigo, 'propiedad'))::text AS titulo,
           pr.titulo::text AS detalle, pl.created_at AS fecha
    FROM public.publicacion_log pl
    LEFT JOIN public.propiedades pr ON pr.id = pl.propiedad_id
    WHERE pl.user_id = p_user_id

    UNION ALL
    -- Clientes registrados
    SELECT 'cliente', '👤',
           'Registró cliente', cl.nombre::text, cl.created_at
    FROM public.clientes cl
    WHERE cl.responsable_id = p_user_id

    UNION ALL
    -- Seguimientos completados
    SELECT 'seguimiento', '✅',
           'Completó seguimiento', re.titulo::text, re.completado_at
    FROM public.recordatorios re
    WHERE re.user_id = p_user_id AND re.completado = true AND re.completado_at IS NOT NULL

    UNION ALL
    -- Recordatorios creados
    SELECT 'recordatorio', '🔔',
           'Creó recordatorio', re.titulo::text, re.created_at
    FROM public.recordatorios re
    WHERE re.user_id = p_user_id

    UNION ALL
    -- Vistas / descargas de fichas
    SELECT CASE WHEN pa.tipo = 'descarga' THEN 'descarga' ELSE 'vista' END,
           CASE WHEN pa.tipo = 'descarga' THEN '⬇️' ELSE '👁️' END,
           CASE WHEN pa.tipo = 'descarga' THEN 'Descargó ficha' ELSE 'Vio ficha' END,
           COALESCE(pr.codigo, 'propiedad')::text, pa.created_at
    FROM public.propiedad_actividad pa
    LEFT JOIN public.propiedades pr ON pr.id = pa.propiedad_id
    WHERE pa.user_id = p_user_id

    UNION ALL
    -- Certificados obtenidos
    SELECT 'certificado', '🎓',
           'Obtuvo certificado', vc.nombre_completo::text, vc.emitido_at
    FROM public.vu_certificados vc
    WHERE vc.user_id = p_user_id

    UNION ALL
    -- Sesiones de conexión
    SELECT 'conexion', '🟢',
           'Se conectó',
           (ROUND(EXTRACT(EPOCH FROM (
              LEAST(COALESCE(us.fin, us.inicio + INTERVAL '10 minutes'), us.inicio + INTERVAL '4 hours') - us.inicio
            )) / 60)::int || ' min conectado')::text,
           us.inicio
    FROM public.user_sessions us
    WHERE us.user_id = p_user_id

    UNION ALL
    -- XP ganado (nuevo)
    SELECT 'xp', '✨',
           ('Ganó ' || xt.cantidad::text || ' XP')::text,
           xt.concepto::text,
           xt.created_at
    FROM public.xp_transactions xt
    WHERE xt.user_id = p_user_id
  )
  SELECT e.tipo, e.icono, e.titulo, e.detalle, e.fecha
  FROM eventos e
  WHERE e.fecha IS NOT NULL
  ORDER BY e.fecha DESC
  LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_historial_usuario(uuid, integer, integer) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
