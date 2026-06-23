-- ══════════════════════════════════════════════════════════════════════════════
-- Sincronizar clientes.proximo_contacto con el próximo recordatorio pendiente
--
-- Problema: cuando el usuario crea un recordatorio o lo marca como completado,
-- la columna proximo_contacto del cliente NO se actualizaba, por lo que la
-- vista de tabla CRM seguía mostrando la fecha anterior (aparentemente "borrando"
-- el seguimiento marcado).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_proximo_contacto()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cliente_id UUID;
  v_proxima    TIMESTAMPTZ;
BEGIN
  v_cliente_id := COALESCE(NEW.cliente_id, OLD.cliente_id);

  SELECT MIN(fecha_hora) INTO v_proxima
  FROM public.recordatorios
  WHERE cliente_id = v_cliente_id
    AND completado = false;

  UPDATE public.clientes
  SET proximo_contacto = v_proxima
  WHERE id = v_cliente_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_proximo_contacto ON public.recordatorios;
CREATE TRIGGER tr_sync_proximo_contacto
  AFTER INSERT OR UPDATE OR DELETE ON public.recordatorios
  FOR EACH ROW EXECUTE FUNCTION public.sync_proximo_contacto();

-- Sincronización inicial: corregir proximo_contacto para todos los clientes
-- basándose en sus recordatorios pendientes actuales.
UPDATE public.clientes c
SET proximo_contacto = (
  SELECT MIN(r.fecha_hora)
  FROM public.recordatorios r
  WHERE r.cliente_id = c.id AND r.completado = false
);
