-- La alarma queda SOLO para leads de campaña. Las retros no suenan.
--
-- Decisión del negocio, no limitación técnica: se quiere estrenar la alarma
-- con los leads, que es donde la respuesta rápida vale dinero, y no empezar
-- taladrando a seis personas por retros de hasta 30 días atrás.
--
-- Se quita de los dos lados, y es importante que sea de los dos:
--   · generar_alarmas()      — deja de mandar el push de retros.
--   · mis_pendientes_alarma() — deja de listarlas en el panel de "Mi día".
-- Si solo se quitara del primero, el panel seguiría diciendo "la app te va a
-- estar avisando al celular" sobre algo que ya no avisa, y encima el botón
-- Posponer serviría para silenciar una alarma que no existe.
--
-- ── Para volver a encender las retros ───────────────────────────────────────
-- El código íntegro de las dos ramas está en 20261028_alarma_cada_5_minutos.sql
-- (push) y en 20261017_alarmas_insistentes.sql (panel). Basta con reaplicar
-- esos dos archivos.
CREATE OR REPLACE FUNCTION public.generar_alarmas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_hora  int := EXTRACT(hour FROM (now() AT TIME ZONE 'America/Mexico_City'));
  v_leads int := 0;
BEGIN
  -- Fuera de 8am-9pm no se molesta a nadie.
  IF v_hora < 8 OR v_hora >= 21 THEN
    RETURN jsonb_build_object('ok', true, 'fuera_de_horario', true, 'hora_mx', v_hora);
  END IF;

  WITH pendientes AS (
    SELECT c.responsable_id AS uid, COUNT(*)::int AS n, MIN(c.nombre) AS ejemplo
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

  RETURN jsonb_build_object('ok', true, 'avisos_leads', v_leads, 'retros', 'apagadas', 'hora_mx', v_hora);
END $fn$;

REVOKE ALL ON FUNCTION public.generar_alarmas() FROM public;
REVOKE ALL ON FUNCTION public.generar_alarmas() FROM authenticated;

-- El panel de "Mi día": tampoco lista retros.
CREATE OR REPLACE FUNCTION public.mis_pendientes_alarma()
RETURNS TABLE(tipo text, referencia_id uuid, titulo text, detalle text,
              desde timestamptz, pospuesta_hasta timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT 'alarma_lead', c.id, c.nombre,
         'Lead sin contactar' || COALESCE(' · ' || c.fuente_lead, ''),
         c.created_at,
         (SELECT ap.hasta FROM public.alarma_pospuesta ap
           WHERE ap.user_id = auth.uid() AND ap.tipo = 'alarma_lead' AND ap.referencia_id = c.id)
    FROM public.clientes c
   WHERE c.responsable_id = auth.uid()
     AND c.es_lead_campania
     AND c.eliminado_at IS NULL
     AND COALESCE(c.wa_count, 0) = 0 AND COALESCE(c.call_count, 0) = 0
     AND c.created_at > now() - interval '7 days'
   ORDER BY 5 DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.mis_pendientes_alarma() TO authenticated;
