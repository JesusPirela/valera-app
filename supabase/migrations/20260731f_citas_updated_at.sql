-- FIX: "Nd sin movimiento" en el apartado de citas no se reseteaba al cambiar
-- algo. "Días sin movimiento" se calcula desde citas_coordinacion.updated_at,
-- pero la tabla NO tenía trigger de updated_at: el default now() solo aplica al
-- INSERT, y los UPDATE (cambiar estado, mover, etc.) no lo tocaban. Así el
-- contador quedaba congelado en su valor viejo aunque el usuario moviera la cita.
--
-- Solución: trigger BEFORE UPDATE que refresca updated_at en cada cambio.
CREATE OR REPLACE FUNCTION public.citas_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_citas_updated_at ON public.citas_coordinacion;
CREATE TRIGGER trg_citas_updated_at
  BEFORE UPDATE ON public.citas_coordinacion
  FOR EACH ROW EXECUTE FUNCTION public.citas_set_updated_at();
