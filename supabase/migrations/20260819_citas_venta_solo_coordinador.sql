-- La tabla citas_venta solo debe recibir del dashboard las citas coordinadas por
-- el equipo de coordinación (Alexis o Chucho). Antes entraba cualquier cita
-- (incluso sin coordinador), y se colaban las que no debían.
CREATE OR REPLACE FUNCTION public.fn_citas_venta_desde_coordinacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nombre text; v_tel text; v_prop text;
BEGIN
  -- Solo citas coordinadas por Alexis o Chucho.
  IF NEW.coordinado_por IS NULL OR NEW.coordinado_por NOT IN (
       '6735dd82-3c79-4fd3-86cd-870c45fbda94',  -- Alexis
       'd0a9694f-f73a-428f-a455-5f039e4b84dc'   -- Chucho
     ) THEN
    RETURN NEW;
  END IF;

  SELECT nombre, telefono INTO v_nombre, v_tel FROM clientes WHERE id = NEW.cliente_id;
  v_prop := COALESCE(NEW.propiedad_externa, (SELECT titulo FROM propiedades WHERE id = NEW.propiedad_id));

  INSERT INTO citas_venta (cliente_nombre, telefono, interesado_en, fecha_cita, dia_cita,
                           atendio, asesor_id, estado_seguimiento, retro_como_estuvo,
                           cita_coordinacion_id, origen)
  VALUES (v_nombre, v_tel, v_prop, NEW.fecha_cita,
          to_char(NEW.fecha_cita AT TIME ZONE 'America/Mexico_City', 'FMDay DD "de" FMMonth'),
          (SELECT nombre FROM profiles WHERE id = NEW.asesor_id), NEW.asesor_id,
          NEW.estado, NULLIF(NEW.resultado, ''), NEW.id, 'dashboard')
  ON CONFLICT (cita_coordinacion_id) DO UPDATE
    SET cliente_nombre = EXCLUDED.cliente_nombre,
        telefono       = COALESCE(citas_venta.telefono, EXCLUDED.telefono),
        interesado_en  = COALESCE(citas_venta.interesado_en, EXCLUDED.interesado_en),
        asesor_id      = COALESCE(EXCLUDED.asesor_id, citas_venta.asesor_id),
        atendio        = COALESCE(EXCLUDED.atendio, citas_venta.atendio),
        estado_seguimiento = COALESCE(EXCLUDED.estado_seguimiento, citas_venta.estado_seguimiento);
  RETURN NEW;
END $$;
