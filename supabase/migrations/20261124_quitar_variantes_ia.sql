-- Se quita el banco de versiones escritas por IA del camino de "copiar".
--
-- POR QUÉ
--
-- Al copiar una propiedad, la app no entregaba la descripción guardada sino
-- una versión reescrita por un modelo, distinta para cada persona, para que
-- Facebook no marcara los anuncios como duplicados. Nadie veía ese texto antes
-- de publicarlo: se copiaba al portapapeles ya sustituido.
--
-- Un modelo que REESCRIBE un texto agrega cosas que suenan bien. Medido hoy
-- sobre las 6,654 versiones del banco (2,474 propiedades, 9 modelos distintos
-- a lo largo del tiempo): 1,135 versiones —el 17%— afirman algo que la
-- propiedad no dice en ningún lado, 1,431 afirmaciones en 776 propiedades.
-- Las más repetidas: "áreas verdes" (264), "privada" (219), "comedor" (209),
-- "cocina integral" (120), "vestidor" (57), "gimnasio" (55), "vigilancia
-- 24 h" (53), "cochera techada" (48).
--
-- Reportado con la VR-2525: la propiedad dice "3 recámaras + sala de
-- televisión, 2.5 baños, 152 m² de terreno"; la versión que se copiaba decía
-- "recámara principal con vestidor", "comedor integrado", "cochera cubierta",
-- "acabados modernos", "seguridad 24/7" y "terreno 160 m²". Nada de eso
-- existe en la propiedad.
--
-- No es un modelo malo ni un prompt mal escrito: por el banco pasaron nueve
-- modelos y el patrón es el mismo. Prometer un gimnasio o una privada que no
-- existen manda a un cliente a una cita con un dato falso, y eso pesa más que
-- el duplicado de Facebook. En octubre ya se había parchado lo mismo con los
-- precios viejos (20261117_caducar_variantes_descripcion.sql): ese arreglo
-- solo atrapa datos que CAMBIARON, nunca datos INVENTADOS.
--
-- QUÉ QUEDA EN SU LUGAR
--
-- La variación por persona se arma ahora sin modelo, reacomodando los bloques
-- que la propia descripción ya trae (lib/variacion-descripcion.ts). Se
-- conservan todos los renglones tal cual: no se puede inventar nada porque no
-- se escribe nada.

-- 1) Que dejen de generarse. Primero los crons: si se borra el banco con los
--    crons vivos, en dos minutos empieza a llenarse de nuevo.
select cron.unschedule('generar-variantes-descripcion')
where exists (select 1 from cron.job where jobname = 'generar-variantes-descripcion');

select cron.unschedule('variantes-propiedades-nuevas')
where exists (select 1 from cron.job where jobname = 'variantes-propiedades-nuevas');

-- 2) Respaldo antes de borrar. No se tira: queda por si alguien quiere
--    revisar qué se estuvo publicando, y para poder medir el daño después.
create table if not exists public.respaldo_variantes_ia_20261124 as
  select * from public.propiedad_descripcion_variantes;

-- 3) Fuera del camino de copiar.
delete from public.propiedad_descripcion_variantes;

-- 4) La función se queda, pero devuelve NULL siempre.
--
--    No se borra porque los teléfonos que todavía no reciben la actualización
--    la siguen llamando: con la función viva reciben NULL y copian la
--    descripción guardada (que es lo correcto), y si se borrara recibirían un
--    error en cada propiedad que abren.
create or replace function public.variante_descripcion(p_propiedad_id uuid)
returns text
language sql immutable security definer set search_path to 'public' as $fn$
  select null::text
$fn$;

comment on function public.variante_descripcion(uuid) is
  'Retirada el 24/nov/2026. Devolvía una versión reescrita por IA para copiar; '
  'el 17% de esas versiones afirmaba amenidades que la propiedad no tiene. '
  'Devuelve NULL a propósito para que los clientes viejos copien la '
  'descripción guardada. Ver 20261124_quitar_variantes_ia.sql.';

comment on table public.propiedad_descripcion_variantes is
  'Vaciada y retirada el 24/nov/2026 (ver respaldo_variantes_ia_20261124). '
  'No volver a llenarla con texto generado: nadie revisa lo que se copia.';

-- 5) Fuera el parche de noviembre, que ya no tiene nada que cuidar.
--
--    tr_caducar_variantes_descripcion corría en CADA edición de una propiedad
--    para borrar las versiones que hubieran quedado con datos viejos. Con el
--    banco retirado se quedaría disparando contra una tabla vacía en cada
--    guardado. Si algún día se restaura el respaldo, el trigger está en
--    20261117_caducar_variantes_descripcion.sql.
drop trigger if exists tr_caducar_variantes_descripcion on public.propiedades;
drop function if exists public.fn_caducar_variantes_descripcion();
