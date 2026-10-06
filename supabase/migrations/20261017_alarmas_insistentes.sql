-- Alarma que insiste: avisa FUERA de la app (push al celular) cuando alguien
-- tiene un lead sin atender o una retro pendiente, y vuelve a avisar cada rato
-- hasta que lo atienda o lo posponga.
--
-- Por qué funciona SIN actualizar la app: el push ya está vivo y probado —60 de
-- los 66 usuarios activos tienen token registrado y en 7 días salieron 2,452
-- notificaciones, todas entregadas—. Basta con meter filas en `notificaciones`:
-- el cron de procesar-pushes las recoge cada minuto y las manda con sonido. No
-- hace falta tocar la app de los celulares.
--
-- Tres frenos, porque una alarma mal puesta es peor que no tenerla:
--   · SOLO entre 8am y 9pm hora de México. Despertar a alguien a las 3am por
--     una retro sería motivo suficiente para apagar las notificaciones de la
--     app para siempre.
--   · Como mucho una cada 30 minutos por pendiente.
--   · Tope de 8 avisos por pendiente. Si después de 8 no lo atendió, el
--     problema no se arregla insistiendo más.

ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio','nuevo_cliente','login',
    'tienda','ruleta','cofre','lead_caliente','apartado','registro_constructora',
    'sistema','cita','ascenso_rol','bajada_precio','coleccion_favorito','solicitud_web',
    'anuncio',
    'alarma_lead','alarma_retro'
  ]));

-- ── Posponer ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alarma_pospuesta (
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo          text NOT NULL,
  referencia_id uuid NOT NULL,
  hasta         timestamptz NOT NULL,
  veces         int NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, tipo, referencia_id)
);

