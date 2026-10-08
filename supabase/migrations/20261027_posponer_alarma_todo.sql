-- Posponer TODO lo de un tipo de un golpe.
--
-- La alarma manda un aviso por persona que dice cuántos pendientes lleva
-- ("3 leads sin atender"), no uno por pendiente. Así que el botón "Posponer 1 h"
-- de la notificación no tiene un solo pendiente al que apuntar: posponer_alarma()
-- pide un referencia_id y aquí no hay uno, hay tres.
--
-- Esta función pospone todos los pendientes de ese tipo que tenga quien llama.
-- Las condiciones son LAS MISMAS que usa generar_alarmas() para decidir a quién
-- avisar; si se separan, el usuario pospondría una cosa y le seguiría sonando
-- por otra.
CREATE OR REPLACE FUNCTION public.posponer_alarma_todo(
  p_tipo text, p_minutos int DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_hasta timestamptz;
  v_n     int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no autenticado');
  END IF;
  IF p_tipo NOT IN ('alarma_lead', 'alarma_retro') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo desconocido');
  END IF;

  -- Mínimo 5 minutos, igual que posponer_alarma(): posponer "0" dejaría la
  -- alarma sonando otra vez al minuto siguiente y parecería que el botón falla.
  v_hasta := now() + make_interval(mins => GREATEST(p_minutos, 5));

  IF p_tipo = 'alarma_lead' THEN
    INSERT INTO public.alarma_pospuesta (user_id, tipo, referencia_id, hasta, veces)
    SELECT v_uid, 'alarma_lead', c.id, v_hasta, 1
      FROM public.clientes c
     WHERE c.responsable_id = v_uid
       AND c.es_lead_campania
       AND c.eliminado_at IS NULL
       AND COALESCE(c.wa_count, 0) = 0 AND COALESCE(c.call_count, 0) = 0
       AND c.created_at > now() - interval '7 days'
    ON CONFLICT (user_id, tipo, referencia_id) DO UPDATE
      SET hasta = EXCLUDED.hasta,
          veces = public.alarma_pospuesta.veces + 1;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    INSERT INTO public.alarma_pospuesta (user_id, tipo, referencia_id, hasta, veces)
    SELECT v_uid, 'alarma_retro', cv.id, v_hasta, 1
      FROM public.citas_venta cv
     WHERE cv.asesor_id = v_uid
       AND cv.retro_completada_at IS NULL
       AND cv.fecha_cita IS NOT NULL
       AND cv.fecha_cita < now()
       AND cv.fecha_cita > now() - interval '30 days'
    ON CONFLICT (user_id, tipo, referencia_id) DO UPDATE
      SET hasta = EXCLUDED.hasta,
          veces = public.alarma_pospuesta.veces + 1;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'pospuestos', v_n, 'hasta', v_hasta);
END $fn$;

GRANT EXECUTE ON FUNCTION public.posponer_alarma_todo(text, int) TO authenticated;
