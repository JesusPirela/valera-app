-- FIX: el trigger fn_citas_venta_desde_coordinacion inserta en citas_venta con
-- ON CONFLICT (cita_coordinacion_id), pero la columna no tenía UNIQUE constraint.
-- Resultado: error "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification" al crear cualquier cita desde coordinacion-citas.
ALTER TABLE public.citas_venta
  ADD CONSTRAINT citas_venta_cita_coordinacion_id_key UNIQUE (cita_coordinacion_id);