ALTER TABLE public.alarma_pospuesta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alarma_propia" ON public.alarma_pospuesta;
CREATE POLICY "alarma_propia" ON public.alarma_pospuesta
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.posponer_alarma(
  p_tipo text, p_referencia_id uuid, p_minutos int DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no autenticado'); END IF;
  IF p_tipo NOT IN ('alarma_lead', 'alarma_retro') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo desconocido');
  END IF;

  INSERT INTO public.alarma_pospuesta (user_id, tipo, referencia_id, hasta, veces)
  VALUES (v_uid, p_tipo, p_referencia_id, now() + make_interval(mins => GREATEST(p_minutos, 5)), 1)
  ON CONFLICT (user_id, tipo, referencia_id) DO UPDATE
    SET hasta = now() + make_interval(mins => GREATEST(p_minutos, 5)),
        veces = public.alarma_pospuesta.veces + 1;

  RETURN jsonb_build_object('ok', true, 'hasta', now() + make_interval(mins => GREATEST(p_minutos, 5)));
END $fn$;

GRANT EXECUTE ON FUNCTION public.posponer_alarma(text, uuid, int) TO authenticated;

-- ── Qué tiene pendiente quien llama (para la pantalla de la app) ─────────────
CREATE OR REPLACE FUNCTION public.mis_pendientes_alarma()
RETURNS TABLE(tipo text, referencia_id uuid, titulo text, detalle text,
              desde timestamptz, pospuesta_hasta timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  -- Leads que llegaron y nadie ha contactado.
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

  UNION ALL

  -- Citas que ya pasaron y siguen sin retroalimentación.
  SELECT 'alarma_retro', cv.id, cv.cliente_nombre,
         'Cita sin retroalimentar' || COALESCE(' · ' || cv.dia_cita, ''),
         cv.fecha_cita,
         (SELECT ap.hasta FROM public.alarma_pospuesta ap
           WHERE ap.user_id = auth.uid() AND ap.tipo = 'alarma_retro' AND ap.referencia_id = cv.id)
    FROM public.citas_venta cv
   WHERE cv.asesor_id = auth.uid()
     AND cv.retro_completada_at IS NULL
     AND cv.fecha_cita IS NOT NULL
     AND cv.fecha_cita < now()
     AND cv.fecha_cita > now() - interval '30 days'
   ORDER BY 5 DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.mis_pendientes_alarma() TO authenticated;

-- ── El motor: genera los avisos ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generar_alarmas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_hora int := EXTRACT(hour FROM (now() AT TIME ZONE 'America/Mexico_City'));
  v_leads int := 0;
  v_retros int := 0;
BEGIN
  -- Fuera de 8am–9pm no se molesta a nadie.
  IF v_hora < 8 OR v_hora >= 21 THEN
    RETURN jsonb_build_object('ok', true, 'fuera_de_horario', true, 'hora_mx', v_hora);
  END IF;

  -- ── Leads sin contactar ──
  WITH pendientes AS (
    SELECT c.id, c.nombre, c.responsable_id, c.fuente_lead
      FROM public.clientes c
     WHERE c.responsable_id IS NOT NULL
       AND c.es_lead_campania
       AND c.eliminado_at IS NULL
       AND COALESCE(c.wa_count, 0) = 0 AND COALESCE(c.call_count, 0) = 0
       AND c.created_at > now() - interval '7 days'
       -- No pospuesto.
       AND NOT EXISTS (
         SELECT 1 FROM public.alarma_pospuesta ap
          WHERE ap.user_id = c.responsable_id AND ap.tipo = 'alarma_lead'
            AND ap.referencia_id = c.id AND ap.hasta > now())
       -- Ni avisado hace menos de 30 min.
       AND NOT EXISTS (
         SELECT 1 FROM public.notificaciones n
          WHERE n.user_id = c.responsable_id AND n.tipo = 'alarma_lead'
            AND n.cliente_id = c.id AND n.created_at > now() - interval '30 minutes')
       -- Ni más de 8 veces en total.
       AND (SELECT COUNT(*) FROM public.notificaciones n
             WHERE n.user_id = c.responsable_id AND n.tipo = 'alarma_lead'
               AND n.cliente_id = c.id) < 8
  ), insertados AS (
    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, cliente_id, push_enviado)
    SELECT p.responsable_id,
           '🔔 Lead sin atender',
           p.nombre || ' lleva esperando. Contáctalo o pospón el aviso desde la app.',
           'alarma_lead', p.id, false
      FROM pendientes p
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_leads FROM insertados;

  -- ── Retros pendientes ──
  WITH pendientes AS (
    SELECT cv.id, cv.cliente_nombre, cv.asesor_id, cv.dia_cita
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
       AND NOT EXISTS (
         SELECT 1 FROM public.notificaciones n
          WHERE n.user_id = cv.asesor_id AND n.tipo = 'alarma_retro'
            AND n.accion_url = '/citas-venta?retro=' || cv.id::text
            AND n.created_at > now() - interval '30 minutes')
       AND (SELECT COUNT(*) FROM public.notificaciones n
             WHERE n.user_id = cv.asesor_id AND n.tipo = 'alarma_retro'
               AND n.accion_url = '/citas-venta?retro=' || cv.id::text) < 8
  ), insertados AS (
    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, accion_url, push_enviado)
    SELECT p.asesor_id,
           '📝 Retro pendiente',
           'Falta la retroalimentación de la cita de ' || COALESCE(p.cliente_nombre, 'un cliente') ||
           '. Escríbela o pospón el aviso desde la app.',
           'alarma_retro', '/citas-venta?retro=' || p.id::text, false
      FROM pendientes p
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_retros FROM insertados;

  RETURN jsonb_build_object('ok', true, 'leads', v_leads, 'retros', v_retros, 'hora_mx', v_hora);
END $fn$;

-- Solo el cron la ejecuta.
REVOKE ALL ON FUNCTION public.generar_alarmas() FROM public;
REVOKE ALL ON FUNCTION public.generar_alarmas() FROM authenticated;

-- ── Cron cada 15 minutos ─────────────────────────────────────────────────────
-- No hace falta más seguido: el freno de 30 min por pendiente manda, y correr
-- cada 15 reparte el trabajo sin acumular.
SELECT cron.unschedule('generar-alarmas')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generar-alarmas');

SELECT cron.schedule('generar-alarmas', '*/15 * * * *', $cron$
  SELECT public.generar_alarmas();
$cron$);
