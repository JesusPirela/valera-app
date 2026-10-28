-- ══════════════════════════════════════════════════════════════════════════════
-- La pantalla de clientes ya ofrece "Captación" como tipo de operación desde
-- hace tiempo (venta / renta / captación), pero el CHECK de la tabla nunca se
-- actualizó para permitirlo — solo dejaba pasar 'venta' y 'renta'. Por eso
-- fallaba al guardar un cliente con "Captación".
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_tipo_operacion_check;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_tipo_operacion_check
  CHECK (tipo_operacion = ANY (ARRAY['venta'::text, 'renta'::text, 'captacion'::text]));

SELECT pg_notify('pgrst', 'reload schema');
