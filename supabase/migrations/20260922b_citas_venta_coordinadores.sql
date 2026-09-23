-- Amplía QUIÉNES pueden alimentar la tabla de Citas de venta.
--
-- Antes, fn_citas_venta_desde_coordinacion solo aceptaba citas coordinadas por
-- Alexis o Chucho (los dos ids de lib/adminsPrincipales.ts, hardcodeados). Si
-- coordinaba cualquier otro admin, la cita NUNCA aparecía en la tabla — y no
-- avisaba: simplemente no entraba.
--
-- A petición del usuario ahora también cuentan Carlos Carbajal, Andrés Valera
-- (tiene cuenta admin y supervisor: se incluyen las dos) y Rayo.
-- Las otras dos condiciones NO cambian: el cliente debe ser de 'venta' (las de
-- renta siguen fuera, es la tabla de citas de VENTA) y el estado debe ser
-- 'coordinada' o 'realizada'.
--
-- Para dar de alta a alguien más, agrega su id al array v_coordinadores.
-- Aplicada a producción el 2026-09-22.
CREATE OR REPLACE FUNCTION public.fn_citas_venta_desde_coordinacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nombre text; v_tel text; v_pago text; v_op text; v_prop text;
  v_coord text; v_prosp text; v_ases text; v_existe boolean;
  v_coordinadores uuid[] := ARRAY[
    '6735dd82-3c79-4fd3-86cd-870c45fbda94',  -- Alexis
    'd0a9694f-f73a-428f-a455-5f039e4b84dc',  -- Chucho
    'befd463f-4ed4-4cf4-a3ea-22998f6621b5',  -- Carlos Carbajal
    '9bfe9db6-a274-42b6-a2cd-9bd3237b88cf',  -- Andrés Valera (admin)
    '90605894-18ed-46ae-a031-5a7ac6193810',  -- Andrés Valera (supervisor)
    '9c1db0b4-77a8-4235-af35-b53e606546e5'   -- Rayo
  ]::uuid[];
BEGIN
  SELECT nombre, telefono, tipo_credito, tipo_operacion INTO v_nombre, v_tel, v_pago, v_op FROM clientes WHERE id = NEW.cliente_id;
  SELECT EXISTS(SELECT 1 FROM citas_venta WHERE cita_coordinacion_id = NEW.id) INTO v_existe;

  IF NEW.estado = 'cancelada' THEN
    IF v_existe THEN
      UPDATE citas_venta SET estado_seguimiento = 'CANCELADA' WHERE cita_coordinacion_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

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
