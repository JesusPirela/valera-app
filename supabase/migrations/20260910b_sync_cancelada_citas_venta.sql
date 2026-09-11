-- Cuando una cita de coordinación pasa a 'cancelada', su fila en citas_venta
-- debe verse como CANCELADA (rojo + 🚫), igual que las que ya venían canceladas.
--
-- Ya existía fn_citas_venta_desde_coordinacion() (trigger tr_citas_venta_desde_coord)
-- que sincroniza coordinación → citas_venta, y SÍ marcaba 'CANCELADA'… pero DESPUÉS
-- de un guard que hace RETURN para: citas que no son 'venta', citas que no coordinó
-- uno de los 2 admins, y filas de retro_admin. Esas nunca llegaban a marcarse (o la
-- fila se borraba) y por eso una cita que estaba en 'realizada' y se cancelaba no se
-- veía cancelada. La corrección: manejar 'cancelada' AL INICIO, marcando la fila (si
-- existe) sin borrarla, sin importar tipo de operación ni quién coordinó.

create or replace function public.fn_citas_venta_desde_coordinacion()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
DECLARE v_nombre text; v_tel text; v_pago text; v_op text; v_prop text; v_coord text; v_prosp text; v_ases text; v_existe boolean;
BEGIN
  SELECT nombre, telefono, tipo_credito, tipo_operacion INTO v_nombre, v_tel, v_pago, v_op FROM clientes WHERE id = NEW.cliente_id;
  SELECT EXISTS(SELECT 1 FROM citas_venta WHERE cita_coordinacion_id = NEW.id) INTO v_existe;

  -- CANCELADA primero: si ya hay fila (p. ej. venía de 'realizada'), se marca
  -- CANCELADA y NO se borra, sin importar tipo de operación ni quién coordinó.
  IF NEW.estado = 'cancelada' THEN
    IF v_existe THEN
      UPDATE citas_venta SET estado_seguimiento = 'CANCELADA' WHERE cita_coordinacion_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  -- No es venta o no la coordinamos nosotros: nunca aplica → sacarla, PERO se
  -- conservan las filas de retro del admin y las que ya tienen retro llenada.
  IF NEW.coordinado_por IS NULL
     OR NEW.coordinado_por NOT IN ('6735dd82-3c79-4fd3-86cd-870c45fbda94','d0a9694f-f73a-428f-a455-5f039e4b84dc')
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

-- Quitar el trigger extra que se probó antes; el arreglo va dentro de la función de arriba.
drop trigger if exists trg_sync_cancelada_citas_venta on public.citas_coordinacion;
drop function if exists public.sync_cancelada_a_citas_venta();

-- Corrección de una vez: cualquier cita ya cancelada con fila enlazada → CANCELADA.
update public.citas_venta cv
   set estado_seguimiento = 'CANCELADA', updated_at = now()
  from public.citas_coordinacion cc
 where cc.id = cv.cita_coordinacion_id
   and cc.estado = 'cancelada'
   and upper(trim(coalesce(cv.estado_seguimiento, ''))) <> 'CANCELADA';
