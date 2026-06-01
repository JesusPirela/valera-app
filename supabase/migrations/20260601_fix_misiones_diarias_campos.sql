-- Corregir sincronizar_misiones_diarias_hoy:
--   - seguimiento: usaba recordatorios.updated_at (no existe) → completado_at
--   - curso:       usaba vu_progreso.created_at    (no existe) → completada_at
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
      -- completado_at: cuándo se marcó completado (columna agregada en fix_actividad_campos)
      SELECT COUNT(*) INTO v_count
      FROM public.recordatorios
      WHERE user_id = v_user_id AND completado = true
        AND completado_at IS NOT NULL
        AND (completado_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;

    ELSIF m.categoria = 'interaccion' THEN
      SELECT COUNT(*) INTO v_count
      FROM public.interacciones
      WHERE user_id = v_user_id
        AND (created_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;

    ELSIF m.categoria = 'curso' THEN
      -- completada_at: nombre real de la columna en vu_progreso
      SELECT COUNT(*) INTO v_count
      FROM public.vu_progreso
      WHERE user_id = v_user_id
        AND (completada_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;
    END IF;

    -- Leer progreso actual
    SELECT id, progreso, completada, fecha_reset
      INTO um_id, um_prog, um_compl, um_fecha
    FROM public.user_misiones
    WHERE user_id = v_user_id AND mision_id = m.id;

    um_exists := FOUND;

    -- Si ya completada hoy, no tocar
    IF um_exists AND um_compl AND um_fecha = p_fecha THEN
      CONTINUE;
    END IF;

    -- Calcular progreso: tomar el MAYOR entre lo guardado hoy y el conteo real
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
