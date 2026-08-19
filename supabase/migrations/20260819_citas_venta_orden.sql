-- Orden explícito para conservar el mismo orden del CSV al importar.
ALTER TABLE public.citas_venta ADD COLUMN IF NOT EXISTS orden int;
CREATE INDEX IF NOT EXISTS idx_citas_venta_orden ON public.citas_venta (orden);
