-- Bloques automáticos: "Bloque Nuevos" y "Bloque Inhabilitados".
--   • Bloque Nuevos: usuarios creados desde el sábado 2026-08-15 en adelante.
--   • Bloque Inhabilitados: cuentas inhabilitadas (activo=false / inhabilitada_en).
-- Un trigger en profiles los asigna solo: al CREAR una cuenta cae en Nuevos; al
-- INHABILITARSE se mueve a Inhabilitados; al re-habilitarse sale de ahí. Las
-- asignaciones manuales a otros bloques se respetan (el trigger solo actúa al
-- crear y en las transiciones de habilitar/inhabilitar).

INSERT INTO public.bloques (nombre, orden)
  SELECT 'Bloque Nuevos', COALESCE((SELECT max(orden) FROM public.bloques), 0) + 1
  WHERE NOT EXISTS (SELECT 1 FROM public.bloques WHERE nombre = 'Bloque Nuevos');
INSERT INTO public.bloques (nombre, orden)
  SELECT 'Bloque Inhabilitados', COALESCE((SELECT max(orden) FROM public.bloques), 0) + 1
  WHERE NOT EXISTS (SELECT 1 FROM public.bloques WHERE nombre = 'Bloque Inhabilitados');

-- Backfill inicial (inhabilitados primero; nuevos que no estén inhabilitados).
UPDATE public.profiles SET bloque_id = (SELECT id FROM public.bloques WHERE nombre = 'Bloque Inhabilitados')
  WHERE activo = false OR inhabilitada_en IS NOT NULL;
UPDATE public.profiles SET bloque_id = (SELECT id FROM public.bloques WHERE nombre = 'Bloque Nuevos')
  WHERE created_at >= '2026-08-15' AND COALESCE(activo, true) = true AND inhabilitada_en IS NULL;

CREATE OR REPLACE FUNCTION public.fn_auto_bloque()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE v_nuevos uuid; v_inhab uuid; sabado timestamptz := '2026-08-15';
BEGIN
  SELECT id INTO v_inhab  FROM bloques WHERE nombre = 'Bloque Inhabilitados' LIMIT 1;
  SELECT id INTO v_nuevos FROM bloques WHERE nombre = 'Bloque Nuevos' LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    IF NEW.activo IS FALSE OR NEW.inhabilitada_en IS NOT NULL THEN
      NEW.bloque_id := v_inhab;
    ELSIF NEW.created_at >= sabado THEN
      NEW.bloque_id := COALESCE(NEW.bloque_id, v_nuevos);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.activo IS FALSE AND OLD.activo IS DISTINCT FROM NEW.activo)
       OR (NEW.inhabilitada_en IS NOT NULL AND OLD.inhabilitada_en IS NULL) THEN
      NEW.bloque_id := v_inhab;                      -- se inhabilitó
    ELSIF (NEW.activo IS TRUE AND OLD.activo IS DISTINCT FROM NEW.activo)
       OR (NEW.inhabilitada_en IS NULL AND OLD.inhabilitada_en IS NOT NULL) THEN
      IF NEW.bloque_id = v_inhab THEN                -- se re-habilitó
        NEW.bloque_id := CASE WHEN NEW.created_at >= sabado THEN v_nuevos ELSE NULL END;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $func$;

DROP TRIGGER IF EXISTS tr_auto_bloque ON public.profiles;
CREATE TRIGGER tr_auto_bloque BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_bloque();
