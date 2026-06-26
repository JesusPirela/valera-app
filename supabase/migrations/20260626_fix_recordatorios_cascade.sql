-- PROBLEMA: recordatorios.cliente_id tenía ON DELETE CASCADE, por lo que
-- borrar un cliente eliminaba silenciosamente todos sus seguimientos completados.
-- FIX: cambiar a ON DELETE SET NULL para preservar el historial de actividad.

ALTER TABLE public.recordatorios
  ALTER COLUMN cliente_id DROP NOT NULL;

ALTER TABLE public.recordatorios
  DROP CONSTRAINT IF EXISTS recordatorios_cliente_id_fkey;

ALTER TABLE public.recordatorios
  ADD CONSTRAINT recordatorios_cliente_id_fkey
    FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;
