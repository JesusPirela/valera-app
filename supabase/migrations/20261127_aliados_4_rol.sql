-- Etapa 2: EL ROL DE ALIADO existe.
--
-- Hasta aquí solo estaba el piso (a qué organización pertenece cada persona y
-- qué inmobiliarias tienen cuenta). El rol como tal no se podía ni guardar: la
-- tabla de perfiles tiene una restricción que solo aceptaba los siete roles de
-- casa.
--
-- Dos roles, no uno:
--   · `aliado_admin`  — quien manda en SU inmobiliaria: publica, edita, ve los
--     números de toda su agencia y (más adelante) invita a su gente.
--   · `aliado_agente` — sus asesores: trabajan el catálogo y sus clientes.
--
-- Lo que un aliado puede hacer se escribe AQUÍ, no en las pantallas: una
-- pantalla escondida sigue siendo una puerta abierta si la base deja pasar.

-- -- 1. La base acepta los dos roles nuevos ------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (
  role = any (array[
    'admin', 'prospectador', 'prospectador_plus', 'nuevo',
    'supervisor', 'asesor', 'gerente',
    'aliado_admin', 'aliado_agente'
  ])
);

-- -- 2. Saber si quien pregunta es de fuera ------------------------------------
-- SECURITY DEFINER por lo mismo que mi_inmobiliaria(): estas funciones se usan
-- dentro de políticas que viven sobre las mismas tablas que consultan.
create or replace function public.es_aliado()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role in ('aliado_admin', 'aliado_agente')
  );
$$;

create or replace function public.es_aliado_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'aliado_admin'
  );
$$;

revoke all on function public.es_aliado() from public, anon;
revoke all on function public.es_aliado_admin() from public, anon;
grant execute on function public.es_aliado() to authenticated;
grant execute on function public.es_aliado_admin() to authenticated;

-- -- 3. SUS propiedades: las que son de su inmobiliaria -------------------------
--
-- Leer el catálogo compartido ya lo podían (la política de lectura deja ver
-- todo lo que no es inventario). Lo que no podían era PUBLICAR: insertar,
-- editar y borrar eran de admin y de nadie más.
--
-- La condición es siempre la misma y es la que impide que toquen lo nuestro:
-- la propiedad tiene que ser de SU inmobiliaria. Al insertar se comprueba
-- además que no puedan ponerle la etiqueta de otra agencia ni dejarla sin
-- dueño, que sería colársela a Valera.
create policy propiedades_insert_aliado on public.propiedades
  for insert to authenticated
  with check (
    public.es_aliado()
    and inmobiliaria_id is not null
    and inmobiliaria_id = public.mi_inmobiliaria()
    -- El inventario interno ("Lonas") es cosa nuestra: no se les deja crear ahí.
    and coalesce(es_inventario, false) = false
  );

create policy propiedades_update_aliado on public.propiedades
  for update to authenticated
  using (public.es_aliado() and inmobiliaria_id = public.mi_inmobiliaria())
  with check (
    inmobiliaria_id = public.mi_inmobiliaria()
    and coalesce(es_inventario, false) = false
  );

create policy propiedades_delete_aliado on public.propiedades
  for delete to authenticated
  using (public.es_aliado() and inmobiliaria_id = public.mi_inmobiliaria());

-- -- 4. Las fotos de sus propiedades --------------------------------------------
create policy propiedad_imagenes_insert_aliado on public.propiedad_imagenes
  for insert to authenticated
  with check (
    public.es_aliado()
    and exists (
      select 1 from public.propiedades p
       where p.id = propiedad_id and p.inmobiliaria_id = public.mi_inmobiliaria()
    )
  );

create policy propiedad_imagenes_mod_aliado on public.propiedad_imagenes
  for update to authenticated
  using (
    public.es_aliado()
    and exists (
      select 1 from public.propiedades p
       where p.id = propiedad_id and p.inmobiliaria_id = public.mi_inmobiliaria()
    )
  );

create policy propiedad_imagenes_del_aliado on public.propiedad_imagenes
  for delete to authenticated
  using (
    public.es_aliado()
    and exists (
      select 1 from public.propiedades p
       where p.id = propiedad_id and p.inmobiliaria_id = public.mi_inmobiliaria()
    )
  );

-- Y el depósito de archivos, para que puedan subirlas. Borrar y modificar se
-- quedan en admin a propósito: una foto subida por error se vuelve a subir,
-- pero una foto borrada de una propiedad ajena no vuelve.
create policy propiedades_subir_aliado on storage.objects
  for insert to authenticated
  with check (bucket_id = 'propiedades' and public.es_aliado());

-- -- 5. Lo que NO pueden hacer, dicho explícitamente ----------------------------
--
-- Avisos a nuestra gente. `notificaciones` dejaba insertar con la regla en
-- `true` —cualquiera podía crearle un aviso a cualquiera— y la app lo usa de
-- verdad para avisarle a un asesor. Se conserva para los de casa y se le cierra
-- a los de fuera, que solo pueden avisarse entre ellos.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname='public' and tablename='notificaciones' and cmd='INSERT'
  loop
    execute format('drop policy %I on public.notificaciones', p.policyname);
  end loop;
end $$;

create policy notificaciones_insert on public.notificaciones
  for insert to authenticated
  with check (
    not public.es_aliado()
    or user_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
       where p.id = user_id and p.inmobiliaria_id = public.mi_inmobiliaria()
    )
  );

-- REVERTIR
--   drop policy propiedades_insert_aliado on public.propiedades;
--   drop policy propiedades_update_aliado on public.propiedades;
--   drop policy propiedades_delete_aliado on public.propiedades;
--   drop policy propiedad_imagenes_insert_aliado on public.propiedad_imagenes;
--   drop policy propiedad_imagenes_mod_aliado on public.propiedad_imagenes;
--   drop policy propiedad_imagenes_del_aliado on public.propiedad_imagenes;
--   drop policy propiedades_subir_aliado on storage.objects;
--   drop policy notificaciones_insert on public.notificaciones;
--   create policy notificaciones_insert on public.notificaciones
--     for insert to authenticated with check (true);
--   drop function public.es_aliado(); drop function public.es_aliado_admin();
--   -- y devolver profiles_role_check a los siete roles de casa.
