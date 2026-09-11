-- Flujo de aprobación de citas creadas por asesores.
--
-- Un asesor puede agregar una cita (queda asesor_id = él por RLS), pero entra
-- como PENDIENTE DE APROBACIÓN: no cuenta como cita oficial hasta que un admin
-- la aprueba. Los admins reciben una notificación y la ven en un apartado para
-- aprobar (quitar el pendiente) o rechazar (borrarla).

alter table public.citas_coordinacion
  add column if not exists pendiente_aprobacion boolean not null default false,
  add column if not exists creada_por uuid references auth.users(id);

create index if not exists idx_citas_pendiente_aprob
  on public.citas_coordinacion (pendiente_aprobacion) where pendiente_aprobacion;

-- Solo un admin puede APROBAR (pasar pendiente_aprobacion de true→false). Si un
-- asesor intentara aprobarse su propia cita, el trigger la vuelve a dejar pendiente.
create or replace function public.fn_proteger_aprobacion_cita()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.pendiente_aprobacion and not new.pendiente_aprobacion and not public.is_admin() then
    new.pendiente_aprobacion := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_aprobacion_cita on public.citas_coordinacion;
create trigger trg_proteger_aprobacion_cita
  before update on public.citas_coordinacion
  for each row execute function public.fn_proteger_aprobacion_cita();

-- Al crear una cita pendiente, avisar a todos los admins (bandeja + push).
create or replace function public.fn_notificar_cita_pendiente()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cliente text; v_asesor text;
begin
  if new.pendiente_aprobacion then
    select nombre into v_cliente from public.clientes where id = new.cliente_id;
    select nombre into v_asesor  from public.profiles where id = coalesce(new.creada_por, new.asesor_id);
    insert into public.notificaciones (user_id, titulo, mensaje, tipo)
    select p.id, 'Cita por aprobar',
           coalesce(v_asesor, 'Un asesor') || ' agregó una cita' ||
           coalesce(' de ' || v_cliente, '') || ' que necesita tu aprobación.',
           'cita'
      from public.profiles p where p.role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificar_cita_pendiente on public.citas_coordinacion;
create trigger trg_notificar_cita_pendiente
  after insert on public.citas_coordinacion
  for each row execute function public.fn_notificar_cita_pendiente();
