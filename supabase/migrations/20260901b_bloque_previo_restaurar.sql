-- Al inhabilitar una cuenta se mueve a "Bloque Inhabilitados", pero antes se
-- GUARDA su bloque original en bloque_id_previo; al re-habilitarla se RESTAURA
-- ese bloque (en vez de mandarla a "Nuevos"/null). Así regresa a donde estaba.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bloque_id_previo uuid;

CREATE OR REPLACE FUNCTION public.fn_auto_bloque()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_nuevos uuid; v_inhab uuid; sabado timestamptz := '2026-08-15';
begin
  select id into v_inhab  from bloques where nombre = 'Bloque Inhabilitados' limit 1;
  select id into v_nuevos from bloques where nombre = 'Bloque Nuevos' limit 1;

  if TG_OP = 'INSERT' then
    if NEW.activo is false or NEW.inhabilitada_en is not null then
      NEW.bloque_id := v_inhab;
    elsif NEW.created_at >= sabado then
      NEW.bloque_id := coalesce(NEW.bloque_id, v_nuevos);
    end if;

  elsif TG_OP = 'UPDATE' then
    -- Se INHABILITA: guardar el bloque actual (si no es ya Inhabilitados) y mover
    -- a "Bloque Inhabilitados".
    if (NEW.activo is false and OLD.activo is distinct from NEW.activo)
       or (NEW.inhabilitada_en is not null and OLD.inhabilitada_en is null) then
      if OLD.bloque_id is distinct from v_inhab then
        NEW.bloque_id_previo := OLD.bloque_id;
      end if;
      NEW.bloque_id := v_inhab;

    -- Se RE-HABILITA: regresar al bloque donde estaba (bloque_id_previo). Si no
    -- hay guardado, cae al default por antigüedad (Nuevos si es reciente, si no null).
    elsif (NEW.activo is true and OLD.activo is distinct from NEW.activo)
       or (NEW.inhabilitada_en is null and OLD.inhabilitada_en is not null) then
      if NEW.bloque_id = v_inhab then
        NEW.bloque_id := coalesce(
          NEW.bloque_id_previo,
          case when NEW.created_at >= sabado then v_nuevos else null end
        );
      end if;
      NEW.bloque_id_previo := null;   -- ya restaurado
    end if;
  end if;

  return NEW;
end $function$;
