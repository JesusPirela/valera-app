-- Retro de cita desde el dashboard de coordinación (admin):
-- 1. El trigger que sincroniza coordinación → citas_venta NO debe borrar las
--    filas creadas para retro del admin (origen='retro_admin') ni las que ya
--    tienen retro llenada, aunque la cita no sea de Alexis/Chucho.
-- 2. RPC abrir_retro_coordinacion: encuentra o CREA la fila de citas_venta de esa
--    cita para poder escribir su retro (con el mismo mapeo del trigger).

CREATE OR REPLACE FUNCTION public.fn_citas_venta_desde_coordinacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_nombre text; v_tel text; v_pago text; v_op text; v_prop text; v_coord text; v_prosp text; v_ases text; v_existe boolean;
BEGIN
  SELECT nombre, telefono, tipo_credito, tipo_operacion INTO v_nombre, v_tel, v_pago, v_op FROM clientes WHERE id = NEW.cliente_id;
  SELECT EXISTS(SELECT 1 FROM citas_venta WHERE cita_coordinacion_id = NEW.id) INTO v_existe;

  -- No es venta o no la coordinamos nosotros: nunca aplica → sacarla, PERO se
  -- conservan las filas de retro del admin y las que ya tienen retro llenada.
  IF NEW.coordinado_por IS NULL
     OR NEW.coordinado_por NOT IN ('6735dd82-3c79-4fd3-86cd-870c45fbda94','d0a9694f-f73a-428f-a455-5f039e4b84dc')
     OR v_op IS DISTINCT FROM 'venta' THEN
    DELETE FROM citas_venta WHERE cita_coordinacion_id = NEW.id
      AND COALESCE(origen,'') <> 'retro_admin' AND retro_completada_at IS NULL;
    RETURN NEW;
  END IF;

  IF NEW.estado = 'cancelada' THEN
    IF v_existe THEN
      UPDATE citas_venta SET estado_seguimiento = 'CANCELADA' WHERE cita_coordinacion_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado NOT IN ('coordinada','realizada') THEN
    DELETE FROM citas_venta WHERE cita_coordinacion_id = NEW.id
      AND COALESCE(origen,'') <> 'retro_admin' AND retro_completada_at IS NULL;
    RETURN NEW;
  END IF;

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
END $function$;

-- Encuentra o crea la fila de citas_venta de una cita de coordinación para que el
-- admin/supervisor pueda escribir su retro. Devuelve la fila (para abrir el wizard).
CREATE OR REPLACE FUNCTION public.abrir_retro_coordinacion(p_coord_id uuid)
 RETURNS SETOF public.citas_venta
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cc public.citas_coordinacion; v_id uuid;
  v_nombre text; v_tel text; v_pago text; v_prop text; v_coord text; v_prosp text; v_ases text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT * INTO v_cc FROM public.citas_coordinacion WHERE id = p_coord_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cita no encontrada'; END IF;

  SELECT id INTO v_id FROM public.citas_venta WHERE cita_coordinacion_id = p_coord_id;
  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.citas_venta WHERE id = v_id;
    RETURN;
  END IF;

  SELECT nombre, telefono, tipo_credito INTO v_nombre, v_tel, v_pago FROM clientes WHERE id = v_cc.cliente_id;
  v_prop := COALESCE(v_cc.propiedad_externa, (SELECT titulo FROM propiedades WHERE id = v_cc.propiedad_id));
  SELECT nombre INTO v_coord FROM profiles WHERE id = v_cc.coordinado_por;
  SELECT nombre INTO v_prosp FROM profiles WHERE id = v_cc.prospectador_id;
  SELECT nombre INTO v_ases  FROM profiles WHERE id = v_cc.asesor_id;

  RETURN QUERY
  INSERT INTO public.citas_venta (cliente_nombre, telefono, detalles_pago, interesado_en, fecha_cita, dia_cita,
      prospecto, coordino, atendio, asesor_id, estado_seguimiento, cita_coordinacion_id, origen)
  VALUES (v_nombre, v_tel, v_pago, v_prop, v_cc.fecha_cita,
      to_char(v_cc.fecha_cita AT TIME ZONE 'America/Mexico_City', 'FMDay DD "de" FMMonth'),
      v_prosp, v_coord, v_ases, v_cc.asesor_id, v_cc.estado, p_coord_id, 'retro_admin')
  RETURNING *;
END $function$;
GRANT EXECUTE ON FUNCTION public.abrir_retro_coordinacion(uuid) TO authenticated;
