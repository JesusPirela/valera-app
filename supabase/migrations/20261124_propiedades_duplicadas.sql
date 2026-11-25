-- "Publicaciones repetidas": encontrar la misma propiedad metida dos veces.
--
-- Medido sobre las 2,727 propiedades antes de escribir nada: hay 922 parejas
-- sospechosas que tocan 1,005 propiedades. No todas son repetidas --por eso
-- esto NO borra nada y nunca lo hara: senala, ordena por que tan seguro esta,
-- y una persona entra a la ficha y decide.
--
-- Lo que NO sirve como senal, aunque parezca:
--   * El titulo solo. 56 propiedades se llaman "Casa en venta en Zibata,
--     Queretaro, Mexico" y tienen 41 precios distintos.
--   * El precio 0 o 1. Son relleno: 36 propiedades traen precio 1, 1 recamara,
--     1 bano y 1 m2. Agrupadas daban una "repeticion" de 36 que no existe.
--   * La direccion sola. En la mayoria es la colonia, no la direccion.
--
-- Lo que si: la misma foto, la misma liga de origen, la misma descripcion, y
-- las combinaciones de precio real con direccion, titulo o ficha.

-- -- 1. Lo ya revisado ------------------------------------------------------
-- Sin esto, las parejas que ya miraste y resultaron no ser repetidas vuelven
-- a salir cada vez, y la lista nunca se acaba.
create table if not exists public.propiedad_duplicado_descartado (
  a_id       uuid not null references public.propiedades(id) on delete cascade,
  b_id       uuid not null references public.propiedades(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  nota       text,
  created_at timestamptz not null default now(),
  primary key (a_id, b_id),
  -- Siempre el menor primero: asi una pareja es UNA fila, no dos.
  constraint dup_descartado_orden check (a_id < b_id)
);

alter table public.propiedad_duplicado_descartado enable row level security;
drop policy if exists dup_descartado_admin on public.propiedad_duplicado_descartado;
create policy dup_descartado_admin on public.propiedad_duplicado_descartado
  for all
  using (exists (select 1 from public.profiles p
                  where p.id = (select auth.uid())
                    and p.role in ('admin', 'gerente', 'supervisor')))
  with check (exists (select 1 from public.profiles p
                       where p.id = (select auth.uid())
                         and p.role in ('admin', 'gerente', 'supervisor')));

-- Las dos uniones que hace el detector.
create index if not exists idx_prop_img_url on public.propiedad_imagenes (url);
create index if not exists idx_prop_img_phash on public.propiedad_imagenes (phash) where phash is not null;

-- -- 2. El detector ---------------------------------------------------------
create or replace function public.propiedades_duplicadas()
returns table (a_id uuid, b_id uuid, motivos text[], puntos int)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  -- El guardia va con EXISTS y no con "rol not in (...)": si el perfil no
  -- tiene rol, el rol sale NULL y "NULL not in (...)" no bloquea a nadie.
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role in ('admin', 'gerente', 'supervisor')
  ) then
    return;
  end if;

  return query
  with p as (
    select pr.id, pr.tipo, pr.operacion, pr.recamaras, pr.banos, pr.m2,
           lower(regexp_replace(coalesce(pr.direccion, ''), '[^a-zA-Z0-9]', '', 'g')) as dir_k,
           lower(regexp_replace(coalesce(pr.titulo, ''),    '[^a-zA-Z0-9]', '', 'g')) as tit_k,
           lower(regexp_replace(coalesce(pr.descripcion,''),'[^a-zA-Z0-9]', '', 'g')) as desc_k,
           pr.url_origen,
           case when pr.precio > 1000 then pr.precio end as precio_real
      from public.propiedades pr
  ),
  pares as (
    -- La misma liga de donde se importo: no hay forma de que sean dos casas.
    select a.id ia, b.id ib, 'misma liga de origen'::text m, 100 pts
      from p a join p b on a.url_origen = b.url_origen and a.id < b.id
     where length(coalesce(a.url_origen, '')) > 15
    union all
    -- Literalmente el mismo archivo de foto.
    select distinct a.propiedad_id, b.propiedad_id, 'la misma foto', 90
      from public.propiedad_imagenes a
      join public.propiedad_imagenes b on a.url = b.url and a.propiedad_id < b.propiedad_id
    union all
    -- Fotos distintas pero con la misma huella: la misma imagen reescalada.
    select distinct a.propiedad_id, b.propiedad_id, 'fotos iguales', 80
      from public.propiedad_imagenes a
      join public.propiedad_imagenes b on a.phash = b.phash and a.propiedad_id < b.propiedad_id
     where length(coalesce(a.phash, '')) > 8
    union all
    select a.id, b.id, 'misma descripcion', 70
      from p a join p b on a.desc_k = b.desc_k and a.id < b.id
     where length(a.desc_k) > 120
    union all
    select a.id, b.id, 'misma direccion y mismo precio', 45
      from p a join p b on a.dir_k = b.dir_k and a.precio_real = b.precio_real and a.id < b.id
     where length(a.dir_k) > 14
    union all
    select a.id, b.id, 'mismo titulo y mismo precio', 40
      from p a join p b on a.tit_k = b.tit_k and a.precio_real = b.precio_real and a.id < b.id
     where length(a.tit_k) > 12
    union all
    select a.id, b.id, 'mismo precio y mismos datos', 35
      from p a join p b on a.precio_real = b.precio_real
       and a.tipo is not distinct from b.tipo
       and a.operacion is not distinct from b.operacion
       and a.recamaras is not distinct from b.recamaras
       and a.banos is not distinct from b.banos
       and a.m2 is not distinct from b.m2
       and a.id < b.id
     where a.recamaras is not null and a.m2 > 10
  )
  -- La contradiccion fisica manda sobre cualquier senal.
  --
  -- Un desarrollo publica sus CUATRO modelos con las mismas fotos y la misma
  -- liga de origen. Sin esto, Catania Residencial salia como un solo caso de
  -- 4 copias: VR-1839 y VR-1841 si son la misma (2,199,000 y 80.91 m2), pero
  -- VR-1840 (3,239,000 y 95.10 m2) y VR-1842 (4,074,000 y 149.18 m2) son
  -- modelos distintos. Una casa no cambia de tamano.
  --
  -- El corte es RELATIVO, no en metros: 14 m2 de diferencia no significan lo
  -- mismo en un departamento de 60 que en una casa de 400. Con el corte
  -- absoluto en 15 m2, VR-1840 (95.10 contra 80.91: un 17.5% mas grande, otro
  -- modelo) se colaba por 0.8 m2.
  --
  -- Medido sobre las parejas que tienen m2 en las dos: 299 con EXACTAMENTE el
  -- mismo, 40 hasta el 2%, 53 entre 2 y 6%, 117 entre 6 y 15%, y 354 arriba
  -- del 15%. Arriba del 15% se descarta; lo de en medio no se tira, se le
  -- bajan puntos y cae en "puede ser", que es el monton que se revisa al
  -- final.
  --
  -- Las recamaras NO excluyen, solo restan: hasta el 24/nov/2026 se guardaban
  -- topadas en 5, asi que una copia con 5 y otra con 7 puede ser la misma
  -- propiedad con una mal leida.
  select q.ia, q.ib, array_agg(distinct q.m),
         (sum(q.pts)
          - case when pa.recamaras is not null and pb.recamaras is not null
                  and pa.recamaras <> pb.recamaras then 25 else 0 end
          - case when pa.m2 > 10 and pb.m2 > 10
                  and abs(pa.m2 - pb.m2) / least(pa.m2, pb.m2) > 0.06 then 35
                 when pa.m2 > 10 and pb.m2 > 10
                  and abs(pa.m2 - pb.m2) / least(pa.m2, pb.m2) > 0.01 then 20
                 else 0 end)::int
    from pares q
    join public.propiedades pa on pa.id = q.ia
    join public.propiedades pb on pb.id = q.ib
   where not (pa.m2 > 10 and pb.m2 > 10
              and abs(pa.m2 - pb.m2) / least(pa.m2, pb.m2) > 0.15)
     and not exists (
       select 1 from public.propiedad_duplicado_descartado d
        where d.a_id = q.ia and d.b_id = q.ib
     )
   group by q.ia, q.ib, pa.recamaras, pb.recamaras, pa.m2, pb.m2
   order by 4 desc;
