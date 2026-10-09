-- La alarma guarda a qué cliente se refiere, cuando es uno solo.
--
-- El cuadro que sale encima de otras apps muestra, en su recuadro lila, el
-- nombre del lead con su zona y su presupuesto —igual que el popup que la app
-- enseña por dentro—. Esa es la información por la que la persona decide si
-- contesta ya o no; sin ella el cuadro diría "tienes un lead" y habría que
-- entrar a la app para saber cuál.
--
-- Solo se guarda cuando hay UN pendiente. Con varios no hay un cliente al que
-- apuntar y el cuadro se queda con el conteo del título, que ya dice cuántos.
CREATE OR REPLACE FUNCTION public.generar_alarmas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_hora  int := EXTRACT(hour FROM (now() AT TIME ZONE 'America/Mexico_City'));
  v_leads int := 0;
BEGIN
  IF v_hora < 8 OR v_hora >= 21 THEN
    RETURN jsonb_build_object('ok', true, 'fuera_de_horario', true, 'hora_mx', v_hora);
  END IF;

  WITH pendientes AS (
    SELECT c.responsable_id AS uid,
           COUNT(*)::int    AS n,
           MIN(c.nombre)    AS ejemplo,
           -- El id solo sirve si hay uno; con varios, MIN daría uno al azar.
           CASE WHEN COUNT(*) = 1 THEN MIN(c.id) END AS cliente
      FROM public.clientes c
     WHERE c.responsable_id IS NOT NULL
       AND c.es_lead_campania
       AND c.eliminado_at IS NULL
       -- Aquí es donde "atender" apaga la alarma: los botones de WhatsApp y
       -- Llamar en "Leads de campaña" suben estos dos contadores.
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
    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, cliente_id, accion_url, push_enviado)
    SELECT l.uid,
           '🔔 ' || l.n || (CASE WHEN l.n = 1 THEN ' lead sin atender' ELSE ' leads sin atender' END),
           CASE WHEN l.n = 1
                THEN l.ejemplo || ' sigue sin contactar. Mándale WhatsApp o llámalo, o pospón el aviso.'
                ELSE 'Tienes ' || l.n || ' leads sin contactar, el primero es ' || l.ejemplo ||
                     '. Mándales WhatsApp o llámalos, o pospón el aviso.' END,
           'alarma_lead', l.cliente, '/leads-campania', false
      FROM listos l
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_leads FROM insertados;

  RETURN jsonb_build_object('ok', true, 'avisos_leads', v_leads, 'retros', 'apagadas', 'hora_mx', v_hora);
END $fn$;

REVOKE ALL ON FUNCTION public.generar_alarmas() FROM public;
REVOKE ALL ON FUNCTION public.generar_alarmas() FROM authenticated;
