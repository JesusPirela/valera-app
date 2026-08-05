-- Historial de cambio de precio en propiedades.
-- Permite mostrar badge "Precio reducido" en el listado y ficha cuando el
-- admin baja el precio: precio_anterior guarda el último precio antes del
-- cambio; el badge aparece en la UI cuando precio < precio_anterior.

ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS precio_anterior NUMERIC,
  ADD COLUMN IF NOT EXISTS precio_actualizado_at TIMESTAMPTZ;

-- Actualiza precio_anterior cada vez que el precio cambia.
CREATE OR REPLACE FUNCTION public.trg_fn_track_precio()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.precio IS DISTINCT FROM NEW.precio THEN
    NEW.precio_anterior      := OLD.precio;
    NEW.precio_actualizado_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_precio ON public.propiedades;
CREATE TRIGGER trg_track_precio
  BEFORE UPDATE ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_track_precio();
