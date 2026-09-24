-- El gerente no podía guardar nada en Citas de venta, y fallaba EN SILENCIO.
--
-- citas_venta solo tenía dos políticas: ALL para admin y SELECT para gerente.
-- Al editar un campo, el UPDATE del gerente no afectaba ninguna fila (RLS la
-- filtraba) y PostgREST responde 204 igual que si hubiera guardado, así que la
-- app daba el cambio por bueno y al recargar no estaba.
--
-- Lo mismo con la retro y la cancelación: guardar_retro_cita y
-- cancelar_cita_venta solo admitían admin/supervisor/asesor-dueño, así que al
-- gerente le lanzaban 'No autorizado' — error que el wizard se tragaba.
--
-- Aplicada a producción el 2026-09-23 y verificada.

-- 1) Permiso de escritura para gerente.
DROP POLICY IF EXISTS gerente_write_citas_venta ON public.citas_venta;
CREATE POLICY gerente_write_citas_venta ON public.citas_venta FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gerente'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gerente'));

-- 2) Retro: incluir 'gerente'.
CREATE OR REPLACE FUNCTION public.guardar_retro_cita(p_id uuid, p_como_estuvo text, p_info_extra text,
  p_plan_accion text, p_prox_seguimiento text DEFAULT NULL, p_prox_seguimiento_ts timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text; v_ases uuid; v_cc uuid; v_todo boolean;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  SELECT asesor_id, cita_coordinacion_id INTO v_ases, v_cc FROM citas_venta WHERE id = p_id;
  IF v_rol NOT IN ('admin','supervisor','gerente') AND (v_ases IS NULL OR v_ases <> auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  v_todo := COALESCE(trim(p_como_estuvo),'') <> '' AND COALESCE(trim(p_info_extra),'') <> '' AND COALESCE(trim(p_plan_accion),'') <> '';
  UPDATE citas_venta SET
    retro_como_estuvo = p_como_estuvo, retro_info_extra = p_info_extra, retro_plan_accion = p_plan_accion,
    retro_completada_at = now(),
    fecha_prox_seguimiento = COALESCE(NULLIF(trim(p_prox_seguimiento), ''), fecha_prox_seguimiento),
    fecha_prox_seguimiento_ts = COALESCE(p_prox_seguimiento_ts, fecha_prox_seguimiento_ts),
    estado_seguimiento = CASE WHEN v_todo THEN 'Realizada' ELSE estado_seguimiento END
  WHERE id = p_id;
  IF v_todo AND v_cc IS NOT NULL THEN
    UPDATE citas_coordinacion SET estado = 'realizada' WHERE id = v_cc;
  END IF;
END $fn$;

-- 3) Cancelación: incluir 'gerente'.
CREATE OR REPLACE FUNCTION public.cancelar_cita_venta(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text; v_ases uuid; v_cc uuid;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id=auth.uid();
  SELECT asesor_id, cita_coordinacion_id INTO v_ases, v_cc FROM citas_venta WHERE id=p_id;
  IF v_rol NOT IN ('admin','supervisor','gerente') AND (v_ases IS NULL OR v_ases<>auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_cc IS NOT NULL THEN UPDATE citas_coordinacion SET estado='cancelada' WHERE id=v_cc; END IF;
  UPDATE citas_venta SET estado_seguimiento='CANCELADA' WHERE id=p_id;
END $fn$;
