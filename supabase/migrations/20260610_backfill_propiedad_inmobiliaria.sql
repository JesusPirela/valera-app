-- =========================================================
-- Backfill: asignar inmobiliaria_id a propiedades existentes
-- a partir del asesor asignado (asesor_id -> asesores.inmobiliaria)
-- =========================================================

UPDATE propiedades p
SET inmobiliaria_id = i.id
FROM asesores a
JOIN inmobiliarias i ON lower(trim(i.nombre)) = lower(trim(a.inmobiliaria))
WHERE p.asesor_id = a.id
  AND p.inmobiliaria_id IS NULL
  AND a.inmobiliaria IS NOT NULL AND trim(a.inmobiliaria) <> '';

SELECT pg_notify('pgrst', 'reload schema');
