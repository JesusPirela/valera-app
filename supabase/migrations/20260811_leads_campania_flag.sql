-- Leads de campaña: bandera dedicada + contadores de contacto.
--
-- Problema: se estaba usando fuente_lead='campana_fb' para decidir qué clientes
-- son "leads de campaña", pero muchos clientes que el asesor YA TENÍA quedaron
-- con ese origen, inflando la lista. El registro real de leads de campaña es la
-- tabla leads_campania (los asignados desde el apartado admin). Se agrega una
-- bandera es_lead_campania que marca SOLO esos, para:
--   • sacarlos del CRM normal, y
--   • mostrarlos (y solo ellos) en el apartado "Leads de campaña".

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS es_lead_campania boolean NOT NULL DEFAULT false;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS wa_count   int NOT NULL DEFAULT 0;  -- veces que el asesor tocó WhatsApp
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS call_count int NOT NULL DEFAULT 0;  -- veces que el asesor tocó Llamar

-- Marcar SOLO los leads reales de campaña (los registrados en leads_campania).
UPDATE public.clientes SET es_lead_campania = true
 WHERE id IN (SELECT cliente_id FROM public.leads_campania WHERE cliente_id IS NOT NULL);

-- Copiar zona/presupuesto desde las respuestas del lead si el cliente no las tiene.
UPDATE public.clientes c
   SET zona_busqueda = COALESCE(NULLIF(TRIM(c.zona_busqueda), ''), l.extra->>'¿que_zona_prefieres?'),
       presupuesto   = COALESCE(NULLIF(TRIM(c.presupuesto), ''),   l.extra->>'¿cuál_es_tu_presupuesto_para_tu_nuevo_hogar?')
  FROM public.leads_campania l
 WHERE l.cliente_id = c.id;

-- A futuro: asignar_campania marca la bandera y copia zona/presupuesto al crear.
CREATE OR REPLACE FUNCTION public.asignar_campania(p_campania_id uuid, p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE v_role text; v_n int := 0; r record; v_cid uuid; v_camp text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo un administrador puede asignar campañas'; END IF;

  SELECT nombre INTO v_camp FROM public.campanias WHERE id = p_campania_id;
  UPDATE public.campanias SET asignado_a = p_user_id, updated_at = now() WHERE id = p_campania_id;

  FOR r IN SELECT * FROM public.leads_campania WHERE campania_id = p_campania_id AND cliente_id IS NULL LOOP
    INSERT INTO public.clientes (nombre, telefono, email, fuente_lead, estado, responsable_id, es_lead_campania, zona_busqueda, presupuesto)
      VALUES (COALESCE(NULLIF(TRIM(r.nombre), ''), 'Lead Facebook'),
              COALESCE(r.telefono, ''), NULLIF(r.email, ''),
              'campana_fb', 'por_perfilar', p_user_id, true,
              r.extra->>'¿que_zona_prefieres?',
              r.extra->>'¿cuál_es_tu_presupuesto_para_tu_nuevo_hogar?')
      RETURNING id INTO v_cid;
    UPDATE public.leads_campania SET cliente_id = v_cid WHERE id = r.id;
    INSERT INTO public.notificaciones (user_id, tipo, cliente_id, titulo, mensaje, accion_url)
      VALUES (p_user_id, 'nuevo_cliente', v_cid, '📢 Nuevo lead de campaña',
              COALESCE(NULLIF(TRIM(r.nombre), ''), 'Lead') || ' · ' || COALESCE(r.telefono, '') || ' — ' || COALESCE(v_camp, ''),
              '/(prospectador)/detalle-cliente?id=' || v_cid::text);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $func$;
GRANT EXECUTE ON FUNCTION public.asignar_campania(uuid, uuid) TO authenticated;
