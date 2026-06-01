-- ── 1. Agregar completado_at a recordatorios ─────────────────
-- Sin esta columna no hay forma de saber CUÁNDO se completó un seguimiento
ALTER TABLE public.recordatorios
  ADD COLUMN IF NOT EXISTS completado_at TIMESTAMPTZ;

-- Rellenar histórico: si ya está completado, usar created_at como aproximación
UPDATE public.recordatorios
SET completado_at = created_at
WHERE completado = TRUE AND completado_at IS NULL;

-- Trigger: cuando completado pasa de FALSE → TRUE, registrar el momento
CREATE OR REPLACE FUNCTION public.set_completado_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.completado = TRUE AND (OLD.completado = FALSE OR OLD.completado IS NULL) THEN
    NEW.completado_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recordatorios_completado_at ON public.recordatorios;
CREATE TRIGGER trg_recordatorios_completado_at
  BEFORE UPDATE ON public.recordatorios
  FOR EACH ROW EXECUTE FUNCTION public.set_completado_at();


-- ── 2. Corregir get_actividad_periodo ────────────────────────
-- Bugs corregidos:
--   - recordatorios: usaba updated_at (no existe) → usar completado_at
--   - vu_progreso:   usaba created_at (no existe) → usar completada_at
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

  v_fin    := ((NOW() AT TIME ZONE 'America/Mexico_City')::DATE::TIMESTAMP
                AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'UTC' + INTERVAL '1 day';
  v_inicio := v_fin - (p_dias || ' days')::INTERVAL;

  RETURN QUERY SELECT
    (SELECT COUNT(*)::INTEGER FROM clientes
       WHERE responsable_id = v_user_id
         AND created_at >= v_inicio AND created_at < v_fin),

    (SELECT COUNT(*)::INTEGER FROM propiedad_publicacion
       WHERE user_id = v_user_id
         AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin),

    -- completado_at: cuándo se marcó como completado (columna recién agregada)
    (SELECT COUNT(*)::INTEGER FROM recordatorios
       WHERE user_id = v_user_id AND completado = TRUE
         AND completado_at >= v_inicio AND completado_at < v_fin),

    (SELECT COUNT(*)::INTEGER FROM interacciones
       WHERE user_id = v_user_id
         AND created_at >= v_inicio AND created_at < v_fin),

    -- completada_at: nombre real de la columna en vu_progreso
    (SELECT COUNT(*)::INTEGER FROM vu_progreso
       WHERE user_id = v_user_id
         AND completada_at >= v_inicio AND completada_at < v_fin),

    -- Primer movimiento del período
    (SELECT MIN(ts) FROM (
       SELECT MIN(created_at)        ts FROM clientes              WHERE responsable_id = v_user_id AND created_at        >= v_inicio AND created_at        < v_fin
       UNION ALL
       SELECT MIN(fecha_publicacion) ts FROM propiedad_publicacion WHERE user_id = v_user_id        AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin
       UNION ALL
       SELECT MIN(created_at)        ts FROM interacciones         WHERE user_id = v_user_id        AND created_at        >= v_inicio AND created_at        < v_fin
       UNION ALL
       SELECT MIN(completado_at)     ts FROM recordatorios         WHERE user_id = v_user_id AND completado = TRUE AND completado_at >= v_inicio AND completado_at < v_fin
     ) _m WHERE ts IS NOT NULL),

    -- Último movimiento del período
    (SELECT MAX(ts) FROM (
       SELECT MAX(created_at)        ts FROM clientes              WHERE responsable_id = v_user_id AND created_at        >= v_inicio AND created_at        < v_fin
       UNION ALL
       SELECT MAX(fecha_publicacion) ts FROM propiedad_publicacion WHERE user_id = v_user_id        AND fecha_publicacion >= v_inicio AND fecha_publicacion < v_fin
       UNION ALL
       SELECT MAX(created_at)        ts FROM interacciones         WHERE user_id = v_user_id        AND created_at        >= v_inicio AND created_at        < v_fin
       UNION ALL
       SELECT MAX(completado_at)     ts FROM recordatorios         WHERE user_id = v_user_id AND completado = TRUE AND completado_at >= v_inicio AND completado_at < v_fin
     ) _m WHERE ts IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_actividad_periodo TO authenticated;
