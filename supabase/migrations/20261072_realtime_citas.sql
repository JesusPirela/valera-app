-- Que la tabla de Citas de venta se actualice sola cuando alguien más cambia
-- algo.
--
-- Realtime en Supabase necesita dos cosas: que la app se suscriba, y que la
-- tabla esté publicada. Faltaban las dos para citas_venta.
--
-- Y de paso una que ya estaba rota: el tablero de coordinación de citas SÍ se
-- suscribe a citas_coordinacion desde hace tiempo (coordinacion-citas.tsx), pero
-- esa tabla nunca se publicó, así que esa suscripción no disparaba nunca. Se
-- veía como "a veces no se actualiza", y en realidad no se actualizaba jamás
-- salvo al recargar.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'citas_venta'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.citas_venta;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'citas_coordinacion'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.citas_coordinacion;
  END IF;
END $$;

-- Para que al BORRAR una fila el aviso traiga algo más que el id: sin esto,
-- `old` llega solo con la llave primaria y la pantalla no puede saber cuál
-- quitar si la busca por otra cosa.
ALTER TABLE public.citas_venta REPLICA IDENTITY FULL;
