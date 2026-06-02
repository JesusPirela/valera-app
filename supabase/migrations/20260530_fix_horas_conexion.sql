-- Fix get_horas_conexion:
-- 1. Limita sesiones sin fin a 30 minutos (evita que sesiones abiertas acumulen horas)
-- 2. Limita cualquier sesión a máximo 4 horas (previene valores absurdos)
-- 3. Agrupa por fecha en zona horaria México, no UTC

CREATE OR REPLACE FUNCTION public.get_horas_conexion(
  p_user_id UUID DEFAULT NULL,
  p_dias    INTEGER DEFAULT 30
)
RETURNS TABLE (
  fecha     DATE,
  minutos   NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    DATE(s.inicio AT TIME ZONE 'America/Mexico_City') AS fecha,
    -- Cap diario: ningún día puede superar 1440 minutos (24 horas)
    LEAST(
      ROUND(
        SUM(
          EXTRACT(EPOCH FROM (
            LEAST(
              COALESCE(s.fin, s.inicio + INTERVAL '30 minutes'),
              s.inicio + INTERVAL '4 hours'
            ) - s.inicio
          )) / 60
        )::NUMERIC,
      0),
      1440
    ) AS minutos
  FROM public.user_sessions s
  WHERE s.user_id = v_user_id
    AND s.inicio >= (NOW() - (p_dias || ' days')::INTERVAL)
  GROUP BY DATE(s.inicio AT TIME ZONE 'America/Mexico_City')
  ORDER BY DATE(s.inicio AT TIME ZONE 'America/Mexico_City');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_horas_conexion TO authenticated;
