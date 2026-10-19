-- ══════════════════════════════════════════════════════════════════════════════
-- Estado 'borrador': propiedades ya subidas (fotos, descripción, specs) pero
-- SIN precio todavía — se suben por adelantado pero quedan ocultas para los
-- prospectadores hasta que alguien les ponga precio.
--
-- Último CHECK de propiedades.estado (20260928_estado_rentada.sql):
--   CHECK (estado = ANY (ARRAY['disponible', 'vendida', 'rentada']))
-- Se parte de ESE, no del original, para no perder 'rentada'.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.propiedades DROP CONSTRAINT IF EXISTS propiedades_estado_check;
ALTER TABLE public.propiedades ADD CONSTRAINT propiedades_estado_check
  CHECK (estado = ANY (ARRAY['disponible'::text, 'vendida'::text, 'rentada'::text, 'borrador'::text]));

-- En cuanto se le pone precio a una propiedad en borrador, se promueve sola a
-- 'disponible' — no hace falta que el admin se acuerde de cambiar el estado a
-- mano, solo captura el precio y guarda.
CREATE OR REPLACE FUNCTION public.promover_borrador_con_precio()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'borrador' AND NEW.precio IS NOT NULL AND NEW.precio > 0 THEN
    NEW.estado := 'disponible';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promover_borrador_con_precio ON public.propiedades;
CREATE TRIGGER trg_promover_borrador_con_precio
  BEFORE INSERT OR UPDATE ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.promover_borrador_con_precio();

SELECT pg_notify('pgrst', 'reload schema');
