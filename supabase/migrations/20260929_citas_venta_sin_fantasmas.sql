-- Al borrar una cita de coordinación quedaba un fantasma en la tabla de citas
-- de venta.
--
-- La clave foránea es ON DELETE SET NULL:
--
--   citas_venta_cita_coordinacion_id_fkey
--     FOREIGN KEY (cita_coordinacion_id) REFERENCES citas_coordinacion(id)
--     ON DELETE SET NULL
--
-- Así que al borrar la cita, su fila en citas_venta NO se iba: se quedaba con
-- el vínculo en NULL. Y como el trigger de sincronización busca las filas por
-- cita_coordinacion_id, esa fila quedaba fuera de su alcance para siempre: no
-- se actualizaba, no se borraba y no había forma de que volviera a cuadrar.
--
-- El efecto que se veía: si alguien borraba la cita y la volvía a crear, la
-- tabla mostraba la misma cita DOS veces. La copia vieja se quedaba congelada,
-- normalmente sin "interesado en", que es lo que delataba cuál era el fantasma.
-- Pasó con Reyna Concepción y con Antonio Madero.
--
-- Se añade un trigger que, ANTES de borrar la cita, se lleva su fila. Usa la
-- misma condición que ya aplica el trigger de sincronización cuando una cita
-- deja de calificar: no toca las de origen 'retro_admin' ni las que ya tienen
-- retroalimentación, porque ahí hay trabajo del asesor que no se debe perder.
-- Esas siguen quedándose huérfanas a propósito, que es lo correcto: vale más
-- conservar la retro que la cita que la originó.

CREATE OR REPLACE FUNCTION public.fn_citas_venta_al_borrar_cita()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  DELETE FROM public.citas_venta
   WHERE cita_coordinacion_id = OLD.id
     AND COALESCE(origen, '') <> 'retro_admin'
     AND retro_completada_at IS NULL;
  RETURN OLD;
END $fn$;

DROP TRIGGER IF EXISTS tr_citas_venta_al_borrar_cita ON public.citas_coordinacion;
CREATE TRIGGER tr_citas_venta_al_borrar_cita
  BEFORE DELETE ON public.citas_coordinacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_citas_venta_al_borrar_cita();

-- Limpieza de los fantasmas que ya estaban. Solo los que vinieron del trigger
-- ('dashboard') y perdieron su cita: las filas de 'excel' y 'manual' tienen el
-- vínculo en NULL por naturaleza, nunca salieron de una cita de coordinación.
-- Se guardan antes por si hubiera que devolverlos.
CREATE TABLE IF NOT EXISTS public.citas_venta_fantasmas_20260924 AS
  SELECT * FROM public.citas_venta
   WHERE origen = 'dashboard' AND cita_coordinacion_id IS NULL
     AND retro_completada_at IS NULL;

DELETE FROM public.citas_venta
 WHERE origen = 'dashboard' AND cita_coordinacion_id IS NULL
   AND retro_completada_at IS NULL;
