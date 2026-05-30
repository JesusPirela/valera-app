-- ══════════════════════════════════════════════════════════════
-- FIX: sincronizar_misiones_diarias_hoy
-- Recibe la fecha en hora MX y nunca baja el progreso existente.
-- ══════════════════════════════════════════════════════════════

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
  um        RECORD;
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
    -- Contar actividad real de hoy (en hora MX) para esta categoría
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
      SELECT COUNT(*) INTO v_count
      FROM public.vu_progreso
      WHERE user_id = v_user_id
        AND (created_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;
    END IF;

    -- Obtener progreso actual
    SELECT * INTO um
    FROM public.user_misiones
    WHERE user_id = v_user_id AND mision_id = m.id;

    -- Si ya completada hoy, no tocar
    IF um.completada AND um.fecha_reset = p_fecha THEN
      CONTINUE;
    END IF;

    -- Si es un día nuevo, empezar desde el conteo real
    IF um.fecha_reset IS NULL OR um.fecha_reset < p_fecha THEN
      v_prog := LEAST(v_count, m.meta);
    ELSE
      -- Mismo día: tomar el MAYOR entre lo ya guardado y el conteo real (nunca bajar)
      v_prog := GREATEST(COALESCE(um.progreso, 0), LEAST(v_count, m.meta));
    END IF;

    v_compl := v_prog >= m.meta;
    v_nueva := v_compl AND NOT COALESCE(um.completada AND um.fecha_reset = p_fecha, false);

    IF um IS NULL THEN
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
      WHERE id = um.id;
    END IF;

    IF v_nueva THEN
      RETURN QUERY SELECT m.id, true, m.recompensa_xp, m.recompensa_coins;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_misiones_diarias_hoy(DATE) TO authenticated;
