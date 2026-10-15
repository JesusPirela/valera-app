-- Dos fallas de la alarma, medidas en la cuenta de pruebas.
--
-- Lo que pasó: pospuso con "Mañana" a las 18:00 del 14/oct. El aviso volvió a
-- las 14:05 del 15 y de ahí siguió CADA 5 MINUTOS: 12 alarmas en una hora, 19
-- en treinta horas.
--
-- ── Falla 1: "Mañana" no era mañana ────────────────────────────────────────
-- Los dos botones —el de la app y el del cuadro de Android— mandan 1200
-- minutos, o sea "+20 horas". Pospuesto a las 6 de la tarde eso cae a las 2
-- de la tarde del día siguiente; pospuesto a las 8 de la mañana caería a las 4
-- de la madrugada. La etiqueta promete un día y el código entrega un número
-- fijo de horas.
--
-- Se arregla AQUÍ y no en los botones a propósito: el del cuadro de Android
-- vive dentro del binario y cambiarlo pedía otra build. Desde el servidor
-- quedan buenos los dos sin tocar ningún teléfono.
--
-- ── Falla 2: al vencerse el pospuesto, martilleo ───────────────────────────
-- El intervalo era de 5 minutos fijos y el tope de 150 avisos por día. Cinco
-- minutos tiene sentido en los primeros momentos de un lead recién caído —esa
-- es la carrera que se quiere ganar—, pero no para uno que ya viste y
-- pospusiste a mañana. Y 150 al día no es un tope, es permiso para martillear.
--
-- Ahora el intervalo se abre solo según cuántos avisos lleve la persona ese
-- día: los primeros 4 van cada 5 minutos (la ventana que importa), luego cada
-- 20, y después cada hora. Tope de 16 al día.
--
-- Con eso, un lead nuevo sigue sonando igual de insistente en sus primeros 20
-- minutos, y el que vuelve de un pospuesto ya no se convierte en una ráfaga.

-- ── "Mañana" es mañana a las 8 ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.posponer_alarma_todo(p_tipo text, p_minutos integer DEFAULT 60)
RETURNS jsonb
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

  IF p_minutos >= 1200 THEN
    -- "Mañana" = mañana a las 8:00 de México, que es cuando abre la ventana de
    -- avisos. No "+20 horas", que caía a mitad de la tarde o de madrugada
    -- según a qué hora le picaras.
    v_hasta := ((((now() AT TIME ZONE 'America/Mexico_City')::date + 1)
                 + time '08:00') AT TIME ZONE 'America/Mexico_City');
  ELSE
    -- Mínimo 5 minutos: posponer "0" dejaría la alarma sonando otra vez al
    -- minuto siguiente y parecería que el botón falla.
    v_hasta := now() + make_interval(mins => GREATEST(p_minutos, 5));
  END IF;

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

-- ── El aviso se va espaciando solo ─────────────────────────────────────────
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
  ), llevadas AS (
    -- Cuántas alarmas lleva ya cada persona hoy, y cuándo fue la última.
    SELECT n.user_id, COUNT(*)::int AS hoy, MAX(n.created_at) AS ultima
      FROM public.notificaciones n
     WHERE n.tipo = 'alarma_lead'
       AND n.created_at > now() - interval '24 hours'
     GROUP BY n.user_id
  ), listos AS (
    SELECT p.* FROM pendientes p
      LEFT JOIN llevadas l ON l.user_id = p.uid
      -- Tope del día. Antes eran 150, que no es un tope.
     WHERE COALESCE(l.hoy, 0) < 16
       -- El intervalo se abre conforme se acumulan avisos: los primeros 4 cada
       -- 5 minutos, que es la carrera que importa con un lead recién caído;
       -- luego cada 20; después cada hora.
       AND (l.ultima IS NULL OR l.ultima < now() - (
             CASE WHEN COALESCE(l.hoy, 0) < 4  THEN interval '5 minutes'
                  WHEN COALESCE(l.hoy, 0) < 10 THEN interval '20 minutes'
                  ELSE interval '60 minutes'
             END))
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
