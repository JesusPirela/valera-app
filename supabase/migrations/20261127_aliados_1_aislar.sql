-- CUENTAS DE INMOBILIARIA ALIADA · Etapa 1: cerrar la casa.
--
-- Antes de que exista el primer usuario que no es de Valera, hay que tapar lo
-- que hoy está abierto y no se nota porque solo entramos nosotros. Esta
-- migración NO crea todavía ninguna cuenta aliada: deja la base lista y, de
-- paso, la app más segura aunque el proyecto se parara aquí.
--
-- Lo que cambia para el equipo de Valera: NADA. Todos tenemos
-- `inmobiliaria_id` vacío, así que seguimos viéndonos entre nosotros igual que
-- antes. Lo que cambia es lo que vería alguien de fuera.

-- -- 0. Respaldo de lo que se va a tocar -------------------------------------
create table if not exists public.respaldo_inmobiliarias_20261127 as
  select * from public.inmobiliarias;

create table if not exists public.respaldo_props_inmobiliaria_20261127 as
  select id, codigo, inmobiliaria_id from public.propiedades
   where inmobiliaria_id is not null;

-- -- 1. A qué organización pertenece cada persona ------------------------------
-- Vacío = Valera. Con valor = esa inmobiliaria aliada. Es la columna sobre la
-- que se apoya todo el aislamiento de aquí en adelante.
alter table public.profiles
  add column if not exists inmobiliaria_id uuid references public.inmobiliarias(id) on delete set null;

create index if not exists idx_profiles_inmobiliaria on public.profiles (inmobiliaria_id)
  where inmobiliaria_id is not null;

-- Qué inmobiliarias además TIENEN CUENTA en la app (no solo aparecen como
-- dueñas de una propiedad). Las 23 que ya existen nacen en false: para ellas
-- no cambia nada.
alter table public.inmobiliarias
  add column if not exists es_aliada boolean not null default false;

comment on column public.profiles.inmobiliaria_id is
  'Organización a la que pertenece. NULL = equipo Valera. Con valor = inmobiliaria aliada.';
comment on column public.inmobiliarias.es_aliada is
  'true = esta inmobiliaria tiene cuenta propia en la app (usuarios colgando de ella).';

-- -- 2. La inmobiliaria de quien pregunta --------------------------------------
-- SECURITY DEFINER a propósito, igual que is_admin(): una política sobre
-- `profiles` que consulte `profiles` se llama a sí misma y Postgres corta con
-- "infinite recursion detected in policy". Dentro de una función definer la
-- consulta no vuelve a pasar por la política.
create or replace function public.mi_inmobiliaria()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select inmobiliaria_id from public.profiles where id = auth.uid();
$$;

revoke all on function public.mi_inmobiliaria() from public, anon;
grant execute on function public.mi_inmobiliaria() to authenticated;

-- -- 3. Los perfiles dejan de ser de lectura libre ------------------------------
-- Estaba así:  SELECT ... USING (true)  para todo usuario con sesión. O sea,
-- cualquiera que entrara a la app podía leer los 129 perfiles del equipo con
-- su nombre, teléfono, rol y bloque. Hoy no se nota porque solo entramos
-- nosotros; el día que entre alguien de fuera, sí.
--
-- La regla nueva: te veo si somos de la MISMA organización. `is not distinct
-- from` es lo que hace que NULL valga como valor: todo el equipo de Valera
-- tiene NULL y por eso se sigue viendo entre sí. No es lo mismo que `=`, que
-- con NULL devuelve NULL y no deja pasar a nadie.
drop policy if exists perfiles_lectura_publica on public.profiles;
create policy perfiles_misma_organizacion on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_admin()
    or inmobiliaria_id is not distinct from public.mi_inmobiliaria()
  );

-- -- 4. Las tres inmobiliarias duplicadas ---------------------------------------
-- La tabla trae pares que solo se diferencian en mayúsculas: "VERDE OLIVO"
-- (87 propiedades) y "Verde Olivo" (0), "TORY" (12) y "Tory" (0), "VALERA
-- REAL ESTATE" (1) y "valera real estate" (0). Con cuentas aliadas colgando
-- de esta tabla, dos registros para la misma agencia se vuelven dos cuentas.
--
-- Se conserva SIEMPRE el que tiene propiedades y se borra el vacío. Si alguno
-- tuviera propiedades, se le mueven antes (el update de abajo lo cubre) y
-- solo entonces se borra. `propiedades` es la única tabla que apunta aquí
-- (verificado contra las llaves foráneas), así que no hay nada más que mover.
do $$
declare
  r record;
begin
  for r in
    -- (array_agg(...))[1] y no min(): Postgres no sabe sacarle el mínimo a un
    -- uuid. Como el having de abajo exige que haya EXACTAMENTE uno con
    -- propiedades, el arreglo trae un solo elemento.
    select (array_agg(id) filter (where props > 0))[1] as queda,
           array_agg(id) filter (where props = 0) as sobran
      from (
        select i.id, unaccent(lower(trim(i.nombre))) as k,
               (select count(*) from public.propiedades p where p.inmobiliaria_id = i.id) as props
          from public.inmobiliarias i
      ) t
     group by k
    having count(*) > 1 and count(*) filter (where props > 0) = 1
  loop
    update public.propiedades set inmobiliaria_id = r.queda
     where inmobiliaria_id = any(r.sobran);
    delete from public.inmobiliarias where id = any(r.sobran);
  end loop;
end $$;

-- REVERTIR
--   alter table public.profiles drop column inmobiliaria_id;
--   alter table public.inmobiliarias drop column es_aliada;
--   drop function public.mi_inmobiliaria();
--   drop policy perfiles_misma_organizacion on public.profiles;
--   create policy perfiles_lectura_publica on public.profiles
--     for select to authenticated using (true);
--   -- y para las inmobiliarias borradas:
--   insert into public.inmobiliarias select * from public.respaldo_inmobiliarias_20261127
--     on conflict (id) do nothing;
--   update public.propiedades p set inmobiliaria_id = r.inmobiliaria_id
--     from public.respaldo_props_inmobiliaria_20261127 r where r.id = p.id;
