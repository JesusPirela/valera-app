-- ─────────────────────────────────────────────────────────────────────────────
-- Agregar publicaciones_totales a get_actividad_periodo
-- propiedades_publicadas = propiedades únicas publicadas en el período
--   (COUNT DISTINCT propiedad_id en publicacion_log)
-- publicaciones_totales  = todos los eventos de publicación (incl. re-pub)
--   (COUNT(*) en publicacion_log)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_actividad_periodo(
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

  v_fin    := ((NOW() AT TIME ZONE 'America/Mexico_City')::DATE::TIMESTAMP
                AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC' + INTERVAL '1 day';
  v_inicio := v_fin - (p_dias || ' days')::INTERVAL;

  RETURN QUERY SELECT
    -- Clientes nuevos
    (SELECT COUNT(*)::INTEGER FROM clientes
       WHERE responsable_id = v_user_id AND created_at >= v_inicio AND created_at < v_fin),
    -- Propiedades únicas publicadas (sin contar re-publicaciones)
    (SELECT COUNT(DISTINCT pl.propiedad_id)::INTEGER FROM publicacion_log pl
       WHERE pl.user_id = v_user_id AND pl.created_at >= v_inicio AND pl.created_at < v_fin),
    -- Publicaciones totales (incluyendo re-publicaciones)
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
       SELECT MIN(created_at)   AS ts FROM clientes         WHERE responsable_id = v_user_id AND created_at  >= v_inicio AND created_at  < v_fin
       UNION ALL
       SELECT MIN(created_at)   AS ts FROM publicacion_log  WHERE user_id = v_user_id         AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MIN(created_at)   AS ts FROM interacciones    WHERE user_id = v_user_id         AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MIN(updated_at)   AS ts FROM recordatorios    WHERE user_id = v_user_id AND completado = true AND updated_at >= v_inicio AND updated_at < v_fin
     ) _m WHERE ts IS NOT NULL),
    -- Último movimiento del período
    (SELECT MAX(ts) FROM (
       SELECT MAX(created_at)   AS ts FROM clientes         WHERE responsable_id = v_user_id AND created_at  >= v_inicio AND created_at  < v_fin
       UNION ALL
       SELECT MAX(created_at)   AS ts FROM publicacion_log  WHERE user_id = v_user_id         AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MAX(created_at)   AS ts FROM interacciones    WHERE user_id = v_user_id         AND created_at >= v_inicio AND created_at < v_fin
       UNION ALL
       SELECT MAX(updated_at)   AS ts FROM recordatorios    WHERE user_id = v_user_id AND completado = true AND updated_at >= v_inicio AND updated_at < v_fin
     ) _m WHERE ts IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_actividad_periodo(INTEGER, UUID) TO authenticated;
