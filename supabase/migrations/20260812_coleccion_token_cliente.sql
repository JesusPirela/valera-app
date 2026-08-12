-- Historial de colecciones: saber de QUÉ colección se registró cada cliente.
-- Cuando alguien llena el formulario de una colección compartida, el edge
-- function registrar-lead-formulario guarda aquí el token de la colección, para
-- que en el detalle de la colección se listen "los clientes que se registraron aquí".

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS coleccion_token text;
CREATE INDEX IF NOT EXISTS idx_clientes_coleccion_token
  ON public.clientes (coleccion_token) WHERE coleccion_token IS NOT NULL;
