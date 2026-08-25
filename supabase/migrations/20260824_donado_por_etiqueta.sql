-- Marcar en el cliente que vino de una donación (para la etiqueta en el CRM).
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS donado_por uuid REFERENCES profiles(id);
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS donado_por_nombre text;

-- asignar_lead_desde_pool: al crear el cliente, si el lead del pool tenía donante,
-- copiar donado_por + donado_por_nombre para poder mostrar la etiqueta.
CREATE OR REPLACE FUNCTION public.asignar_lead_desde_pool(p_user_id uuid, p_compra_id uuid, p_fuente text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lead RECORD; v_cliente_id UUID; v_pool_count INT; v_donante_nombre TEXT;
BEGIN
  SELECT * INTO v_lead FROM public.leads_pool
  WHERE estado = 'disponible' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'razon', 'pool_vacio'); END IF;

  IF v_lead.donante_id IS NOT NULL THEN
    SELECT nombre INTO v_donante_nombre FROM profiles WHERE id = v_lead.donante_id;
  END IF;

  INSERT INTO public.clientes (
    nombre, telefono, fuente_lead, estado, responsable_id, notas, zona_busqueda,
    donado_por, donado_por_nombre
  )
  VALUES (
    COALESCE(v_lead.nombre, 'Lead'), v_lead.telefono, p_fuente, 'por_perfilar',
    p_user_id, v_lead.nota, v_lead.zona_interes,
    v_lead.donante_id, v_donante_nombre
  )
  RETURNING id INTO v_cliente_id;

  INSERT INTO public.interacciones (cliente_id, user_id, tipo, descripcion)
  VALUES (v_cliente_id, p_user_id, 'nota',
    CASE WHEN v_lead.donante_id IS NOT NULL
      THEN 'Cliente donado por ' || COALESCE(v_donante_nombre,'un compañero') || ', asignado desde el pool.'
      ELSE 'Lead asignado automáticamente desde el pool de leads.' END);

  UPDATE public.leads_pool SET
    estado = 'asignado', asignado_a = p_user_id, asignado_at = NOW(),
    cliente_id = v_cliente_id, fuente_asignacion = p_fuente, compra_id = p_compra_id
  WHERE id = v_lead.id;

  INSERT INTO public.notificaciones (user_id, cliente_id, titulo, mensaje, tipo)
  VALUES (
    p_user_id, v_cliente_id,
    CASE WHEN v_lead.donante_id IS NOT NULL THEN '🎁 Te donaron un cliente' ELSE '¡Tienes un nuevo lead! 🔥' END,
    CASE WHEN v_lead.donante_id IS NOT NULL THEN COALESCE(v_donante_nombre,'Un compañero') || ' te donó a ' ELSE 'Te asignamos un lead: ' END ||
      CASE WHEN v_lead.nombre IS NOT NULL THEN v_lead.nombre || ' — ' ELSE '' END ||
      'Tel: ' || v_lead.telefono ||
      CASE WHEN v_lead.zona_interes IS NOT NULL THEN ' · Zona: ' || v_lead.zona_interes ELSE '' END ||
      '. Ya está en tu CRM listo para trabajar.',
    'lead_caliente'
  );

  SELECT COUNT(*) INTO v_pool_count FROM public.leads_pool WHERE estado = 'disponible';
  IF v_pool_count < 3 THEN
    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo)
    SELECT p.id, '⚠️ Pool de leads bajo (' || v_pool_count || ' restantes)',
      'Quedan solo ' || v_pool_count || ' lead(s) disponibles en el pool. Agrega más para cubrir las próximas solicitudes.', 'sistema'
    FROM public.profiles p WHERE p.role = 'admin';
  END IF;

  RETURN jsonb_build_object('ok', true, 'cliente_id', v_cliente_id, 'lead_nombre', v_lead.nombre, 'lead_telefono', v_lead.telefono);
END;
$function$;
