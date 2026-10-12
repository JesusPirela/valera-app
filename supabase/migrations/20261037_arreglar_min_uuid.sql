-- Arregla generar_alarmas(), que llevaba fallando en CADA corrida.
--
-- La migración 20261034 añadió "MIN(c.id)" para guardar a qué cliente se
-- refiere el aviso. MIN() no existe para uuid en Postgres, así que la función
-- reventaba entera con "function min(uuid) does not exist" y el cron no
-- generaba NI UNA alarma. Los avisos que llegaron en las pruebas fueron todos
-- insertados a mano, lo que oculto el fallo.
--
-- Lo que hay que aprender de esto: aplicar una migración sin EJECUTAR la
-- función que modifica no prueba nada. El CREATE FUNCTION compila el cuerpo
-- solo superficialmente; un tipo mal casado no salta hasta que corre.
--
-- En vez de MIN se usa array_agg ordenado por fecha: toma el id del lead más
-- antiguo, que además es el que conviene mostrar —el que lleva más tiempo
-- esperando—, y es determinista, cosa que MIN sobre un uuid no sería ni
-- aunque existiera.
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
           (array_agg(c.nombre ORDER BY c.created_at))[1] AS ejemplo,
           -- Solo sirve si hay UNO: con varios no hay a quién apuntar y el
           -- título ya dice cuántos son.
           CASE WHEN COUNT(*) = 1
                THEN (array_agg(c.id ORDER BY c.created_at))[1]
           END AS cliente
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

  RETURN jsonb_build_object('ok', true, 'avisos_leads', v_leads, 'hora_mx', v_hora);
END $fn$;

REVOKE ALL ON FUNCTION public.generar_alarmas() FROM public;
REVOKE ALL ON FUNCTION public.generar_alarmas() FROM authenticated;
