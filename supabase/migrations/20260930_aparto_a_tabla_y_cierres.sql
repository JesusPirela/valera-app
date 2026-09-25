-- Las citas que llegan a "apartó" desaparecían, y a cierres había que pasarlas
-- a mano.
--
-- El trigger que alimenta la tabla de citas de venta solo dejaba entrar los
-- estados 'coordinada' y 'realizada'. Cualquier otro se BORRABA de la tabla, así
-- que en cuanto una cita pasaba a 'aparto' —que es el mejor desenlace posible—
-- se esfumaba justo cuando más se quería seguir. Había 26 citas así, 15 de
-- venta y 9 de renta, y ninguna estaba en la tabla.
--
-- Y la tabla de cierres se llenaba a mano, escribiendo otra vez el nombre, el
-- teléfono y la propiedad que ya estaban capturados en la cita.
--
-- Ahora:
--   · 'aparto' entra a la tabla de citas de VENTA, con el seguimiento en
--     'APARTADO' para que se distinga de un vistazo.
--   · al apartar se crea la fila en CIERRES, y ahí entran venta Y renta,
--     porque una renta cerrada también se sigue hasta la firma.
--
-- La fila de cierres se crea UNA vez y no se vuelve a tocar: a partir de ahí la
-- etapa (Apartado → Trámite → Escriturado) la maneja el equipo a mano, y
-- pisarla desde aquí borraría su avance. Por eso tampoco se borra si la cita
-- retrocede de estado.

-- Vínculo con la cita, para no crear la misma fila dos veces. Es lo que a
-- citas_venta le faltó en su día y lo que permitió los duplicados.
ALTER TABLE public.cierres ADD COLUMN IF NOT EXISTS cita_coordinacion_id uuid
  REFERENCES public.citas_coordinacion(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cierres_cita_coordinacion_id_key
  ON public.cierres (cita_coordinacion_id) WHERE cita_coordinacion_id IS NOT NULL;

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

  -- ── Apartó: a cierres, venta Y renta ──────────────────────────────────────
  -- Se inserta una sola vez. Si ya existe no se toca: la etapa la lleva el
  -- equipo a mano y pisarla aquí borraría su avance.
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

  IF NEW.estado NOT IN ('coordinada','realizada','aparto') THEN
    DELETE FROM citas_venta WHERE cita_coordinacion_id = NEW.id
      AND COALESCE(origen,'') <> 'retro_admin' AND retro_completada_at IS NULL;
    RETURN NEW;
  END IF;

  v_seguimiento := CASE WHEN NEW.estado = 'aparto' THEN 'APARTADO' ELSE NEW.estado END;

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
