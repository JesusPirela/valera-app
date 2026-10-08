-- La alarma pasa a insistir cada 5 minutos, no cada 30.
--
-- Qué la calla, que es lo que de verdad importa de una alarma insistente:
--   · Un lead: picarle a WhatsApp o a Llamar en "Leads de campaña". Esos
--     botones suben wa_count y call_count, y el filtro de abajo exige que los
--     dos esten en cero. Atender = contactar, no = abrir la app.
--   · Una retro: escribirla (retro_completada_at deja de ser nulo).
--   · Cualquiera de las dos: el boton Posponer, que da una hora de silencio.
--
-- El tope diario sube de 8 a 150. Con 8 avisos cada 5 minutos la alarma se
-- callaba sola a los 40 minutos, que es justo lo contrario de insistir. 150 es
-- la ventana completa de 8am-9pm a este ritmo: en uso normal nunca se alcanza
-- —se llega antes al contacto o al posponer—, y sigue siendo un freno si algun
-- dia el generador se dispara mas seguido de la cuenta.
--
-- Lo que NO cambia: la franja de 8am a 9pm hora de Mexico. Despertar a alguien
-- a las 3am por una retro seria motivo suficiente para apagar las
-- notificaciones de la app para siempre.
CREATE OR REPLACE FUNCTION public.generar_alarmas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_hora   int := EXTRACT(hour FROM (now() AT TIME ZONE 'America/Mexico_City'));
  v_leads  int := 0;
  v_retros int := 0;
BEGIN
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
       -- Aqui es donde "atender" apaga la alarma.
       AND COALESCE(c.wa_count, 0) = 0 AND COALESCE(c.call_count, 0) = 0
       AND c.created_at > now() - interval '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.alarma_pospuesta ap
          WHERE ap.user_id = c.responsable_id AND ap.tipo = 'alarma_lead'
            AND ap.referencia_id = c.id AND ap.hasta > now())
     GROUP BY c.responsable_id
  ), listos AS (
    SELECT p.* FROM pendientes p
     WHERE NOT EXISTS (
       SELECT 1 FROM public.notificaciones n
        WHERE n.user_id = p.uid AND n.tipo = 'alarma_lead'
          AND n.created_at > now() - interval '5 minutes')
       AND (SELECT COUNT(*) FROM public.notificaciones n
             WHERE n.user_id = p.uid AND n.tipo = 'alarma_lead'
               AND n.created_at > now() - interval '24 hours') < 150
  ), insertados AS (
    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, accion_url, push_enviado)
    SELECT l.uid,
           '🔔 ' || l.n || (CASE WHEN l.n = 1 THEN ' lead sin atender' ELSE ' leads sin atender' END),
           CASE WHEN l.n = 1
                THEN l.ejemplo || ' sigue sin contactar. Mándale WhatsApp o llámalo, o pospón el aviso.'
                ELSE 'Tienes ' || l.n || ' leads sin contactar, el primero es ' || l.ejemplo ||
                     '. Mándales WhatsApp o llámalos, o pospón el aviso.' END,
           'alarma_lead', '/leads-campania', false
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
          AND n.created_at > now() - interval '5 minutes')
       AND (SELECT COUNT(*) FROM public.notificaciones n
             WHERE n.user_id = p.uid AND n.tipo = 'alarma_retro'
               AND n.created_at > now() - interval '24 hours') < 150
  ), insertados AS (
    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, accion_url, push_enviado)
    SELECT l.uid,
           '📝 ' || l.n || (CASE WHEN l.n = 1 THEN ' retro pendiente' ELSE ' retros pendientes' END),
           CASE WHEN l.n = 1
                THEN 'Falta la retro de la cita de ' || COALESCE(l.ejemplo, 'un cliente') ||
                     '. Escríbela o pospón el aviso.'
                ELSE 'Tienes ' || l.n || ' citas sin retroalimentar. Escríbelas o pospón el aviso.' END,
           'alarma_retro', '/mis-retros', false
      FROM listos l
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_retros FROM insertados;

  RETURN jsonb_build_object('ok', true, 'avisos_leads', v_leads, 'avisos_retros', v_retros, 'hora_mx', v_hora);
END $fn$;

REVOKE ALL ON FUNCTION public.generar_alarmas() FROM public;
REVOKE ALL ON FUNCTION public.generar_alarmas() FROM authenticated;
