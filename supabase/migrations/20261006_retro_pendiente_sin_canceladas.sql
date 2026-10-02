-- Marcar una cita como cancelada dejaba al asesor en un bucle.
--
-- El popup de "tienes citas por retroalimentar" pide las citas con
-- retro_completada_at IS NULL. Y cancelar_cita_venta pone el estado en
-- 'CANCELADA/REAGENDA' pero NO toca retro_completada_at, porque no hubo retro.
--
-- Resultado: el asesor abría el popup, pulsaba "Se canceló / reagendó", se
-- cerraba... y la cita seguía contando como pendiente, así que el popup volvía
-- a salir. Y otra vez. Sin forma de salir.
--
-- Se excluyen las canceladas de la lista de pendientes. NO se les pone
-- retro_completada_at: sería mentir, y entonces la tabla de citas de venta y el
-- tablero dirían "retroalimentación escrita" en una cita que nunca la tuvo.
-- Lo que pasa es que ya no hay nada que retroalimentar, que es distinto.
--
-- Había 2 citas atrapadas así, de 2 asesores.
CREATE OR REPLACE FUNCTION public.get_mis_citas_pendientes_retro()
RETURNS TABLE(id uuid, cliente_nombre text, telefono text, detalles_pago text,
              interesado_en text, dia_cita text, prospecto text, coordino text, atendio text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT id, cliente_nombre, telefono, detalles_pago, interesado_en, dia_cita, prospecto, coordino, atendio
  FROM citas_venta
  WHERE asesor_id = auth.uid()
    AND retro_completada_at IS NULL
    -- Cancelada o reagendada: no hay cita de la que hablar.
    AND COALESCE(estado_seguimiento, '') NOT ILIKE '%cancel%'
    AND fecha_cita >= '2026-08-01'::timestamptz
  ORDER BY created_at DESC;
$function$;
