-- ── 1. Corregir get_actividad_diaria (usaba CURRENT_DATE en UTC) ──
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
DECLARE
  v_user_id UUID;
  v_inicio  TIMESTAMPTZ;
  v_fin     TIMESTAMPTZ;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Inicio y fin del día de HOY en zona horaria México (convertido a UTC para filtrar)
  v_inicio := ((NOW() AT TIME ZONE 'America/Mexico_City')::DATE::TIMESTAMP
                AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC';
  v_fin    := v_inicio + INTERVAL '1 day';

  RETURN QUERY SELECT
    (SELECT COUNT(*)::INTEGER FROM propiedad_publicacion
       WHERE user_id = v_user_id AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin),
    (SELECT COUNT(*)::INTEGER FROM clientes
       WHERE responsable_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin),
    (SELECT COUNT(*)::INTEGER FROM interacciones
       WHERE user_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin),
    (SELECT COUNT(*)::INTEGER FROM recordatorios
       WHERE user_id = v_user_id AND completado = true AND updated_at >= v_inicio AND updated_at < v_fin),
    (SELECT COUNT(*)::INTEGER FROM clientes
       WHERE responsable_id = v_user_id
         AND NOT (created_at >= v_inicio AND created_at < v_fin)
         AND updated_at >= v_inicio AND updated_at < v_fin);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_actividad_diaria TO authenticated;


-- ── 2. Nueva función: actividad para cualquier período ─────────
-- Reemplaza la vista fragmentada. Un solo RPC cubre Hoy / 7 días / 30 días.
CREATE OR REPLACE FUNCTION public.get_actividad_periodo(
  p_dias    INTEGER DEFAULT 1,
  p_user_id UUID    DEFAULT NULL
)
RETURNS TABLE (
  clientes_nuevos        INTEGER,
  propiedades_publicadas INTEGER,
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

  -- Fin = fin del día de hoy en MX; inicio = hace p_dias días calendario
  v_fin    := ((NOW() AT TIME ZONE 'America/Mexico_City')::DATE::TIMESTAMP
                AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC' + INTERVAL '1 day';
  v_inicio := v_fin - (p_dias || ' days')::INTERVAL;

  RETURN QUERY SELECT
    -- Conteos
    (SELECT COUNT(*)::INTEGER FROM clientes
       WHERE responsable_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin),
    (SELECT COUNT(*)::INTEGER FROM propiedad_publicacion
       WHERE user_id = v_user_id AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin),
    (SELECT COUNT(*)::INTEGER FROM recordatorios
       WHERE user_id = v_user_id AND completado = true AND updated_at >= v_inicio AND updated_at < v_fin),
    (SELECT COUNT(*)::INTEGER FROM interacciones
       WHERE user_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin),
    (SELECT COUNT(*)::INTEGER FROM vu_progreso
       WHERE user_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin),
    -- Primer movimiento del período
    (SELECT MIN(ts) FROM (
       SELECT MIN(created_at)        AS ts FROM clientes         WHERE responsable_id = v_user_id AND created_at        >= v_inicio AND created_at        < v_fin
       UNION ALL
       SELECT MIN(fecha_publicacion) AS ts FROM propiedad_publicacion WHERE user_id = v_user_id AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin
       UNION ALL
       SELECT MIN(created_at)        AS ts FROM interacciones    WHERE user_id = v_user_id        AND created_at        >= v_inicio AND created_at        < v_fin
       UNION ALL
       SELECT MIN(updated_at)        AS ts FROM recordatorios    WHERE user_id = v_user_id AND completado = true AND updated_at >= v_inicio AND updated_at < v_fin
     ) _m WHERE ts IS NOT NULL),
    -- Último movimiento del período
    (SELECT MAX(ts) FROM (
       SELECT MAX(created_at)        AS ts FROM clientes         WHERE responsable_id = v_user_id AND created_at        >= v_inicio AND created_at        < v_fin
       UNION ALL
       SELECT MAX(fecha_publicacion) AS ts FROM propiedad_publicacion WHERE user_id = v_user_id AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin
       UNION ALL
       SELECT MAX(created_at)        AS ts FROM interacciones    WHERE user_id = v_user_id        AND created_at        >= v_inicio AND created_at        < v_fin
       UNION ALL
       SELECT MAX(updated_at)        AS ts FROM recordatorios    WHERE user_id = v_user_id AND completado = true AND updated_at >= v_inicio AND updated_at < v_fin
     ) _m WHERE ts IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_actividad_periodo TO authenticated;


-- ── 3. Corregir get_horas_conexion (usaba ventana de 24h no días calendario) ──
CREATE OR REPLACE FUNCTION public.get_horas_conexion(
  p_user_id UUID    DEFAULT NULL,
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
  ) THEN RAISE EXCEPTION 'Access denied'; END IF;

  -- Inicio del día más antiguo del rango (p_dias días calendario incluyendo hoy)
  v_desde := (((NOW() AT TIME ZONE 'America/Mexico_City')::DATE - (p_dias - 1))::TIMESTAMP
               AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC';

  RETURN QUERY
  SELECT
    DATE(s.inicio AT TIME ZONE 'America/Mexico_City') AS fecha,
    ROUND(
      SUM(
        EXTRACT(EPOCH FROM (
          LEAST(
            COALESCE(s.fin, s.inicio + INTERVAL '30 minutes'),
            s.inicio + INTERVAL '4 hours'
          ) - s.inicio
        )) / 60
      )::NUMERIC,
    0) AS minutos
  FROM public.user_sessions s
  WHERE s.user_id = v_user_id
    AND s.inicio >= v_desde
  GROUP BY DATE(s.inicio AT TIME ZONE 'America/Mexico_City')
  ORDER BY DATE(s.inicio AT TIME ZONE 'America/Mexico_City');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_horas_conexion TO authenticated;


-- ── 4. Corregir get_conexion_todos_usuarios (mismos bugs) ─────
CREATE OR REPLACE FUNCTION public.get_conexion_todos_usuarios(p_dias INTEGER DEFAULT 7)
RETURNS TABLE (user_id UUID, nombre TEXT, fecha DATE, minutos NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_desde TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_desde := (((NOW() AT TIME ZONE 'America/Mexico_City')::DATE - (p_dias - 1))::TIMESTAMP
               AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC';

  RETURN QUERY
  SELECT s.user_id, p.nombre::TEXT,
    DATE(s.inicio AT TIME ZONE 'America/Mexico_City') AS fecha,
    ROUND(SUM(
      EXTRACT(EPOCH FROM (
        LEAST(
          COALESCE(s.fin, s.inicio + INTERVAL '30 minutes'),
          s.inicio + INTERVAL '4 hours'
        ) - s.inicio
      )) / 60
    )::NUMERIC, 0) AS minutos
  FROM public.user_sessions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.inicio >= v_desde
  GROUP BY s.user_id, p.nombre, DATE(s.inicio AT TIME ZONE 'America/Mexico_City')
  ORDER BY fecha DESC, minutos DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conexion_todos_usuarios TO authenticated;
