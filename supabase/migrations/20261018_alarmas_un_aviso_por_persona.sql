-- La alarma manda UN aviso por persona, no uno por pendiente.
--
-- La primera versión insertaba una notificación por cada cita sin retro. Al
-- probarla, a una sola persona le salieron 18 push de golpe. Eso no es una
-- alarma, es una avalancha, y el efecto real de una avalancha es que la gente
-- apaga las notificaciones de la app para siempre.
--
-- Ahora: una notificación por persona y por tipo, que dice CUÁNTOS lleva. Si
-- tiene 18 retros pendientes, recibe un aviso que dice 18, no 18 avisos.
CREATE OR REPLACE FUNCTION public.generar_alarmas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_hora int := EXTRACT(hour FROM (now() AT TIME ZONE 'America/Mexico_City'));
  v_leads int := 0;
  v_retros int := 0;
BEGIN
  -- Fuera de 8am–9pm no se molesta a nadie. Despertar a alguien a las 3am por
  -- una retro sería motivo suficiente para apagar las notificaciones.
  IF v_hora < 8 OR v_hora >= 21 THEN
    RETURN jsonb_build_object('ok', true, 'fuera_de_horario', true, 'hora_mx', v_hora);
  END IF;

  -- ── Leads sin contactar: un aviso por persona ──
  WITH pendientes AS (
    SELECT c.responsable_id AS uid, COUNT(*)::int AS n, MIN(c.nombre) AS ejemplo
      FROM public.clientes c
     WHERE c.responsable_id IS NOT NULL
       AND c.es_lead_campania
       AND c.eliminado_at IS NULL
       AND COALESCE(c.wa_count, 0) = 0 AND COALESCE(c.call_count, 0) = 0
       AND c.created_at > now() - interval '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.alarma_pospuesta ap
          WHERE ap.user_id = c.responsable_id AND ap.tipo = 'alarma_lead'
            AND ap.referencia_id = c.id AND ap.hasta > now())
     GROUP BY c.responsable_id
  ), listos AS (
    SELECT p.* FROM pendientes p
     -- No más de uno cada 30 minutos por persona…
     WHERE NOT EXISTS (
       SELECT 1 FROM public.notificaciones n
        WHERE n.user_id = p.uid AND n.tipo = 'alarma_lead'
          AND n.created_at > now() - interval '30 minutes')
       -- …ni más de 8 al día. Si después de 8 no lo atendió, insistir más no
       -- lo va a arreglar.
       AND (SELECT COUNT(*) FROM public.notificaciones n
             WHERE n.user_id = p.uid AND n.tipo = 'alarma_lead'
               AND n.created_at > now() - interval '24 hours') < 8
  ), insertados AS (
    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, push_enviado)
    SELECT l.uid,
           '🔔 ' || l.n || (CASE WHEN l.n = 1 THEN ' lead sin atender' ELSE ' leads sin atender' END),
           CASE WHEN l.n = 1
                THEN l.ejemplo || ' sigue sin contactar. Ábrelo o pospón el aviso en "Mi día".'
                ELSE 'Tienes ' || l.n || ' leads sin contactar, el primero es ' || l.ejemplo ||
                     '. Atiéndelos o pospón el aviso en "Mi día".' END,
           'alarma_lead', false
      FROM listos l
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_leads FROM insertados;

  -- ── Retros pendientes: un aviso por persona ──
  WITH pendientes AS (
    SELECT cv.asesor_id AS uid, COUNT(*)::int AS n, MIN(cv.cliente_nombre) AS ejemplo
      FROM public.citas_venta cv
     WHERE cv.asesor_id IS NOT NULL
       AND cv.retro_completada_at IS NULL
       AND cv.fecha_cita IS NOT NULL
       AND cv.fecha_cita < now()
       AND cv.fecha_cita > now() - interval '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.alarma_pospuesta ap
          WHERE ap.user_id = cv.asesor_id AND ap.tipo = 'alarma_retro'
            AND ap.referencia_id = cv.id AND ap.hasta > now())
     GROUP BY cv.asesor_id
  ), listos AS (
    SELECT p.* FROM pendientes p
     WHERE NOT EXISTS (
       SELECT 1 FROM public.notificaciones n
        WHERE n.user_id = p.uid AND n.tipo = 'alarma_retro'
          AND n.created_at > now() - interval '30 minutes')
       AND (SELECT COUNT(*) FROM public.notificaciones n
             WHERE n.user_id = p.uid AND n.tipo = 'alarma_retro'
               AND n.created_at > now() - interval '24 hours') < 8
  ), insertados AS (
    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, accion_url, push_enviado)
    SELECT l.uid,
           '📝 ' || l.n || (CASE WHEN l.n = 1 THEN ' retro pendiente' ELSE ' retros pendientes' END),
           CASE WHEN l.n = 1
                THEN 'Falta la retro de la cita de ' || COALESCE(l.ejemplo, 'un cliente') ||
                     '. Escríbela o pospón el aviso en "Mi día".'
                ELSE 'Tienes ' || l.n || ' citas sin retroalimentar. Escríbelas o pospón el aviso en "Mi día".' END,
           'alarma_retro', '/mi-dia', false
      FROM listos l
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_retros FROM insertados;

  RETURN jsonb_build_object('ok', true, 'avisos_leads', v_leads, 'avisos_retros', v_retros, 'hora_mx', v_hora);
END $fn$;

REVOKE ALL ON FUNCTION public.generar_alarmas() FROM public;
REVOKE ALL ON FUNCTION public.generar_alarmas() FROM authenticated;