end
$fn$;

revoke all on function public.propiedades_duplicadas() from public, anon;
grant execute on function public.propiedades_duplicadas() to authenticated;

-- -- 3. Los datos para ensenar cada propiedad --------------------------------
-- Aparte del detector para no repetir los mismos campos en las dos mitades de
-- cada pareja: una propiedad puede salir en varias parejas.
create or replace function public.duplicados_detalle(ids uuid[])
returns table (
  id uuid, codigo text, titulo text, precio numeric, estado text,
  tipo text, operacion text, recamaras smallint, banos smallint, m2 numeric,
  zona text, direccion text, created_at timestamptz,
  foto text, publicaciones int, fotos int
)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if not exists (
    select 1 from public.profiles pf
     where pf.id = auth.uid() and pf.role in ('admin', 'gerente', 'supervisor')
  ) then
    return;
  end if;

  return query
  select pr.id, pr.codigo, pr.titulo, pr.precio, pr.estado,
         pr.tipo, pr.operacion, pr.recamaras, pr.banos, pr.m2,
         pr.zona, pr.direccion, pr.created_at,
         img.url,
         coalesce(pr.total_publicadores, 0),
         (select count(*)::int from public.propiedad_imagenes i where i.propiedad_id = pr.id)
    from public.propiedades pr
    left join lateral (
      select coalesce(i.thumb_url, i.url) as url
        from public.propiedad_imagenes i
       where i.propiedad_id = pr.id
       order by i.orden nulls last, i.created_at
       limit 1
    ) img on true
   where pr.id = any(ids);
end
$fn$;

revoke all on function public.duplicados_detalle(uuid[]) from public, anon;
grant execute on function public.duplicados_detalle(uuid[]) to authenticated;
