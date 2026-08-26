-- Trigger de Citas de Venta:
--  • venta + coordinada/realizada + coordinada por Alexis/Chucho → entra/actualiza.
--  • si estaba en la tabla y pasa a CANCELADA → se QUEDA, marcada 'CANCELADA'.
--  • cualquier otro caso (no venta, no nuestra, u otros estados) → se saca.
CREATE OR REPLACE FUNCTION public.fn_citas_venta_desde_coordinacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_nombre text; v_tel text; v_pago text; v_op text; v_prop text; v_coord text; v_prosp text; v_ases text; v_existe boolean;
BEGIN
  SELECT nombre, telefono, tipo_credito, tipo_operacion INTO v_nombre, v_tel, v_pago, v_op FROM clientes WHERE id = NEW.cliente_id;
  SELECT EXISTS(SELECT 1 FROM citas_venta WHERE cita_coordinacion_id = NEW.id) INTO v_existe;

  -- No es venta o no la coordinamos nosotros: nunca aplica → sacarla.
  IF NEW.coordinado_por IS NULL
     OR NEW.coordinado_por NOT IN ('6735dd82-3c79-4fd3-86cd-870c45fbda94','d0a9694f-f73a-428f-a455-5f039e4b84dc')
     OR v_op IS DISTINCT FROM 'venta' THEN
    DELETE FROM citas_venta WHERE cita_coordinacion_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Cancelada: si YA estaba en la tabla (estuvo coordinada), se queda marcada CANCELADA.
  -- Si nunca estuvo, no se mete (una cancelada que jamás fue coordinada no aplica).
  IF NEW.estado = 'cancelada' THEN
    IF v_existe THEN
      UPDATE citas_venta SET estado_seguimiento = 'CANCELADA' WHERE cita_coordinacion_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  -- Otros estados que no son coordinada/realizada: sacarla.
  IF NEW.estado NOT IN ('coordinada','realizada') THEN
    DELETE FROM citas_venta WHERE cita_coordinacion_id = NEW.id;
    RETURN NEW;
  END IF;

  -- coordinada / realizada: entra o se actualiza.
  v_prop := COALESCE(NEW.propiedad_externa, (SELECT titulo FROM propiedades WHERE id = NEW.propiedad_id));
  SELECT nombre INTO v_coord FROM profiles WHERE id = NEW.coordinado_por;
  SELECT nombre INTO v_prosp FROM profiles WHERE id = NEW.prospectador_id;
  SELECT nombre INTO v_ases  FROM profiles WHERE id = NEW.asesor_id;
  INSERT INTO citas_venta (cliente_nombre, telefono, detalles_pago, interesado_en, fecha_cita, dia_cita,
                           prospecto, coordino, atendio, asesor_id, estado_seguimiento, retro_como_estuvo, cita_coordinacion_id, origen)
  VALUES (v_nombre, v_tel, v_pago, v_prop, NEW.fecha_cita,
          to_char(NEW.fecha_cita AT TIME ZONE 'America/Mexico_City', 'FMDay DD "de" FMMonth'),
          v_prosp, v_coord, v_ases, NEW.asesor_id, NEW.estado, NULLIF(NEW.resultado,''), NEW.id, 'dashboard')
  ON CONFLICT (cita_coordinacion_id) DO UPDATE SET cliente_nombre=EXCLUDED.cliente_nombre,
    telefono=COALESCE(citas_venta.telefono,EXCLUDED.telefono), detalles_pago=COALESCE(citas_venta.detalles_pago,EXCLUDED.detalles_pago),
    interesado_en=COALESCE(citas_venta.interesado_en,EXCLUDED.interesado_en), prospecto=COALESCE(EXCLUDED.prospecto,citas_venta.prospecto),
    coordino=COALESCE(EXCLUDED.coordino,citas_venta.coordino), atendio=COALESCE(EXCLUDED.atendio,citas_venta.atendio),
    asesor_id=COALESCE(EXCLUDED.asesor_id,citas_venta.asesor_id), estado_seguimiento=EXCLUDED.estado_seguimiento;
  RETURN NEW;
END $fn$;

-- Botón "La cita se canceló" (retro): ahora MARCA CANCELADA en vez de borrar.
CREATE OR REPLACE FUNCTION public.cancelar_cita_venta(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_rol text; v_ases uuid; v_cc uuid;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id=auth.uid();
  SELECT asesor_id, cita_coordinacion_id INTO v_ases, v_cc FROM citas_venta WHERE id=p_id;
  IF v_rol NOT IN ('admin','supervisor') AND (v_ases IS NULL OR v_ases<>auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_cc IS NOT NULL THEN UPDATE citas_coordinacion SET estado='cancelada' WHERE id=v_cc; END IF;
  UPDATE citas_venta SET estado_seguimiento='CANCELADA' WHERE id=p_id;
END $fn$;
