-- Fix: sync_proximo_contacto borraba proximo_contacto cuando todos los
-- recordatorios estaban completados (resultado = NULL). El usuario quiere
-- seguir viendo la fecha aunque el recordatorio ya haya pasado.
-- Nueva lógica:
--   1. Si hay recordatorios PENDIENTES → fecha del más próximo
--   2. Si NO hay pendientes pero sí completados → fecha del más reciente
--   3. Si no hay ningún recordatorio → no tocar (dejar el valor manual)

CREATE OR REPLACE FUNCTION public.sync_proximo_contacto()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cliente_id UUID;
  v_proxima    TIMESTAMPTZ;
BEGIN
  v_cliente_id := COALESCE(NEW.cliente_id, OLD.cliente_id);

  -- Prioridad 1: siguiente recordatorio pendiente
  SELECT MIN(fecha_hora) INTO v_proxima
  FROM public.recordatorios
  WHERE cliente_id = v_cliente_id AND completado = false;

  -- Si no hay pendientes, mostrar el recordatorio más reciente (completado)
  IF v_proxima IS NULL THEN
    SELECT MAX(fecha_hora) INTO v_proxima
    FROM public.recordatorios
    WHERE cliente_id = v_cliente_id;
  END IF;

  -- Solo actualizar si encontramos algún recordatorio (no borrar fechas manuales)
  IF v_proxima IS NOT NULL THEN
    UPDATE public.clientes
    SET proximo_contacto = v_proxima
    WHERE id = v_cliente_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Restaurar fechas borradas por el sync anterior:
-- Para clientes con proximo_contacto = NULL pero que tienen recordatorios
-- (completados o no), poner la fecha del recordatorio más reciente.
UPDATE public.clientes c
SET proximo_contacto = (
  SELECT MAX(r.fecha_hora)
  FROM public.recordatorios r
  WHERE r.cliente_id = c.id
)
WHERE c.proximo_contacto IS NULL
  AND EXISTS (
    SELECT 1 FROM public.recordatorios r WHERE r.cliente_id = c.id
  );
