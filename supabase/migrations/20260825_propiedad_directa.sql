-- Agrega la columna `directa` a propiedades.
-- Una propiedad directa es de trato directo con el propietario/desarrollador.
-- Solo visible/editable por admins; los prospectadores la ven pero no saben el flag.
ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS directa BOOLEAN NOT NULL DEFAULT FALSE;

SELECT pg_notify('pgrst', 'reload schema');
