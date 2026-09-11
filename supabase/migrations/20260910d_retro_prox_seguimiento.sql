-- Al terminar la retroalimentación se puede fijar el "próximo seguimiento"
-- (fecha elegida en un calendario). Se guarda en citas_venta.fecha_prox_seguimiento.
-- Se agrega el parámetro p_prox_seguimiento (opcional) a guardar_retro_cita.

drop function if exists public.guardar_retro_cita(uuid, text, text, text);

create or replace function public.guardar_retro_cita(
  p_id uuid,
  p_como_estuvo text,
  p_info_extra text,
  p_plan_accion text,
  p_prox_seguimiento text default null
) returns void
language plpgsql security definer set search_path to 'public' as $function$
DECLARE v_rol text; v_ases uuid; v_cc uuid; v_todo boolean;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  SELECT asesor_id, cita_coordinacion_id INTO v_ases, v_cc FROM citas_venta WHERE id = p_id;
  IF v_rol NOT IN ('admin','supervisor') AND (v_ases IS NULL OR v_ases <> auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  v_todo := COALESCE(trim(p_como_estuvo),'') <> '' AND COALESCE(trim(p_info_extra),'') <> '' AND COALESCE(trim(p_plan_accion),'') <> '';
  UPDATE citas_venta SET
    retro_como_estuvo = p_como_estuvo,
    retro_info_extra  = p_info_extra,
    retro_plan_accion = p_plan_accion,
    retro_completada_at = now(),
    fecha_prox_seguimiento = COALESCE(NULLIF(trim(p_prox_seguimiento), ''), fecha_prox_seguimiento),
    estado_seguimiento = CASE WHEN v_todo THEN 'Realizada' ELSE estado_seguimiento END
  WHERE id = p_id;
  IF v_todo AND v_cc IS NOT NULL THEN
    UPDATE citas_coordinacion SET estado = 'realizada' WHERE id = v_cc;
  END IF;
END $function$;

grant execute on function public.guardar_retro_cita(uuid, text, text, text, text) to authenticated;
