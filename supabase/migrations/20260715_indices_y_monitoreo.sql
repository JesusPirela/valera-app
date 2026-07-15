-- ═══════════════════════════════════════════════════════════════════════════
-- Afinación de base + infraestructura de monitoreo (15/jul/2026)
--
-- 1) Índice faltante en la FK citas_coordinacion.confirmada_por (lo marcó el
--    advisor de rendimiento; la agregó la migración de confirmación de citas).
-- 2) Tablas de MONITOREO: error_log (errores de la app) y event_log (analítica
--    de producto). Ambas las escribe cualquier usuario logueado vía RPC, pero
--    SOLO admin/supervisor las lee. Es un "Sentry/PostHog ligero" que vive en
--    la propia base: sin servicios externos, sin recompilar la app, viaja por
--    OTA. Antes no había NADA: por eso bugs como la racha o el cron vivieron
--    meses rotos sin que nadie se enterara.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_citas_confirmada_por
  ON public.citas_coordinacion(confirmada_por);

-- ── error_log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.error_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mensaje     text NOT NULL,
  stack       text,
  contexto    text,               -- pantalla / acción donde ocurrió
  plataforma  text,               -- web / ios / android
  version_app text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_log_created ON public.error_log(created_at DESC);
ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

-- ── event_log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evento     text NOT NULL,       -- 'login', 'publicar_propiedad', 'ver_pantalla'…
  props      jsonb,               -- datos extra del evento
  plataforma text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_log_evento_fecha ON public.event_log(evento, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON public.event_log(created_at DESC);
ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;

-- Lectura: solo staff. (La escritura va por RPC SECURITY DEFINER, no por RLS.)
DROP POLICY IF EXISTS error_log_lee_staff ON public.error_log;
CREATE POLICY error_log_lee_staff ON public.error_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')));
DROP POLICY IF EXISTS event_log_lee_staff ON public.event_log;
CREATE POLICY event_log_lee_staff ON public.event_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')));

-- ── RPCs de escritura ────────────────────────────────────────────────────────
-- Registrar un error. No falla nunca hacia el cliente (si algo sale mal aquí,
-- lo último que queremos es romper la app por intentar reportar un error).
CREATE OR REPLACE FUNCTION public.log_error(
  p_mensaje text, p_stack text DEFAULT NULL, p_contexto text DEFAULT NULL,
  p_plataforma text DEFAULT NULL, p_version text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  INSERT INTO error_log (user_id, mensaje, stack, contexto, plataforma, version_app)
  VALUES (auth.uid(), left(p_mensaje, 2000), left(p_stack, 6000),
          left(p_contexto, 300), p_plataforma, p_version);
EXCEPTION WHEN OTHERS THEN
  NULL;  -- reportar un error jamás debe reventar
END;
$fn$;

CREATE OR REPLACE FUNCTION public.log_evento(
  p_evento text, p_props jsonb DEFAULT NULL, p_plataforma text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  INSERT INTO event_log (user_id, evento, props, plataforma)
  VALUES (auth.uid(), left(p_evento, 100), p_props, p_plataforma);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$fn$;

-- Resúmenes para el panel de monitoreo (admin).
CREATE OR REPLACE FUNCTION public.get_monitoreo_errores(p_dias int DEFAULT 7)
RETURNS TABLE(mensaje text, contexto text, n bigint, ultimo timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT left(mensaje, 140), contexto, COUNT(*), MAX(created_at)
  FROM error_log
  WHERE created_at > now() - (p_dias || ' days')::interval
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor'))
  GROUP BY 1, 2
  ORDER BY 3 DESC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.get_monitoreo_eventos(p_dias int DEFAULT 7)
RETURNS TABLE(evento text, n bigint, usuarios bigint)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT evento, COUNT(*), COUNT(DISTINCT user_id)
  FROM event_log
  WHERE created_at > now() - (p_dias || ' days')::interval
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor'))
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_monitoreo_errores(int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_monitoreo_eventos(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_error(text,text,text,text,text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.log_evento(text,jsonb,text)         TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_monitoreo_errores(int)          TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_monitoreo_eventos(int)          TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
