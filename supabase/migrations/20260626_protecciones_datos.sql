-- ══════════════════════════════════════════════════════════════════
-- 1. AUDIT LOG PARA RECORDATORIOS
-- Permite recuperar seguimientos borrados accidentalmente.
-- Reutiliza la misma fn_audit_log() que ya audita clientes/propiedades.
-- ══════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS tr_audit_recordatorios ON public.recordatorios;
CREATE TRIGGER tr_audit_recordatorios
  AFTER INSERT OR UPDATE OR DELETE ON public.recordatorios
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- ══════════════════════════════════════════════════════════════════
-- 2. PAPELERA DE RECICLAJE (SOFT DELETE EN CLIENTES)
-- Borrar un cliente ahora marca eliminado_at en vez de destruir la fila.
-- Los recordatorios, notas e historial quedan intactos.
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS eliminado_at timestamptz DEFAULT NULL;

-- ══════════════════════════════════════════════════════════════════
-- 3. PROTEGER FECHAS MANUALES DE SEGUIMIENTO
-- El trigger sync_proximo_contacto ya no sobreescribe proximo_contacto
-- con la fecha de un recordatorio completado.
-- Antes: al completar un recordatorio, el trigger ponía MAX(fecha completada)
--        pisando la fecha que el asesor había puesto manualmente.
-- Ahora:  solo actualiza si hay recordatorios PENDIENTES; si no quedan
--        pendientes, deja la fecha manual intacta.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sync_proximo_contacto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cliente_id UUID;
  v_proxima    TIMESTAMPTZ;
BEGIN
  v_cliente_id := COALESCE(NEW.cliente_id, OLD.cliente_id);
  IF v_cliente_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT MIN(fecha_hora) INTO v_proxima
  FROM public.recordatorios
  WHERE cliente_id = v_cliente_id AND completado = false;

  IF v_proxima IS NOT NULL THEN
    UPDATE public.clientes
    SET proximo_contacto = v_proxima
    WHERE id = v_cliente_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
