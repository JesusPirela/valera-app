-- La cita entra a citas_venta cuando YA está coordinada por Alexis o Chucho
-- (no en las etapas previas: por_contactar / en_coordinacion / buscando_opciones).
-- Además: "Coordinó" ← coordinado_por, "Prospectó" ← prospectador, "Atendió" ← asesor.
CREATE OR REPLACE FUNCTION public.fn_citas_venta_desde_coordinacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nombre text; v_tel text; v_prop text; v_coord text; v_prosp text; v_ases text;
BEGIN
  IF NEW.coordinado_por IS NULL
     OR NEW.coordinado_por NOT IN (
          '6735dd82-3c79-4fd3-86cd-870c45fbda94',  -- Alexis
          'd0a9694f-f73a-428f-a455-5f039e4b84dc')  -- Chucho
     OR NEW.estado IN ('por_contactar', 'en_coordinacion', 'buscando_opciones') THEN
    RETURN NEW;   -- todavía no está coordinada (o no es de ellos): no entra
  END IF;

  SELECT nombre, telefono INTO v_nombre, v_tel FROM clientes WHERE id = NEW.cliente_id;
  v_prop := COALESCE(NEW.propiedad_externa, (SELECT titulo FROM propiedades WHERE id = NEW.propiedad_id));
  SELECT nombre INTO v_coord FROM profiles WHERE id = NEW.coordinado_por;
  SELECT nombre INTO v_prosp FROM profiles WHERE id = NEW.prospectador_id;
  SELECT nombre INTO v_ases  FROM profiles WHERE id = NEW.asesor_id;

  INSERT INTO citas_venta (cliente_nombre, telefono, interesado_en, fecha_cita, dia_cita,
                           prospecto, coordino, atendio, asesor_id, estado_seguimiento,
                           retro_como_estuvo, cita_coordinacion_id, origen)
  VALUES (v_nombre, v_tel, v_prop, NEW.fecha_cita,
          to_char(NEW.fecha_cita AT TIME ZONE 'America/Mexico_City', 'FMDay DD "de" FMMonth'),
          v_prosp, v_coord, v_ases, NEW.asesor_id, NEW.estado, NULLIF(NEW.resultado, ''), NEW.id, 'dashboard')
  ON CONFLICT (cita_coordinacion_id) DO UPDATE
    SET cliente_nombre = EXCLUDED.cliente_nombre,
        telefono       = COALESCE(citas_venta.telefono, EXCLUDED.telefono),
        interesado_en  = COALESCE(citas_venta.interesado_en, EXCLUDED.interesado_en),
        prospecto      = COALESCE(EXCLUDED.prospecto, citas_venta.prospecto),
        coordino       = COALESCE(EXCLUDED.coordino, citas_venta.coordino),
        atendio        = COALESCE(EXCLUDED.atendio, citas_venta.atendio),
        asesor_id      = COALESCE(EXCLUDED.asesor_id, citas_venta.asesor_id),
        estado_seguimiento = COALESCE(EXCLUDED.estado_seguimiento, citas_venta.estado_seguimiento);
  RETURN NEW;
END $$;

-- Que también dispare al cambiar coordinado_por / prospectador (cuando se coordina).
DROP TRIGGER IF EXISTS tr_citas_venta_desde_coord ON public.citas_coordinacion;
CREATE TRIGGER tr_citas_venta_desde_coord
  AFTER INSERT OR UPDATE OF asesor_id, estado, cliente_id, coordinado_por, prospectador_id
  ON public.citas_coordinacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_citas_venta_desde_coordinacion();
