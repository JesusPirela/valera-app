-- La tabla de citas de venta no reflejaba los cambios hechos en la cita de
-- coordinación, y el día salía en inglés y sin hora.
--
-- Caso real: se reagendó la cita de Reyna Concepción del 23 al 26 de septiembre
-- y en la tabla seguía apareciendo:
--     fecha real de la cita : 26 Sep 19:30
--     lo que mostraba tabla : 23 Sep 19:30  ·  "Wednesday 23 de September"
--
-- Tres causas, las tres arregladas aquí:
--
-- 1) EL TRIGGER NO ESCUCHABA LA FECHA.
--    Estaba declarado como UPDATE OF asesor_id, estado, cliente_id,
--    coordinado_por, prospectador_id — fecha_cita NO estaba en la lista, así
--    que reagendar no disparaba nada. Ahora dispara en cualquier UPDATE.
--
-- 2) EL ON CONFLICT PREFERÍA EL VALOR VIEJO.
--    Usaba COALESCE(citas_venta.col, EXCLUDED.col): mientras la tabla tuviera
--    algo, el dato nuevo se descartaba. Además fecha_cita y dia_cita ni
--    siquiera estaban en la lista de columnas a actualizar. Ahora es
--    COALESCE(EXCLUDED.col, citas_venta.col) — gana lo nuevo, y sólo se
--    conserva lo anterior cuando lo nuevo viene en NULL.
--
-- 3) EL DÍA SALÍA EN INGLÉS Y SIN HORA.
--    to_char(..., 'FMDay') usa el locale del servidor, que es inglés. Se
--    reemplaza por arreglos en español y se añade la hora en formato de 12 h,
--    en hora de México ("Sábado 26 de septiembre, 1:30 pm").
--
-- Aplicada a producción el 2026-09-23: 56 citas resincronizadas y verificadas.

CREATE OR REPLACE FUNCTION public.fn_citas_venta_desde_coordinacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_nombre text; v_tel text; v_pago text; v_op text; v_prop text;
  v_coord text; v_prosp text; v_ases text; v_existe boolean;
  v_f timestamptz; v_dia text; v_local timestamp;
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

  IF NEW.estado = 'cancelada' THEN
    IF v_existe THEN
      UPDATE citas_venta SET estado_seguimiento = 'CANCELADA/REAGENDA' WHERE cita_coordinacion_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  -- Sólo entran a la tabla las citas de VENTA coordinadas por la casa.
  IF NEW.coordinado_por IS NULL
     OR NOT (NEW.coordinado_por = ANY(v_coordinadores))
     OR v_op IS DISTINCT FROM 'venta' THEN
    DELETE FROM citas_venta WHERE cita_coordinacion_id = NEW.id
      AND COALESCE(origen,'') <> 'retro_admin' AND retro_completada_at IS NULL;
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

  INSERT INTO citas_venta (cliente_nombre, telefono, detalles_pago, interesado_en, fecha_cita, dia_cita,
                           prospecto, coordino, atendio, asesor_id, estado_seguimiento, retro_como_estuvo,
                           cita_coordinacion_id, origen)
  VALUES (v_nombre, v_tel, v_pago, v_prop, v_f, v_dia,
          v_prosp, v_coord, v_ases, NEW.asesor_id, NEW.estado, NULLIF(NEW.resultado,''), NEW.id, 'dashboard')
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

-- Antes: UPDATE OF asesor_id, estado, cliente_id, coordinado_por, prospectador_id.
DROP TRIGGER IF EXISTS tr_citas_venta_desde_coord ON public.citas_coordinacion;
CREATE TRIGGER tr_citas_venta_desde_coord
  AFTER INSERT OR UPDATE ON public.citas_coordinacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_citas_venta_desde_coordinacion();

-- Resincroniza lo que ya estaba en la tabla con datos viejos (56 filas).
UPDATE public.citas_coordinacion c SET estado = c.estado
 WHERE EXISTS (SELECT 1 FROM public.citas_venta v WHERE v.cita_coordinacion_id = c.id);
