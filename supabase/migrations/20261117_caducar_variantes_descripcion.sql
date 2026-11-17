-- Cuando cambian los datos que la versión describe, sus versiones caducan.
--
-- El problema que esto arregla: el banco de versiones (propiedad_descripcion_
-- variantes) se genera UNA vez, con los datos de ese momento. Si después se
-- corrige el precio, la versión se queda con el viejo — y como al copiar se
-- entrega la versión y no la descripción guardada, la gente acababa publicando
-- un precio que ya no existe.
--
-- Medido el 17/nov/2026: 65 versiones de 28 propiedades traían un precio que
-- ya no era. La VR-2110 decía $1,370,000 cuando la propiedad costaba
-- $1,565,000, y así se reportó: "la descripción está hecha pero cuando copias
-- el texto dice otra totalmente distinta".
--
-- Se BORRAN en vez de intentar corregirlas: el cron de
-- variantes-descripcion-lote las vuelve a generar con los datos de ahora, y
-- mientras tanto variante_descripcion() devuelve NULL y la app copia la
-- descripción guardada, que siempre está al día. Nunca se queda sin nada que
-- copiar.
create or replace function public.fn_caducar_variantes_descripcion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.precio           is distinct from OLD.precio
  or NEW.descripcion      is distinct from OLD.descripcion
  or NEW.titulo           is distinct from OLD.titulo
  or NEW.operacion        is distinct from OLD.operacion
  or NEW.tipo             is distinct from OLD.tipo
  or NEW.recamaras        is distinct from OLD.recamaras
  or NEW.banos            is distinct from OLD.banos
  or NEW.medios_banos     is distinct from OLD.medios_banos
  or NEW.m2               is distinct from OLD.m2
  or NEW.m2_terreno       is distinct from OLD.m2_terreno
  or NEW.estacionamientos is distinct from OLD.estacionamientos
  then
    delete from public.propiedad_descripcion_variantes where propiedad_id = NEW.id;
  end if;
  return NEW;
end $$;

drop trigger if exists tr_caducar_variantes_descripcion on public.propiedades;

create trigger tr_caducar_variantes_descripcion
  after update on public.propiedades
  for each row execute function public.fn_caducar_variantes_descripcion();
