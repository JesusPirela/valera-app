-- Al reasignar una campaña, poder elegir qué pasa con los clientes de antes.
--
-- Lo que ya hacía bien: solo convertía los leads que nunca se habían
-- convertido, así que los clientes del asesor anterior NO se tocaban. Ese es el
-- comportamiento correcto por defecto —el trabajo ya hecho se queda con quien
-- lo hizo— y se conserva.
--
-- Lo que faltaba es la otra mitad: a veces sí se quiere entregar la cartera
-- completa, por ejemplo si alguien deja el equipo. Ahora es una decisión
-- explícita en vez de algo que no se podía hacer.
--
-- De paso se corrige un error heredado: la zona y el presupuesto se leían con
-- el TEXTO EXACTO de la pregunta del formulario
-- ('¿cuál_es_tu_presupuesto_para_tu_nuevo_hogar?'). Cada anuncio las redacta a
-- su manera, así que con una palabra distinta el dato se perdía en silencio.
-- Es el mismo fallo que ya se corrigió en el sync; aquí seguía vivo.
DROP FUNCTION IF EXISTS public.asignar_campania(uuid, uuid);
DROP FUNCTION IF EXISTS public.asignar_campania(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.asignar_campania(
  p_campania_id uuid,
  p_user_id uuid,
  p_mover_existentes boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_role text; v_nuevos int := 0; v_movidos int := 0;
  r record; v_cid uuid; v_camp text; v_antes uuid;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede asignar campañas';
  END IF;

  SELECT nombre, asignado_a INTO v_camp, v_antes FROM public.campanias WHERE id = p_campania_id;
  UPDATE public.campanias SET asignado_a = p_user_id, updated_at = now() WHERE id = p_campania_id;

  -- ── Los leads que nunca se convirtieron: se crean para el nuevo ──
  FOR r IN SELECT * FROM public.leads_campania
            WHERE campania_id = p_campania_id AND cliente_id IS NULL LOOP
    INSERT INTO public.clientes
      (nombre, telefono, email, fuente_lead, estado, responsable_id, es_lead_campania,
       zona_busqueda, presupuesto)
    VALUES (COALESCE(NULLIF(TRIM(r.nombre), ''), 'Lead Facebook'),
            COALESCE(r.telefono, ''), NULLIF(r.email, ''),
            'campana_fb', 'por_perfilar', p_user_id, true,
            -- Por palabra clave, no por el texto exacto de la pregunta.
            (SELECT e.value FROM jsonb_each_text(r.extra) e
              WHERE lower(e.key) LIKE '%zona%' AND e.value <> '' LIMIT 1),
            (SELECT e.value FROM jsonb_each_text(r.extra) e
              WHERE lower(e.key) LIKE '%presupuesto%' AND e.value <> '' LIMIT 1))
    RETURNING id INTO v_cid;

    UPDATE public.leads_campania SET cliente_id = v_cid WHERE id = r.id;

    INSERT INTO public.notificaciones (user_id, tipo, cliente_id, titulo, mensaje, accion_url)
    VALUES (p_user_id, 'nuevo_cliente', v_cid, '📢 Nuevo lead de campaña',
            COALESCE(NULLIF(TRIM(r.nombre), ''), 'Lead') || ' · ' ||
            COALESCE(r.telefono, '') || ' — ' || COALESCE(v_camp, ''),
            '/(prospectador)/detalle-cliente?id=' || v_cid::text);
    v_nuevos := v_nuevos + 1;
  END LOOP;

  -- ── Los clientes que el asesor anterior ya tenía ──
  --
  -- Solo si se pide. Es una entrega de cartera, no un efecto secundario de
  -- reasignar la campaña.
  IF p_mover_existentes AND v_antes IS NOT NULL AND v_antes <> p_user_id THEN
    UPDATE public.clientes c
       SET responsable_id = p_user_id, updated_at = now()
     WHERE c.responsable_id = v_antes
       AND c.eliminado_at IS NULL
       AND EXISTS (SELECT 1 FROM public.leads_campania lc
                    WHERE lc.cliente_id = c.id AND lc.campania_id = p_campania_id);
    GET DIAGNOSTICS v_movidos = ROW_COUNT;

    -- La alarma pospuesta era del asesor anterior: si no se limpia, el nuevo
    -- hereda un silencio que él nunca puso y no le suena nada.
    DELETE FROM public.alarma_pospuesta ap
     WHERE ap.user_id = v_antes
       AND ap.referencia_id IN (
         SELECT lc.cliente_id FROM public.leads_campania lc
          WHERE lc.campania_id = p_campania_id AND lc.cliente_id IS NOT NULL);
  END IF;

  RETURN jsonb_build_object('ok', true, 'nuevos', v_nuevos, 'movidos', v_movidos);
END $fn$;

GRANT EXECUTE ON FUNCTION public.asignar_campania(uuid, uuid, boolean) TO authenticated;
