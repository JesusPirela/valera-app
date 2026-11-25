-- Las alianzas pasan de "Asesores externos" a "Colaboradores → Por entrar".
--
-- Las dos listas tienen trabajos distintos: Asesores externos es a quién le
-- MANDAMOS una cita por zona; Colaboradores es a quién le PEDIMOS opciones
-- para subir. Una alianza con otra inmobiliaria no es ninguna de las dos
-- todavía: está a nada de ser colaborador, pero no lo es.
--
-- Hasta hoy vivían en Asesores externos marcadas como "Alianza", donde no se
-- les pide catálogo ni se les mide. Se mueven a Colaboradores en una etapa
-- aparte, para que se vean junto a quienes ya colaboran sin contarse como
-- tales y sin ensuciar los filtros de "quién me falta actualizar".
--
-- Medido antes de mover: 14 alianzas, 0 llaves foráneas apuntando a
-- asesores_externos (nada más en la base las referencia) y un solo choque de
-- nombre ("SUSANA DE URBANCD" contra el colaborador "URBANCD", que ya está
-- conectado). Ese choque NO se junta solo: se deja anotado para que una
-- persona decida, porque juntarlos borraría un dato que nadie dio.

-- ── 0. Respaldo ────────────────────────────────────────────────────────────
-- Para volver atrás: ver REVERTIR al final de este archivo.
create table if not exists respaldo_colaboradores_20261124 as
  select * from public.colaboradores;
create table if not exists respaldo_asesores_externos_20261124 as
  select * from public.asesores_externos;

-- ── 1. La etapa ────────────────────────────────────────────────────────────
-- 'colaborador' = ya trabajamos con él. 'por_entrar' = alianza a punto de
-- serlo. Por defecto 'colaborador': los 59 que ya estaban lo son.
alter table public.colaboradores
  add column if not exists etapa text not null default 'colaborador';
alter table public.colaboradores drop constraint if exists colaboradores_etapa_check;
alter table public.colaboradores add constraint colaboradores_etapa_check
  check (etapa in ('colaborador', 'por_entrar'));

comment on column public.colaboradores.etapa is
  'colaborador = ya le pedimos opciones; por_entrar = alianza que todavia no es colaborador (venia de asesores_externos.tipo = alianza).';

-- La pantalla separa las dos etapas en dos apartados: ese es el índice que
-- importa.
create index if not exists idx_colaboradores_etapa
  on public.colaboradores (etapa);

-- ── 2. Mover las alianzas ──────────────────────────────────────────────────
-- El teléfono entra como contacto (es lo que la pantalla usa para WhatsApp) y
-- lo que traían en "zona" se guarda en notas: en 4 de los 14 ese campo no era
-- una zona sino un recado completo ("Quieren que le digamos cuáles nos
-- interesan..."), y tirarlo sería perder lo único que se sabe del trato.
insert into public.colaboradores
  (nombre, contacto, en_app, etapa, relevancia, notas, created_at)
select
  a.nombre,
  nullif(btrim(coalesce(a.telefono, '')), ''),
  null,
  'por_entrar',
  0,
  nullif(btrim(concat_ws(' · ',
    'Venía de Asesores externos como alianza.',
    case when btrim(coalesce(a.zona, '')) <> '' then 'Zona/nota: ' || btrim(a.zona) end,
    case when coalesce(a.estado_mx, '') not in ('', 'Querétaro') then 'Estado: ' || a.estado_mx end
  )), ''),
  a.created_at
from public.asesores_externos a
where a.tipo = 'alianza'
  -- Idempotente: si ya existe un colaborador con ese mismo nombre, no se
  -- duplica (y el aviso del paso 3 se encarga de los parecidos).
  and not exists (
    select 1 from public.colaboradores c
     where lower(regexp_replace(c.nombre, '[^a-zA-Z0-9]', '', 'g'))
         = lower(regexp_replace(a.nombre, '[^a-zA-Z0-9]', '', 'g'))
  );

-- ── 3. Avisar de los posibles repetidos ────────────────────────────────────
-- "SUSANA DE URBANCD" contiene a "URBANCD", que ya está conectado. No se
-- juntan en automático: queda la nota para que se decida a mano.
update public.colaboradores pe
   set notas = concat_ws(' · ', nullif(btrim(coalesce(pe.notas, '')), ''),
         '⚠️ Puede ser el mismo que "' || c.nombre || '", que ya está en la lista.')
  from public.colaboradores c
 where pe.etapa = 'por_entrar'
   and c.etapa = 'colaborador'
   and length(lower(regexp_replace(c.nombre, '[^a-zA-Z0-9]', '', 'g'))) > 4
   and lower(regexp_replace(pe.nombre, '[^a-zA-Z0-9]', '', 'g'))
       like '%' || lower(regexp_replace(c.nombre, '[^a-zA-Z0-9]', '', 'g')) || '%'
   and coalesce(pe.notas, '') not like '%Puede ser el mismo%';

-- ── 4. Sacarlas de Asesores externos ───────────────────────────────────────
-- Se borran solo las que de verdad quedaron del otro lado. Sin esta
-- comprobación, un fallo del insert de arriba las dejaría sin lista.
delete from public.asesores_externos a
 where a.tipo = 'alianza'
   and exists (
     select 1 from public.colaboradores c
      where lower(regexp_replace(c.nombre, '[^a-zA-Z0-9]', '', 'g'))
          = lower(regexp_replace(a.nombre, '[^a-zA-Z0-9]', '', 'g'))
   );

-- ── REVERTIR ───────────────────────────────────────────────────────────────
-- delete from public.colaboradores where etapa = 'por_entrar';
-- insert into public.asesores_externos
--   select * from respaldo_asesores_externos_20261124
--    where tipo = 'alianza'
--      and id not in (select id from public.asesores_externos);
-- alter table public.colaboradores drop column etapa;

-- ── 5. Limpiar la nota de procedencia ──────────────────────────────────────
-- "Venía de Asesores externos como alianza." salía en las 14 filas, y la
-- etiqueta morada "Por entrar" ya dice exactamente eso. Se queda solo lo que
-- de verdad se sabe del trato (lo que traían escrito en la zona).
update public.colaboradores
   set notas = nullif(btrim(regexp_replace(
         notas, '^Venía de Asesores externos como alianza\.( · )?', '')), '')
 where etapa = 'por_entrar'
   and notas like 'Venía de Asesores externos como alianza.%';

-- ── 6. Avisar de los teléfonos repetidos ───────────────────────────────────
-- "Asesor Mingo" y "Domingo" traían el mismo número: casi seguro son la misma
-- persona dada de alta dos veces. No se juntan solas —los nombres no se
-- parecen y adivinar cuál se queda sería inventar— pero el aviso sale donde
-- se toma la decisión.
update public.colaboradores a
   set notas = concat_ws(' · ', nullif(btrim(coalesce(a.notas, '')), ''),
         '⚠️ Mismo teléfono que "' || b.nombre || '".')
  from public.colaboradores b
 where a.etapa = 'por_entrar'
   and b.id <> a.id
   and length(regexp_replace(coalesce(a.contacto, ''), '[^0-9]', '', 'g')) >= 10
   and right(regexp_replace(coalesce(a.contacto, ''), '[^0-9]', '', 'g'), 10)
     = right(regexp_replace(coalesce(b.contacto, ''), '[^0-9]', '', 'g'), 10)
   and coalesce(a.notas, '') not like '%Mismo teléfono que%';
