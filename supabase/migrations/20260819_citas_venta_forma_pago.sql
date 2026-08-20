-- El trigger del dashboard también trae la forma de pago del perfil del cliente
-- (clientes.tipo_credito), para las citas nuevas coordinadas.
CREATE OR REPLACE FUNCTION public.fn_citas_venta_desde_coordinacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nombre text; v_tel text; v_pago text; v_prop text; v_coord text; v_prosp text; v_ases text;
BEGIN
  IF NEW.coordinado_por IS NULL
     OR NEW.coordinado_por NOT IN (
          '6735dd82-3c79-4fd3-86cd-870c45fbda94',  -- Alexis
          'd0a9694f-f73a-428f-a455-5f039e4b84dc')  -- Chucho
     OR NEW.estado IN ('por_contactar', 'en_coordinacion', 'buscando_opciones') THEN
    RETURN NEW;
  END IF;

  SELECT nombre, telefono, tipo_credito INTO v_nombre, v_tel, v_pago FROM clientes WHERE id = NEW.cliente_id;
  v_prop := COALESCE(NEW.propiedad_externa, (SELECT titulo FROM propiedades WHERE id = NEW.propiedad_id));
  SELECT nombre INTO v_coord FROM profiles WHERE id = NEW.coordinado_por;
  SELECT nombre INTO v_prosp FROM profiles WHERE id = NEW.prospectador_id;
  SELECT nombre INTO v_ases  FROM profiles WHERE id = NEW.asesor_id;

  INSERT INTO citas_venta (cliente_nombre, telefono, detalles_pago, interesado_en, fecha_cita, dia_cita,
                           prospecto, coordino, atendio, asesor_id, estado_seguimiento,
                           retro_como_estuvo, cita_coordinacion_id, origen)
  VALUES (v_nombre, v_tel, v_pago, v_prop, NEW.fecha_cita,
          to_char(NEW.fecha_cita AT TIME ZONE 'America/Mexico_City', 'FMDay DD "de" FMMonth'),
          v_prosp, v_coord, v_ases, NEW.asesor_id, NEW.estado, NULLIF(NEW.resultado, ''), NEW.id, 'dashboard')
  ON CONFLICT (cita_coordinacion_id) DO UPDATE
    SET cliente_nombre = EXCLUDED.cliente_nombre,
        telefono       = COALESCE(citas_venta.telefono, EXCLUDED.telefono),
        detalles_pago  = COALESCE(citas_venta.detalles_pago, EXCLUDED.detalles_pago),
        interesado_en  = COALESCE(citas_venta.interesado_en, EXCLUDED.interesado_en),
        prospecto      = COALESCE(EXCLUDED.prospecto, citas_venta.prospecto),
        coordino       = COALESCE(EXCLUDED.coordino, citas_venta.coordino),
        atendio        = COALESCE(EXCLUDED.atendio, citas_venta.atendio),
        asesor_id      = COALESCE(EXCLUDED.asesor_id, citas_venta.asesor_id),
        estado_seguimiento = COALESCE(EXCLUDED.estado_seguimiento, citas_venta.estado_seguimiento);
  RETURN NEW;
END $$;

-- Rellena la forma de pago de las citas del dashboard ya existentes.
UPDATE citas_venta cv
SET detalles_pago = cl.tipo_credito
FROM citas_coordinacion cc JOIN clientes cl ON cl.id = cc.cliente_id
WHERE cv.cita_coordinacion_id = cc.id AND cv.origen = 'dashboard'
  AND COALESCE(cv.detalles_pago, '') = '' AND COALESCE(cl.tipo_credito, '') <> '';
