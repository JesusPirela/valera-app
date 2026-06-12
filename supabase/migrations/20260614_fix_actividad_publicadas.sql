-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: propiedades_publicadas ahora usa propiedad_publicacion.fecha_publicacion
-- (más confiable que publicacion_log cuando el trigger no estaba activo).
-- publicaciones_totales sigue usando publicacion_log (requiere trigger).
-- También recrea el trigger por si no estaba aplicado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Asegura que la tabla publicacion_log exista ───────────────────────────
CREATE TABLE IF NOT EXISTS public.publicacion_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id UUID        NOT NULL REFERENCES public.propiedades(id)  ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id)           ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publicacion_log_user_created
  ON public.publicacion_log (user_id, created_at);

ALTER TABLE public.publicacion_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='publicacion_log' AND policyname='publog_own') THEN
    CREATE POLICY "publog_own"   ON public.publicacion_log FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='publicacion_log' AND policyname='publog_admin') THEN
    CREATE POLICY "publog_admin" ON public.publicacion_log FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='publicacion_log' AND policyname='publog_insert') THEN
    CREATE POLICY "publog_insert" ON public.publicacion_log FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── 2. Recrea el trigger para que funcione desde ahora ───────────────────────
CREATE OR REPLACE FUNCTION fn_log_publicacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.publicada = TRUE THEN
    INSERT INTO public.publicacion_log (propiedad_id, user_id)
    VALUES (NEW.propiedad_id, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_publicacion_log ON public.propiedad_publicacion;
CREATE TRIGGER tr_publicacion_log
  AFTER INSERT OR UPDATE ON public.propiedad_publicacion
  FOR EACH ROW EXECUTE FUNCTION fn_log_publicacion();

-- ── 3. Backfill: sincroniza publicacion_log con propiedad_publicacion ────────
-- Inserta entradas para todas las publicaciones existentes que no tengan log.
-- Usa veces_publicada para generar el número correcto de entradas.
-- Si ya existen entradas suficientes para ese user+propiedad, no inserta.
INSERT INTO public.publicacion_log (propiedad_id, user_id, created_at)
SELECT
  pp.propiedad_id,
  pp.user_id,
  pp.fecha_publicacion - (gs.n - 1) * INTERVAL '1 hour'
FROM public.propiedad_publicacion pp
CROSS JOIN generate_series(1, GREATEST(pp.veces_publicada, 1)) AS gs(n)
WHERE pp.publicada = TRUE
  AND pp.veces_publicada > 0
  AND pp.fecha_publicacion IS NOT NULL
  AND (
    SELECT COUNT(*) FROM public.publicacion_log pl
    WHERE pl.propiedad_id = pp.propiedad_id AND pl.user_id = pp.user_id
  ) < pp.veces_publicada;

-- ── 4. Recrea get_actividad_periodo con propiedades_publicadas más confiable ─
DROP FUNCTION IF EXISTS public.get_actividad_periodo(INTEGER, UUID);

CREATE FUNCTION public.get_actividad_periodo(
  p_dias    INTEGER DEFAULT 1,
  p_user_id UUID    DEFAULT NULL
)
RETURNS TABLE (
  clientes_nuevos        INTEGER,
  propiedades_publicadas INTEGER,
  publicaciones_totales  INTEGER,
  seguimientos           INTEGER,
  interacciones          INTEGER,
  cursos_completados     INTEGER,
  primer_movimiento      TIMESTAMPTZ,
  ultimo_movimiento      TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_fin     TIMESTAMPTZ;
  v_inicio  TIMESTAMPTZ;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Rango: desde las 00:00 del día más antiguo hasta las 00:00 del día siguiente (hora México)
  v_fin    := ((NOW() AT TIME ZONE 'America/Mexico_City')::DATE::TIMESTAMP
                AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC' + INTERVAL '1 day';
  v_inicio := v_fin - (p_dias || ' days')::INTERVAL;

  RETURN QUERY SELECT
    -- Clientes nuevos
    (SELECT COUNT(*)::INTEGER FROM clientes
       WHERE responsable_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin),

    -- Propiedades únicas publicadas: usa fecha_publicacion de propiedad_publicacion
    -- (confiable porque siempre se actualiza al publicar, sin depender del trigger)
    (SELECT COUNT(*)::INTEGER FROM propiedad_publicacion pp
       WHERE pp.user_id = v_user_id
         AND pp.publicada = TRUE
         AND pp.fecha_publicacion >= v_inicio
         AND pp.fecha_publicacion < v_fin),

    -- Publicaciones totales: usa publicacion_log (incluye re-publicaciones)
    (SELECT COUNT(*)::INTEGER FROM publicacion_log pl
       WHERE pl.user_id = v_user_id AND pl.created_at >= v_inicio AND pl.created_at < v_fin),

    -- Seguimientos completados
    (SELECT COUNT(*)::INTEGER FROM recordatorios
       WHERE user_id = v_user_id AND completado = true AND updated_at >= v_inicio AND updated_at < v_fin),

    -- Interacciones
    (SELECT COUNT(*)::INTEGER FROM interacciones
       WHERE user_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin),

    -- Cursos completados
    (SELECT COUNT(*)::INTEGER FROM vu_progreso
       WHERE user_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin),

    -- Primer movimiento del período
    (SELECT MIN(ts) FROM (
       SELECT MIN(created_at)        AS ts FROM clientes        WHERE responsable_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MIN(fecha_publicacion) AS ts FROM propiedad_publicacion WHERE user_id = v_user_id AND publicada = TRUE AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin
       UNION ALL
       SELECT MIN(created_at)        AS ts FROM interacciones   WHERE user_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MIN(updated_at)        AS ts FROM recordatorios   WHERE user_id = v_user_id AND completado = true AND updated_at >= v_inicio AND updated_at < v_fin
     ) _m WHERE ts IS NOT NULL),

    -- Último movimiento del período
    (SELECT MAX(ts) FROM (
       SELECT MAX(created_at)        AS ts FROM clientes        WHERE responsable_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MAX(fecha_publicacion) AS ts FROM propiedad_publicacion WHERE user_id = v_user_id AND publicada = TRUE AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin
       UNION ALL
       SELECT MAX(created_at)        AS ts FROM interacciones   WHERE user_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MAX(updated_at)        AS ts FROM recordatorios   WHERE user_id = v_user_id AND completado = true AND updated_at >= v_inicio AND updated_at < v_fin
     ) _m WHERE ts IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_actividad_periodo(INTEGER, UUID) TO authenticated;
