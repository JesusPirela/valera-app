-- Anuncios / tablón de avisos para admins.
--
-- Un admin publica un anuncio, elige a quién le llega (todos, por rol, o
-- personas específicas) y con qué prioridad. Si es 'critica' le sale un POPUP
-- a cada destinatario en cuanto abre la app. Si además es una reunión, puede
-- pedir confirmación de asistencia y cada quien marca si va, no va, o tal vez.
--
-- Además de la tabla propia, se inserta una notificación normal (Avisos) por
-- destinatario para que quede en su bandeja y dispare el push existente.

-- ─────────────────────────────── Tablas ───────────────────────────────
create table if not exists public.anuncios (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null,
  cuerpo            text not null,
  prioridad         text not null default 'normal'
                      check (prioridad in ('normal','alta','critica')),
  es_reunion        boolean not null default false,
  evento_cuando     text,                       -- ej: "Viernes 12 de sept, 5:00 PM"
  pide_confirmacion boolean not null default false,
  audiencia         jsonb not null default '{}'::jsonb,  -- {todos, roles[], user_ids[]} (registro)
  creado_por        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  activo            boolean not null default true
);

create table if not exists public.anuncio_destinatarios (
  id              uuid primary key default gen_random_uuid(),
  anuncio_id      uuid not null references public.anuncios(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  visto           boolean not null default false,
  visto_at        timestamptz,
  confirmacion    text check (confirmacion in ('asiste','no_asiste','tal_vez')),
  confirmacion_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (anuncio_id, user_id)
);

create index if not exists idx_anuncio_dest_user on public.anuncio_destinatarios(user_id);
create index if not exists idx_anuncio_dest_anuncio on public.anuncio_destinatarios(anuncio_id);

-- ─────────────────────────────── RLS ───────────────────────────────
alter table public.anuncios enable row level security;
alter table public.anuncio_destinatarios enable row level security;

drop policy if exists anuncios_select on public.anuncios;
create policy anuncios_select on public.anuncios for select using (
  public.is_admin()
  or exists (select 1 from public.anuncio_destinatarios d
             where d.anuncio_id = anuncios.id and d.user_id = auth.uid())
);
drop policy if exists anuncios_admin_write on public.anuncios;
create policy anuncios_admin_write on public.anuncios for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists anuncio_dest_select on public.anuncio_destinatarios;
create policy anuncio_dest_select on public.anuncio_destinatarios for select
  using (public.is_admin() or user_id = auth.uid());
drop policy if exists anuncio_dest_update_own on public.anuncio_destinatarios;
create policy anuncio_dest_update_own on public.anuncio_destinatarios for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists anuncio_dest_admin_write on public.anuncio_destinatarios;
create policy anuncio_dest_admin_write on public.anuncio_destinatarios for all
  using (public.is_admin()) with check (public.is_admin());

-- ──────────────────────────── Crear anuncio ────────────────────────────
create or replace function public.crear_anuncio(
  p_titulo            text,
  p_cuerpo            text,
  p_prioridad         text    default 'normal',
  p_es_reunion        boolean default false,
  p_evento_cuando     text    default null,
  p_pide_confirmacion boolean default false,
  p_roles             text[]  default '{}',
  p_user_ids          uuid[]  default '{}',
  p_todos             boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_msg  text;
  v_n    int;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede publicar anuncios';
  end if;
  if coalesce(btrim(p_titulo),'') = '' or coalesce(btrim(p_cuerpo),'') = '' then
    raise exception 'El anuncio necesita título y contenido';
  end if;

  insert into public.anuncios(titulo, cuerpo, prioridad, es_reunion, evento_cuando,
                              pide_confirmacion, audiencia, creado_por)
  values (btrim(p_titulo), btrim(p_cuerpo), coalesce(p_prioridad,'normal'),
          coalesce(p_es_reunion,false), nullif(btrim(coalesce(p_evento_cuando,'')),''),
          coalesce(p_pide_confirmacion,false),
          jsonb_build_object('todos', coalesce(p_todos,false),
                             'roles', to_jsonb(p_roles),
                             'user_ids', to_jsonb(p_user_ids)),
          auth.uid())
  returning id into v_id;

  v_msg := case when coalesce(p_es_reunion,false) and nullif(btrim(coalesce(p_evento_cuando,'')),'') is not null
                then '📅 ' || btrim(p_evento_cuando) || ' — ' || btrim(p_cuerpo)
                else btrim(p_cuerpo) end;

  with base as (
    select pr.id
    from public.profiles pr
    where coalesce(pr.activo, true) = true
      and pr.id <> auth.uid()
      and (
        coalesce(p_todos,false)
        or (array_length(p_roles,1)   is not null and pr.role = any(p_roles))
        or (array_length(p_user_ids,1) is not null and pr.id = any(p_user_ids))
      )
  ),
  ins_dest as (
    insert into public.anuncio_destinatarios(anuncio_id, user_id)
    select v_id, id from base
    on conflict (anuncio_id, user_id) do nothing
    returning 1
  ),
  ins_notif as (
    insert into public.notificaciones(user_id, titulo, mensaje, tipo)
    select id, btrim(p_titulo), left(v_msg, 500), 'anuncio' from base
    returning 1
  )
  select count(*) into v_n from ins_dest;

  return jsonb_build_object('anuncio_id', v_id, 'destinatarios', v_n);
end;
$$;

-- ─────────────────── Popup pendiente del usuario actual ───────────────────
create or replace function public.get_mi_anuncio_pendiente()
returns table (
  id uuid, titulo text, cuerpo text, prioridad text, es_reunion boolean,
  evento_cuando text, pide_confirmacion boolean, confirmacion text, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select a.id, a.titulo, a.cuerpo, a.prioridad, a.es_reunion,
         a.evento_cuando, a.pide_confirmacion, d.confirmacion, a.created_at
  from public.anuncio_destinatarios d
  join public.anuncios a on a.id = d.anuncio_id
  where d.user_id = auth.uid()
    and a.activo
    and (
      (a.prioridad = 'critica' and (d.visto = false or (a.pide_confirmacion and d.confirmacion is null)))
      or (a.prioridad = 'alta' and d.visto = false)
    )
  order by case a.prioridad when 'critica' then 0 when 'alta' then 1 else 2 end,
           a.created_at desc
  limit 1;
$$;

create or replace function public.marcar_anuncio_visto(p_anuncio_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.anuncio_destinatarios
     set visto = true, visto_at = coalesce(visto_at, now())
   where anuncio_id = p_anuncio_id and user_id = auth.uid();
$$;

create or replace function public.confirmar_anuncio(p_anuncio_id uuid, p_confirmacion text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_confirmacion is not null and p_confirmacion not in ('asiste','no_asiste','tal_vez') then
    raise exception 'Confirmación inválida';
  end if;
  update public.anuncio_destinatarios
     set confirmacion = p_confirmacion, confirmacion_at = now(),
         visto = true, visto_at = coalesce(visto_at, now())
   where anuncio_id = p_anuncio_id and user_id = auth.uid();
end;
$$;

-- ─────────────────── Consultas para el panel de admin ───────────────────
create or replace function public.get_anuncios_admin()
returns table (
  id uuid, titulo text, cuerpo text, prioridad text, es_reunion boolean,
  evento_cuando text, pide_confirmacion boolean, activo boolean,
  created_at timestamptz, creador_nombre text,
  total int, vistos int, asisten int, no_asisten int, tal_vez int
)
language sql security definer set search_path = public as $$
  select a.id, a.titulo, a.cuerpo, a.prioridad, a.es_reunion, a.evento_cuando,
         a.pide_confirmacion, a.activo, a.created_at,
         pr.nombre as creador_nombre,
         count(d.*)::int as total,
         count(d.*) filter (where d.visto)::int as vistos,
         count(d.*) filter (where d.confirmacion = 'asiste')::int as asisten,
         count(d.*) filter (where d.confirmacion = 'no_asiste')::int as no_asisten,
         count(d.*) filter (where d.confirmacion = 'tal_vez')::int as tal_vez
  from public.anuncios a
  left join public.anuncio_destinatarios d on d.anuncio_id = a.id
  left join public.profiles pr on pr.id = a.creado_por
  where public.is_admin()
  group by a.id, pr.nombre
  order by a.created_at desc;
$$;

create or replace function public.get_anuncio_confirmaciones(p_anuncio_id uuid)
returns table (
  user_id uuid, nombre text, role text, avatar_url text,
  visto boolean, confirmacion text, confirmacion_at timestamptz
)
language sql security definer set search_path = public as $$
  select d.user_id, pr.nombre, pr.role, pr.avatar_url,
         d.visto, d.confirmacion, d.confirmacion_at
  from public.anuncio_destinatarios d
  join public.profiles pr on pr.id = d.user_id
  where public.is_admin() and d.anuncio_id = p_anuncio_id
  order by
    case d.confirmacion when 'asiste' then 0 when 'tal_vez' then 1 when 'no_asiste' then 2 else 3 end,
    pr.nombre;
$$;

create or replace function public.set_anuncio_activo(p_anuncio_id uuid, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  update public.anuncios set activo = p_activo where id = p_anuncio_id;
end;
$$;

create or replace function public.eliminar_anuncio(p_anuncio_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  delete from public.anuncios where id = p_anuncio_id;
end;
$$;

grant execute on function public.crear_anuncio(text,text,text,boolean,text,boolean,text[],uuid[],boolean) to authenticated;
grant execute on function public.get_mi_anuncio_pendiente() to authenticated;
grant execute on function public.marcar_anuncio_visto(uuid) to authenticated;
grant execute on function public.confirmar_anuncio(uuid,text) to authenticated;
grant execute on function public.get_anuncios_admin() to authenticated;
grant execute on function public.get_anuncio_confirmaciones(uuid) to authenticated;
grant execute on function public.set_anuncio_activo(uuid,boolean) to authenticated;
grant execute on function public.eliminar_anuncio(uuid) to authenticated;
