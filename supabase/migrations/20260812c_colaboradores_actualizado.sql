-- Botón "Marcar actualizado" en Colaboradores: registra CUÁNDO se subió/actualizó
-- el catálogo de ese colaborador, distinto de `updated_at` (que cambia con
-- cualquier edición del registro, no solo con esta acción específica).
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS actualizado_at timestamptz;

SELECT pg_notify('pgrst', 'reload schema');
