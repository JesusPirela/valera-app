-- Elimina el auto-destacado por tráfico de visualizaciones/descargas.
-- La función destacar_propiedad_manual() y su RPC se mantienen para
-- que el admin pueda destacar manualmente desde el panel.

DROP TRIGGER IF EXISTS trigger_actividad_destacar ON propiedad_actividad;
DROP FUNCTION IF EXISTS public.check_actividad_destacar();

SELECT pg_notify('pgrst', 'reload schema');
