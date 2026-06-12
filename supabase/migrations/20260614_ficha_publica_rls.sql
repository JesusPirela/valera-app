-- Permite al rol anon (visitantes sin cuenta) leer propiedades disponibles
-- y sus imágenes. Necesario para la ficha pública compartible (/ficha/[codigo]).

-- propiedades: anon puede leer filas con estado = 'disponible'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='propiedades' AND policyname='propiedades_anon_disponibles'
  ) THEN
    CREATE POLICY "propiedades_anon_disponibles"
      ON public.propiedades
      FOR SELECT
      TO anon
      USING (estado = 'disponible');
  END IF;
END $$;

-- propiedad_imagenes: anon puede leer imágenes de propiedades disponibles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='propiedad_imagenes' AND policyname='imagenes_anon_disponibles'
  ) THEN
    CREATE POLICY "imagenes_anon_disponibles"
      ON public.propiedad_imagenes
      FOR SELECT
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM public.propiedades p
          WHERE p.id = propiedad_imagenes.propiedad_id
            AND p.estado = 'disponible'
        )
      );
  END IF;
END $$;
