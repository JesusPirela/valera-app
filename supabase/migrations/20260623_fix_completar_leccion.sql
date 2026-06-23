-- ══════════════════════════════════════════════════════════════════════════════
-- FIX completar_leccion y sincronizar_misiones_diarias_hoy
--
-- Bug 1: completar_leccion era SECURITY DEFINER sin SET search_path = public,
--        por lo que las tablas vu_progreso, vu_puntos, etc. no se resolvían
--        correctamente cuando auth.uid() devuelve NULL (sin JWT en contexto).
--        Solución: añadir SET search_path, aceptar p_user_id explícito.
--
-- Bug 2: sincronizar_misiones_diarias_hoy usaba created_at en vu_progreso
--        pero esa tabla tiene completada_at. Causaba error al sincronizar
--        misiones de categoría 'curso'.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. completar_leccion ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.completar_leccion(
  p_leccion_id UUID,
  p_curso_id   UUID,
  p_user_id    UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID := COALESCE(p_user_id, auth.uid());
  v_ya_completada BOOLEAN;
  v_total         INT;
  v_completadas   INT;
  v_curso_done    BOOLEAN := FALSE;
  v_cert_nuevo    BOOLEAN := FALSE;
  v_titulo        TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.vu_progreso
    WHERE user_id = v_user_id AND leccion_id = p_leccion_id
  ) INTO v_ya_completada;

  IF v_ya_completada THEN
    RETURN json_build_object(
      'ya_completada', TRUE, 'curso_completado', FALSE,
      'certificado_nuevo', FALSE, 'puntos', 0
    );
  END IF;

  INSERT INTO public.vu_progreso (user_id, leccion_id, curso_id)
  VALUES (v_user_id, p_leccion_id, p_curso_id);

  INSERT INTO public.vu_puntos (user_id, curso_id, leccion_id, puntos, concepto)
  VALUES (v_user_id, p_curso_id, p_leccion_id, 10, 'leccion_completada');

  SELECT COUNT(*) INTO v_total FROM public.vu_lecciones WHERE curso_id = p_curso_id;
  SELECT COUNT(*) INTO v_completadas
  FROM public.vu_progreso WHERE user_id = v_user_id AND curso_id = p_curso_id;

  IF v_total > 0 AND v_completadas >= v_total THEN
    v_curso_done := TRUE;

    INSERT INTO public.vu_puntos (user_id, curso_id, puntos, concepto)
    VALUES (v_user_id, p_curso_id, 50, 'curso_completado');

    INSERT INTO public.vu_certificados (user_id, curso_id)
    VALUES (v_user_id, p_curso_id) ON CONFLICT DO NOTHING;

    SELECT titulo INTO v_titulo FROM public.vu_cursos WHERE id = p_curso_id;

    INSERT INTO public.notificaciones (user_id, titulo, mensaje)
    VALUES (v_user_id, '🎓 ¡Certificado obtenido!',
      'Completaste "' || v_titulo || '" y obtuviste tu certificado. +60 puntos.');

    v_cert_nuevo := TRUE;
  END IF;

  RETURN json_build_object(
    'ya_completada', FALSE,
    'curso_completado', v_curso_done,
    'certificado_nuevo', v_cert_nuevo,
    'puntos', 10
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.completar_leccion(UUID, UUID, UUID) TO authenticated;

-- ── 2. sincronizar_misiones_diarias_hoy — corregir created_at → completada_at ─
CREATE OR REPLACE FUNCTION public.sincronizar_misiones_diarias_hoy(
  p_fecha DATE DEFAULT (NOW() AT TIME ZONE 'America/Mexico_City')::DATE
)
RETURNS TABLE (
  mision_id         UUID,
  recien_completada BOOLEAN,
  recompensa_xp     INTEGER,
  recompensa_coins  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  m         RECORD;
  um_id     UUID;
  um_prog   INTEGER;
  um_compl  BOOLEAN;
  um_fecha  DATE;
  um_exists BOOLEAN;
  v_count   INTEGER;
  v_prog    INTEGER;
  v_compl   BOOLEAN;
  v_nueva   BOOLEAN;
BEGIN
  FOR m IN
    SELECT id, categoria, meta, recompensa_xp, recompensa_coins
    FROM public.misiones
    WHERE tipo = 'diaria' AND activa = true
  LOOP
    v_count := 0;

    IF m.categoria = 'propiedad' THEN
      SELECT COUNT(*) INTO v_count
      FROM public.propiedad_publicacion
      WHERE user_id = v_user_id
        AND (fecha_publicacion AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;

    ELSIF m.categoria = 'crm' THEN
      SELECT COUNT(*) INTO v_count
      FROM public.clientes
      WHERE responsable_id = v_user_id
        AND (created_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;

    ELSIF m.categoria = 'seguimiento' THEN
      SELECT COUNT(*) INTO v_count
      FROM public.recordatorios
      WHERE user_id = v_user_id AND completado = true
        AND (updated_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;

    ELSIF m.categoria = 'interaccion' THEN
      SELECT COUNT(*) INTO v_count
      FROM public.interacciones
      WHERE user_id = v_user_id
        AND (created_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;

    ELSIF m.categoria = 'curso' THEN
      -- vu_progreso usa completada_at (no created_at)
      -- Contamos lecciones completadas hoy; si meta=1, basta con ver 1 lección
      SELECT COUNT(*) INTO v_count
      FROM public.vu_progreso
      WHERE user_id = v_user_id
        AND (completada_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;
    END IF;

    SELECT id, progreso, completada, fecha_reset
      INTO um_id, um_prog, um_compl, um_fecha
    FROM public.user_misiones
    WHERE user_id = v_user_id AND mision_id = m.id;

    um_exists := FOUND;

    IF um_exists AND um_compl AND um_fecha = p_fecha THEN
      CONTINUE;
    END IF;

    IF NOT um_exists OR um_fecha IS NULL OR um_fecha < p_fecha THEN
      v_prog := LEAST(v_count, m.meta);
    ELSE
      v_prog := GREATEST(COALESCE(um_prog, 0), LEAST(v_count, m.meta));
    END IF;

    v_compl := v_prog >= m.meta;
    v_nueva := v_compl AND NOT (um_exists AND um_compl AND um_fecha = p_fecha);

    IF NOT um_exists THEN
      INSERT INTO public.user_misiones
        (user_id, mision_id, progreso, completada, fecha_reset, fecha_completada)
      VALUES
        (v_user_id, m.id, v_prog, v_compl, p_fecha,
         CASE WHEN v_compl THEN NOW() ELSE NULL END);
    ELSE
      UPDATE public.user_misiones SET
        progreso         = v_prog,
        completada       = v_compl,
        fecha_reset      = p_fecha,
        fecha_completada = CASE WHEN v_nueva THEN NOW() ELSE fecha_completada END
      WHERE id = um_id;
    END IF;

    IF v_nueva THEN
      RETURN QUERY SELECT m.id, TRUE::BOOLEAN, m.recompensa_xp, m.recompensa_coins;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_misiones_diarias_hoy(DATE) TO authenticated;
