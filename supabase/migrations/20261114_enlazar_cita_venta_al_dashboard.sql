-- Sube al dashboard una cita capturada A MANO en la tabla de citas de venta.
--
-- El dashboard y la pantalla de coordinacion no leen citas_venta: leen
-- citas_coordinacion. Hasta ahora la sincronizacion iba en un solo sentido
-- (de coordinacion hacia la tabla), asi que lo que se capturaba en la tabla
-- no llegaba a ningun lado.
--
-- Como funciona, y por que asi:
--   1. Se resuelve el cliente por telefono (se crea si no existe).
--   2. Se inserta la cita de coordinacion.
--   3. El trigger fn_citas_venta_desde_coordinacion crea SU PROPIA fila en
--      citas_venta, ya enlazada. No se puede enlazar la fila original antes
--      de insertar porque una llave foranea lo impide.
--   4. Se le pasan a esa fila los datos que solo tenia la capturada a mano
--      (forma de pago, zona, texto de la propiedad) y se borra la original.
-- Queda UNA sola fila, enlazada y completa.
create or replace function public.enlazar_cita_venta_al_dashboard(p_cita_venta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Los unicos que el trigger acepta como coordinadores. Si no es uno de
  -- estos, BORRA la fila de la tabla; por eso aqui se rechaza antes de tocar
  -- nada, en vez de arriesgarse a perder la cita.
  v_coordinadores uuid[] := ARRAY[
    '6735dd82-3c79-4fd3-86cd-870c45fbda94',  -- Alexis
    'd0a9694f-f73a-428f-a455-5f039e4b84dc',  -- Chucho
    'befd463f-4ed4-4cf4-a3ea-22998f6621b5',  -- Carlos Carbajal
    '9bfe9db6-a274-42b6-a2cd-9bd3237b88cf',  -- Andres Valera (admin)
    '90605894-18ed-46ae-a031-5a7ac6193810',  -- Andres Valera (supervisor)
    '9c1db0b4-77a8-4235-af35-b53e606546e5'   -- Rayo
  ]::uuid[];
  r public.citas_venta%rowtype;
  v_cli uuid; v_coord uuid; v_prosp uuid; v_ases uuid; v_prop uuid;
  v_cod text; v_nuevo uuid; v_nueva_id uuid; v_digitos text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_autenticado');
  end if;

  select * into r from public.citas_venta where id = p_cita_venta_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if r.cita_coordinacion_id is not null then
    return jsonb_build_object('ok', true, 'ya_estaba', true);
  end if;
  if r.fecha_cita is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_fecha');
  end if;

  -- Coordinador. Se exige PRIMERO: sin uno valido no vale la pena seguir.
  if nullif(trim(coalesce(r.coordino, '')), '') is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_coordinador');
  end if;
  select p.id into v_coord from public.profiles p
    where p.id = any(v_coordinadores)
      and lower(p.nombre) like '%' || lower(split_part(trim(r.coordino), ' ', 1)) || '%'
    limit 1;
  if v_coord is null then
    return jsonb_build_object('ok', false, 'motivo', 'coordinador_no_reconocido',
                              'coordino', r.coordino);
  end if;

  -- Cliente, por los ultimos 10 digitos del telefono.
  v_digitos := regexp_replace(coalesce(r.telefono, ''), '\D', '', 'g');
  if length(v_digitos) >= 10 then
    select c.id into v_cli from public.clientes c
      where right(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g'), 10) = right(v_digitos, 10)
      limit 1;
  end if;
  if v_cli is null then
    insert into public.clientes (nombre, telefono, fuente_lead, estado, tipo_operacion, responsable_id)
    values (coalesce(nullif(trim(r.cliente_nombre), ''), 'Sin nombre'),
            r.telefono, 'otro', 'cita_agendada', 'venta', coalesce(v_prosp, auth.uid()))
    returning id into v_cli;
  end if;
  -- El trigger exige que el CLIENTE sea de venta. Solo se rellena si esta
  -- vacio: pisar un 'renta' seria inventar un dato.
  update public.clientes set tipo_operacion = 'venta', updated_at = now()
    where id = v_cli and tipo_operacion is null;

  -- Prospectador y asesor: por nombre exacto, que es como los guarda el
  -- formulario (se eligen de una lista, no se teclean).
  select p.id into v_prosp from public.profiles p
    where lower(p.nombre) = lower(trim(coalesce(r.prospecto, ''))) limit 1;
  select p.id into v_ases from public.profiles p
    where lower(p.nombre) = lower(trim(coalesce(r.atendio, ''))) limit 1;

  -- Propiedad por el codigo VR-xxxx que trae el texto; si no, texto libre.
  v_cod := (regexp_match(coalesce(r.interesado_en, ''), '([A-Z]{2,3}-[0-9]{3,5})'))[1];
  if v_cod is not null then
    select id into v_prop from public.propiedades where codigo = v_cod limit 1;
  end if;

  v_nuevo := gen_random_uuid();
  insert into public.citas_coordinacion
    (id, cliente_id, prospectador_id, coordinado_por, asesor_id,
     propiedad_id, propiedad_externa, estado, fecha_cita, pendiente_aprobacion)
  values
    (v_nuevo, v_cli, v_prosp, v_coord, v_ases, v_prop,
     case when v_prop is null then nullif(trim(coalesce(r.interesado_en, '')), '') end,
     'coordinada', r.fecha_cita, false);

  -- La fila que acaba de crear el trigger.
  select id into v_nueva_id from public.citas_venta
    where cita_coordinacion_id = v_nuevo limit 1;

  if v_nueva_id is null then
    -- Alguna condicion del trigger no se cumplio. Se deshace para no dejar
    -- una cita de coordinacion huerfana ni perder la capturada a mano.
    delete from public.citas_coordinacion where id = v_nuevo;
    return jsonb_build_object('ok', false, 'motivo', 'rechazada_por_el_sistema');
  end if;

  -- Lo que solo tenia la fila capturada a mano.
  update public.citas_venta cv set
    detalles_pago      = coalesce(cv.detalles_pago, r.detalles_pago),
    zona_interesada    = coalesce(cv.zona_interesada, r.zona_interesada),
    interesado_en      = coalesce(nullif(trim(coalesce(cv.interesado_en, '')), ''), r.interesado_en),
    dia_cita           = coalesce(nullif(trim(coalesce(cv.dia_cita, '')), ''), r.dia_cita),
    estado_seguimiento = coalesce(nullif(trim(coalesce(r.estado_seguimiento, '')), ''), cv.estado_seguimiento),
    orden              = r.orden,
    origen             = 'manual'
  where cv.id = v_nueva_id;

  delete from public.citas_venta where id = p_cita_venta_id;

  return jsonb_build_object('ok', true, 'cita_id', v_nuevo, 'cita_venta_id', v_nueva_id);
end $$;

grant execute on function public.enlazar_cita_venta_al_dashboard(uuid) to authenticated;
