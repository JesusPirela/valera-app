-- Lo que la app de alarmas necesita de la base, y nada más.
--
-- La app de alarmas es un programa aparte. En vez de abrirle las tablas, se le
-- dan dos funciones que hacen exactamente lo que necesita y solo sobre los
-- leads de quien llama. Si mañana la app se compromete, lo más que puede hacer
-- es leer y atender los leads de esa persona, que es lo que ya puede hacer
-- esa persona en Valera.
--
-- Por qué funciones nuevas y no las que ya existen:
--   · mis_pendientes_alarma() no devuelve el TELÉFONO, y sin él los botones de
--     WhatsApp y llamar no tienen a quién marcarle.
--   · registrar_contacto_cliente() anota la interacción para las estadísticas
--     pero NO sube wa_count/call_count, que es lo que apaga la alarma. En
--     Valera eso lo hace la pantalla por su cuenta con un update directo. La
--     app de alarmas no tiene esa pantalla, así que aquí van las dos cosas
--     juntas: si quedaran separadas, se podría atender un lead y que la alarma
--     siguiera sonando.

-- ── Los leads que están haciendo sonar la alarma ───────────────────────────
-- Mismos criterios que generar_alarmas(), a propósito: lo que la app enseña
-- tiene que ser exactamente lo que suena, o la gente ve una lista que no
-- corresponde con lo que le está gritando el teléfono.
CREATE OR REPLACE FUNCTION public.mis_leads_alarma()
RETURNS TABLE(
  id uuid, nombre text, telefono text,
  zona text, presupuesto text,
  desde timestamptz, pospuesto_hasta timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $fn$
  SELECT c.id, c.nombre, c.telefono, c.zona_busqueda, c.presupuesto, c.created_at,
         (SELECT ap.hasta FROM public.alarma_pospuesta ap
           WHERE ap.user_id = c.responsable_id AND ap.tipo = 'alarma_lead'
             AND ap.referencia_id = c.id AND ap.hasta > now())
    FROM public.clientes c
   WHERE c.responsable_id = auth.uid()
     AND c.es_lead_campania
     AND c.eliminado_at IS NULL
     AND COALESCE(c.wa_count, 0) = 0 AND COALESCE(c.call_count, 0) = 0
     AND c.created_at > now() - interval '7 days'
   ORDER BY c.created_at DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.mis_leads_alarma() TO authenticated;

-- ── Atender un lead desde la app de alarmas ────────────────────────────────
-- Sube el contador, que es lo que apaga la alarma, y anota la interacción para
-- que las estadísticas y las misiones cuenten igual que si se hubiera hecho
-- desde Valera. La interacción se anota una vez al día por canal, igual que
-- registrar_contacto_cliente, para no inflar los números picándole dos veces.
CREATE OR REPLACE FUNCTION public.atender_lead_alarma(p_lead_id uuid, p_via text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_tipo text;
  v_hoy  date;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no autenticado');
  END IF;
  IF p_via NOT IN ('whatsapp', 'llamada') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'via desconocida');
  END IF;
  -- Solo sobre los propios. Un lead ajeno no se toca ni se confirma que exista.
  IF NOT EXISTS (SELECT 1 FROM public.clientes c
                  WHERE c.id = p_lead_id AND c.responsable_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ajeno');
  END IF;

  IF p_via = 'whatsapp' THEN
    UPDATE public.clientes SET wa_count = COALESCE(wa_count, 0) + 1 WHERE id = p_lead_id;
  ELSE
    UPDATE public.clientes SET call_count = COALESCE(call_count, 0) + 1 WHERE id = p_lead_id;
  END IF;

  v_tipo := CASE WHEN p_via = 'llamada' THEN 'llamada' ELSE 'mensaje' END;
  v_hoy  := (now() AT TIME ZONE 'America/Mexico_City')::date;
  IF NOT EXISTS (SELECT 1 FROM public.interacciones i
                  WHERE i.user_id = v_uid AND i.cliente_id = p_lead_id AND i.tipo = v_tipo
                    AND (i.created_at AT TIME ZONE 'America/Mexico_City')::date = v_hoy) THEN
    INSERT INTO public.interacciones (user_id, cliente_id, tipo, descripcion)
    VALUES (v_uid, p_lead_id, v_tipo,
            CASE WHEN v_tipo = 'llamada' THEN 'Llamada al cliente' ELSE 'Contacto por WhatsApp' END);
  END IF;

  RETURN jsonb_build_object('ok', true);
END $fn$;

GRANT EXECUTE ON FUNCTION public.atender_lead_alarma(uuid, text) TO authenticated;
