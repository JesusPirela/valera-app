-- FIX: seguimientos "vencidos" que no se van aunque el asesor ya atendió al
-- cliente. La tabla `recordatorios` (que alimenta el nudge de "necesita
-- seguimiento" y las notificaciones) quedaba desconectada del estado del cliente:
--   · Un cliente DESCARTADO/COMPRÓ seguía con recordatorios abiertos → vencido.
--   · Reagendar (proximo_contacto a futuro) no cerraba el recordatorio viejo.
--
-- Solución: al actualizar el cliente, resolver automáticamente los recordatorios
-- que ya no aplican y marcar leídas sus notificaciones de recordatorio.

CREATE OR REPLACE FUNCTION public.resolver_recordatorios_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Estado terminal → ya no hay que seguirlo: completar TODOS sus pendientes.
  IF NEW.estado IN ('descartado', 'compro', 'compro_externo')
     AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    UPDATE public.recordatorios SET completado = true
     WHERE cliente_id = NEW.id AND completado = false;
    UPDATE public.notificaciones SET leida = true
     WHERE cliente_id = NEW.id AND tipo = 'recordatorio' AND leida = false;

  -- Reagendado: proximo_contacto movido al futuro → el asesor ya definió cuándo
  -- lo vuelve a contactar; se cierran los recordatorios VENCIDOS.
  ELSIF NEW.proximo_contacto IS DISTINCT FROM OLD.proximo_contacto
        AND NEW.proximo_contacto IS NOT NULL
        AND NEW.proximo_contacto > now() THEN
    UPDATE public.recordatorios SET completado = true
     WHERE cliente_id = NEW.id AND completado = false AND fecha_hora < now();
    UPDATE public.notificaciones SET leida = true
     WHERE cliente_id = NEW.id AND tipo = 'recordatorio' AND leida = false;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_resolver_recordatorios ON public.clientes;
CREATE TRIGGER trg_resolver_recordatorios
  AFTER UPDATE OF estado, proximo_contacto ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.resolver_recordatorios_cliente();

-- ── Limpieza única de lo ya acumulado ──────────────────────────────────────
-- 1. Clientes en estado terminal: completar todos sus recordatorios pendientes.
UPDATE public.recordatorios r SET completado = true
  FROM public.clientes c
 WHERE r.cliente_id = c.id AND r.completado = false
   AND c.estado IN ('descartado', 'compro', 'compro_externo');

-- 2. Clientes reagendados a futuro: completar sus recordatorios ya vencidos.
UPDATE public.recordatorios r SET completado = true
  FROM public.clientes c
 WHERE r.cliente_id = c.id AND r.completado = false AND r.fecha_hora < now()
   AND c.proximo_contacto IS NOT NULL AND c.proximo_contacto > now();

-- 3. Marcar leídas las notificaciones de recordatorio de clientes terminales.
UPDATE public.notificaciones n SET leida = true
 WHERE n.tipo = 'recordatorio' AND n.leida = false
   AND n.cliente_id IN (
     SELECT id FROM public.clientes WHERE estado IN ('descartado', 'compro', 'compro_externo')
   );
