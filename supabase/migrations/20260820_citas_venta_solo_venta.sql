-- A la tabla de Citas de Venta solo entran citas de VENTA (según el cliente) y
-- solo cuando están 'coordinada' o 'realizada', coordinadas por Alexis o Chucho.
CREATE OR REPLACE FUNCTION public.fn_citas_venta_desde_coordinacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nombre text; v_tel text; v_pago text; v_op text; v_prop text; v_coord text; v_prosp text; v_ases text;
BEGIN
  IF NEW.coordinado_por IS NULL
     OR NEW.coordinado_por NOT IN (
          '6735dd82-3c79-4fd3-86cd-870c45fbda94',  -- Alexis
          'd0a9694f-f73a-428f-a455-5f039e4b84dc')  -- Chucho
     OR NEW.estado NOT IN ('coordinada', 'realizada') THEN
    RETURN NEW;
  END IF;

  SELECT nombre, telefono, tipo_credito, tipo_operacion INTO v_nombre, v_tel, v_pago, v_op
  FROM clientes WHERE id = NEW.cliente_id;

  IF v_op IS DISTINCT FROM 'venta' THEN RETURN NEW; END IF;  -- solo VENTA

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
        estado_seguimiento = EXCLUDED.estado_seguimiento;
  RETURN NEW;
END $$;
