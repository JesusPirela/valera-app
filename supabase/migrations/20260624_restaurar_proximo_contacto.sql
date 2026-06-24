-- Restaurar proximo_contacto borrados accidentalmente.
-- Clientes con proximo_contacto = NULL pero que tienen recordatorios:
--   → si hay pendientes: usar el más próximo (MIN)
--   → si solo hay completados: usar el más reciente (MAX)
UPDATE public.clientes c
SET proximo_contacto = (
  COALESCE(
    -- Pendiente más próximo
    (SELECT MIN(r.fecha_hora) FROM public.recordatorios r
     WHERE r.cliente_id = c.id AND r.completado = false),
    -- Si no hay pendientes, el más reciente completado
    (SELECT MAX(r.fecha_hora) FROM public.recordatorios r
     WHERE r.cliente_id = c.id)
  )
)
WHERE c.proximo_contacto IS NULL
  AND EXISTS (
    SELECT 1 FROM public.recordatorios r WHERE r.cliente_id = c.id
  );
