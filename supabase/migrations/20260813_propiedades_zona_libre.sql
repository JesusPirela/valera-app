-- Permite escribir cualquier zona (no solo queretaro/monterrey/puebla) al
-- crear/editar una propiedad. El picker del admin ya soporta "Otra…" con
-- texto libre, pero el guardado fallaba con:
--   "new row for relation "propiedades" violates check constraint
--    "propiedades_zona_check""
-- porque la columna tenía un CHECK limitando los valores permitidos.
ALTER TABLE public.propiedades DROP CONSTRAINT IF EXISTS propiedades_zona_check;
