-- Reagendar una cita la borraba de la tabla de citas de venta.
--
-- El trigger solo dejaba entrar 'coordinada', 'realizada' y 'aparto'; cualquier
-- otro estado borra la fila. Así que al marcar una cita como 'reagendada'
-- desaparecía de la tabla, justo cuando lo que hace falta es seguirla.
--
-- Lo incoherente: al CANCELAR, la fila no se borra, se marca
-- 'CANCELADA/REAGENDA'. O sea, el texto ya hablaba del reagendado, pero
-- reagendar era precisamente lo que la hacía desaparecer.
--
-- Se notó con la cita de Mónica Ramírez del 25/09: estaba en la tabla, la
-- reagendaron a las 19:52 y se fue. Había 29 citas de venta en ese estado
-- desde el 31 de agosto, ninguna en la tabla.
--
-- Ahora 'reagendada' entra como las demás, con el seguimiento en 'REAGENDADA'.
-- No se toca el tratamiento de 'cancelada': sigue marcándose
-- 'CANCELADA/REAGENDA' como se pidió en su momento.

CREATE OR REPLACE FUNCTION public.fn_citas_venta_desde_coordinacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_nombre text; v_tel text; v_pago text; v_op text; v_prop text;
  v_coord text; v_prosp text; v_ases text; v_existe boolean;
  v_f timestamptz; v_dia text; v_local timestamp; v_seguimiento text;
  v_coordinadores uuid[] := ARRAY[
    '6735dd82-3c79-4fd3-86cd-870c45fbda94',  -- Alexis
    'd0a9694f-f73a-428f-a455-5f039e4b84dc',  -- Chucho
    'befd463f-4ed4-4cf4-a3ea-22998f6621b5',  -- Carlos Carbajal
    '9bfe9db6-a274-42b6-a2cd-9bd3237b88cf',  -- Andrés Valera (admin)
    '90605894-18ed-46ae-a031-5a7ac6193810',  -- Andrés Valera (supervisor)
    '9c1db0b4-77a8-4235-af35-b53e606546e5'   -- Rayo
  ]::uuid[];
BEGIN
  SELECT nombre, telefono, tipo_credito, tipo_operacion
    INTO v_nombre, v_tel, v_pago, v_op
    FROM clientes WHERE id = NEW.cliente_id;
  SELECT EXISTS(SELECT 1 FROM citas_venta WHERE cita_coordinacion_id = NEW.id) INTO v_existe;

  v_prop := COALESCE(NEW.propiedad_externa, (SELECT titulo FROM propiedades WHERE id = NEW.propiedad_id));
  SELECT nombre INTO v_coord FROM profiles WHERE id = NEW.coordinado_por;
  SELECT nombre INTO v_prosp FROM profiles WHERE id = NEW.prospectador_id;
  SELECT nombre INTO v_ases  FROM profiles WHERE id = NEW.asesor_id;

  -- Día Y HORA en español, en hora de México.
  v_f := NEW.fecha_cita;
  IF v_f IS NULL THEN
    v_dia := NULL;
  ELSE
    v_local := v_f AT TIME ZONE 'America/Mexico_City';
    v_dia := (ARRAY['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'])
               [EXTRACT(DOW FROM v_local)::int + 1]
             || ' ' || EXTRACT(DAY FROM v_local)::int::text || ' de ' ||
             (ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])
               [EXTRACT(MONTH FROM v_local)::int]
             || ', ' || to_char(v_local, 'FMHH12:MI') || ' ' || lower(to_char(v_local, 'am'));
  END IF;

  -- Apartó: a cierres, venta Y renta. Se inserta una sola vez; la etapa la
  -- lleva el equipo a mano y pisarla aquí borraría su avance.
  IF NEW.estado = 'aparto' THEN
    INSERT INTO cierres (cliente_nombre, telefono, tipo_operacion, interesado_en, etapa,
                         prospecto, coordino, atendio, fecha_cita, cita_coordinacion_id)
    VALUES (v_nombre, v_tel, v_op, v_prop, 'Apartado',
            v_prosp, v_coord, v_ases, (v_f AT TIME ZONE 'America/Mexico_City')::date, NEW.id)
    ON CONFLICT (cita_coordinacion_id) WHERE cita_coordinacion_id IS NOT NULL DO NOTHING;
  END IF;

  IF NEW.estado = 'cancelada' THEN
    IF v_existe THEN
      UPDATE citas_venta SET estado_seguimiento = 'CANCELADA/REAGENDA' WHERE cita_coordinacion_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  -- La tabla es de VENTA y de las que coordina la casa.
  IF NEW.coordinado_por IS NULL
     OR NOT (NEW.coordinado_por = ANY(v_coordinadores))
     OR v_op IS DISTINCT FROM 'venta' THEN
    DELETE FROM citas_venta WHERE cita_coordinacion_id = NEW.id
      AND COALESCE(origen,'') <> 'retro_admin' AND retro_completada_at IS NULL;
    RETURN NEW;
  END IF;

  IF NEW.estado NOT IN ('coordinada','realizada','aparto','reagendada') THEN
    DELETE FROM citas_venta WHERE cita_coordinacion_id = NEW.id
      AND COALESCE(origen,'') <> 'retro_admin' AND retro_completada_at IS NULL;
    RETURN NEW;
  END IF;

  v_seguimiento := CASE NEW.estado
                     WHEN 'aparto'     THEN 'APARTADO'
                     WHEN 'reagendada' THEN 'REAGENDADA'
                     ELSE NEW.estado
                   END;

  INSERT INTO citas_venta (cliente_nombre, telefono, detalles_pago, interesado_en, fecha_cita, dia_cita,
                           prospecto, coordino, atendio, asesor_id, estado_seguimiento, retro_como_estuvo,
                           cita_coordinacion_id, origen)
  VALUES (v_nombre, v_tel, v_pago, v_prop, v_f, v_dia,
          v_prosp, v_coord, v_ases, NEW.asesor_id, v_seguimiento, NULLIF(NEW.resultado,''), NEW.id, 'dashboard')
  ON CONFLICT (cita_coordinacion_id) DO UPDATE SET
    cliente_nombre     = COALESCE(EXCLUDED.cliente_nombre,     citas_venta.cliente_nombre),
    telefono           = COALESCE(EXCLUDED.telefono,           citas_venta.telefono),
    detalles_pago      = COALESCE(EXCLUDED.detalles_pago,      citas_venta.detalles_pago),
    interesado_en      = COALESCE(EXCLUDED.interesado_en,      citas_venta.interesado_en),
    fecha_cita         = COALESCE(EXCLUDED.fecha_cita,         citas_venta.fecha_cita),
    dia_cita           = COALESCE(EXCLUDED.dia_cita,           citas_venta.dia_cita),
    prospecto          = COALESCE(EXCLUDED.prospecto,          citas_venta.prospecto),
    coordino           = COALESCE(EXCLUDED.coordino,           citas_venta.coordino),
    atendio            = COALESCE(EXCLUDED.atendio,            citas_venta.atendio),
    asesor_id          = COALESCE(EXCLUDED.asesor_id,          citas_venta.asesor_id),
    estado_seguimiento = EXCLUDED.estado_seguimiento;
  RETURN NEW;
END $fn$;

-- Recuperar las que se habían perdido: se dispara el trigger sobre las citas
-- que ya estaban en 'reagendada'.
UPDATE public.citas_coordinacion SET estado = estado WHERE estado = 'reagendada';
