-- Fix: get_actividad_periodo usaba recordatorios.updated_at, columna que NO
-- existe (la correcta es completado_at). El error tumbaba la funcion completa
-- y Mi Actividad mostraba 0 en TODAS las estadisticas.

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
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN RAISE EXCEPTION 'Access denied'; END IF;

  v_fin    := ((NOW() AT TIME ZONE 'America/Mexico_City')::DATE::TIMESTAMP
                AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC' + INTERVAL '1 day';
  v_inicio := v_fin - (p_dias || ' days')::INTERVAL;

  RETURN QUERY SELECT
    (SELECT COUNT(*)::INTEGER FROM clientes
       WHERE responsable_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin),

    (SELECT COUNT(*)::INTEGER FROM propiedad_publicacion pp
       WHERE pp.user_id = v_user_id
         AND pp.publicada = TRUE
         AND pp.fecha_publicacion >= v_inicio
         AND pp.fecha_publicacion < v_fin),

    (SELECT COUNT(*)::INTEGER FROM publicacion_log pl
       WHERE pl.user_id = v_user_id AND pl.created_at >= v_inicio AND pl.created_at < v_fin),

    (SELECT COUNT(*)::INTEGER FROM recordatorios
       WHERE user_id = v_user_id AND completado = true
         AND completado_at >= v_inicio AND completado_at < v_fin),

    (SELECT COUNT(*)::INTEGER FROM interacciones
       WHERE user_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin),

    (SELECT COUNT(*)::INTEGER FROM vu_progreso
       WHERE user_id = v_user_id AND completada_at >= v_inicio AND completada_at < v_fin),

    (SELECT MIN(ts) FROM (
       SELECT MIN(created_at)        AS ts FROM clientes        WHERE responsable_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MIN(fecha_publicacion) AS ts FROM propiedad_publicacion WHERE user_id = v_user_id AND publicada = TRUE AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin
       UNION ALL
       SELECT MIN(created_at)        AS ts FROM interacciones   WHERE user_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MIN(completado_at)     AS ts FROM recordatorios   WHERE user_id = v_user_id AND completado = true AND completado_at >= v_inicio AND completado_at < v_fin
     ) _m WHERE ts IS NOT NULL),

    (SELECT MAX(ts) FROM (
       SELECT MAX(created_at)        AS ts FROM clientes        WHERE responsable_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MAX(fecha_publicacion) AS ts FROM propiedad_publicacion WHERE user_id = v_user_id AND publicada = TRUE AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin
       UNION ALL
       SELECT MAX(created_at)        AS ts FROM interacciones   WHERE user_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MAX(completado_at)     AS ts FROM recordatorios   WHERE user_id = v_user_id AND completado = true AND completado_at >= v_inicio AND completado_at < v_fin
     ) _m WHERE ts IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_actividad_periodo(INTEGER, UUID) TO authenticated;
