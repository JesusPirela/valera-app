-- Columnas para donaciones dentro del pool de leads existente.
ALTER TABLE public.leads_pool ADD COLUMN IF NOT EXISTS donante_id uuid REFERENCES profiles(id);
ALTER TABLE public.leads_pool ADD COLUMN IF NOT EXISTS cliente_origen_id uuid;   -- el cliente original que se donó (historial)
ALTER TABLE public.leads_pool ADD COLUMN IF NOT EXISTS convertido_at timestamptz; -- cuándo el lead donado llegó a "compro"
ALTER TABLE public.leads_pool ADD COLUMN IF NOT EXISTS comision_liquidada boolean NOT NULL DEFAULT false;

-- Donar un cliente al pool: sale del CRM de quien dona y queda disponible para
-- que cualquiera lo tome. Guarda para siempre quién lo donó (donante_id).
CREATE OR REPLACE FUNCTION public.donar_cliente(p_cliente_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_rol text; v_c record; v_pool_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No autenticado'); END IF;
  SELECT role INTO v_rol FROM profiles WHERE id = v_uid;

  SELECT * INTO v_c FROM clientes WHERE id = p_cliente_id AND eliminado_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado'); END IF;

  -- Solo el responsable (o un admin) puede donarlo.
  IF v_c.responsable_id <> v_uid AND v_rol NOT IN ('admin','supervisor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo puedes donar tus propios clientes');
  END IF;
  IF COALESCE(btrim(v_c.telefono),'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El cliente necesita un teléfono para donarlo');
  END IF;
  IF v_c.estado IN ('compro','compro_externo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes donar un cliente que ya compró');
  END IF;

  -- Meterlo al pool como disponible, con el donante registrado.
  INSERT INTO leads_pool (nombre, telefono, zona_interes, nota, estado, created_by, donante_id, cliente_origen_id)
  VALUES (v_c.nombre, v_c.telefono, v_c.zona_busqueda,
          COALESCE(NULLIF(v_c.notas,''), 'Cliente donado'), 'disponible', v_uid, v_uid, p_cliente_id)
  RETURNING id INTO v_pool_id;

  -- Sacarlo del CRM del donante (se archiva, no se borra: queda el historial).
  UPDATE clientes SET eliminado_at = now(), razon_descarte = 'Donado al pool de leads'
  WHERE id = p_cliente_id;

  RETURN jsonb_build_object('ok', true, 'pool_id', v_pool_id,
    'mensaje', '🤝 ¡Gracias por donar a ' || COALESCE(v_c.nombre,'este cliente') ||
      '! Si alguien lo cierra, te toca tu parte.');
END $fn$;
