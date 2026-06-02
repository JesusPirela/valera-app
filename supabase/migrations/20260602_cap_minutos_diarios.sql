-- Limitar minutos por día a máximo 1440 (24 h) en ambas funciones de conexión.
-- Problema anterior: la suma de sesiones individuales podía superar las 24 h
-- si un usuario tenía muchas sesiones cortas/repetidas en el mismo día.

-- ── 1. get_horas_conexion (vista del prospectador) ────────────────────────────
-- Bug anterior: usaba NOW()-N días (ventana rodante de 24h) en lugar del
-- inicio del día en CDMX. Eso devolvía 2 fechas distintas para "hoy",
-- y el frontend las sumaba superando 1440 min.
CREATE OR REPLACE FUNCTION public.get_horas_conexion(
  p_user_id UUID DEFAULT NULL,
  p_dias    INTEGER DEFAULT 30
)
RETURNS TABLE (fecha DATE, minutos NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_desde   TIMESTAMPTZ;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Inicio del día (p_dias-1) días atrás en hora CDMX, convertido a UTC
  v_desde := (
    ((NOW() AT TIME ZONE 'America/Mexico_City')::DATE - (p_dias - 1))::TIMESTAMP
    AT TIME ZONE 'America/Mexico_City'
  ) AT TIME ZONE 'UTC';

  RETURN QUERY
  SELECT
    DATE(s.inicio AT TIME ZONE 'America/Mexico_City') AS fecha,
    LEAST(
      ROUND(SUM(
        EXTRACT(EPOCH FROM (
          LEAST(
            COALESCE(s.fin, s.inicio + INTERVAL '10 minutes'),
            s.inicio + INTERVAL '4 hours'
          ) - s.inicio
        )) / 60
      )::NUMERIC, 0),
      1440  -- máximo 24 horas por día
    ) AS minutos
  FROM public.user_sessions s
  WHERE s.user_id = v_user_id
    AND s.inicio >= v_desde
  GROUP BY DATE(s.inicio AT TIME ZONE 'America/Mexico_City')
  ORDER BY DATE(s.inicio AT TIME ZONE 'America/Mexico_City');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_horas_conexion TO authenticated;


-- ── 2. get_conexion_todos_usuarios (vista admin) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_conexion_todos_usuarios(p_dias INTEGER DEFAULT 7)
RETURNS TABLE (user_id UUID, nombre TEXT, fecha DATE, minutos NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_desde TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_desde := (((NOW() AT TIME ZONE 'America/Mexico_City')::DATE - (p_dias - 1))::TIMESTAMP
               AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC';

  RETURN QUERY
  SELECT s.user_id, p.nombre::TEXT,
    DATE(s.inicio AT TIME ZONE 'America/Mexico_City') AS fecha,
    LEAST(
      ROUND(SUM(
        EXTRACT(EPOCH FROM (
          LEAST(
            COALESCE(s.fin, s.inicio + INTERVAL '10 minutes'),
            s.inicio + INTERVAL '4 hours'
          ) - s.inicio
        )) / 60
      )::NUMERIC, 0),
      1440  -- máximo 24 horas por día
    ) AS minutos
  FROM public.user_sessions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.inicio >= v_desde
  GROUP BY s.user_id, p.nombre, DATE(s.inicio AT TIME ZONE 'America/Mexico_City')
  ORDER BY fecha DESC, minutos DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conexion_todos_usuarios TO authenticated;
