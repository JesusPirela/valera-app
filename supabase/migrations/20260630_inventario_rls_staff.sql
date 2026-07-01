-- Ampliar acceso a inventario: supervisor y asesor también pueden ver es_inventario=true
-- (antes solo admin podía verlo, lo que impedía que el mapa de lonas funcionara para esos roles)

DROP POLICY IF EXISTS "propiedades_select_all" ON public.propiedades;
CREATE POLICY "propiedades_select_all" ON public.propiedades
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      es_inventario = false
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'supervisor', 'asesor')
      )
    )
  );

SELECT pg_notify('pgrst', 'reload schema');
